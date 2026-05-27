import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { cpus, freemem, homedir, loadavg, platform, totalmem, uptime } from 'node:os';
import path from 'node:path';

const env = loadEnv();
const port = Number(env.AURA_AGENT_PORT || 4777);
const roots = new Set([path.resolve(homedir()), path.resolve(process.cwd()), '/tmp']);
const shellAllow = new Set(['pwd', 'ls', 'date', 'whoami', 'uname', 'df', 'free', 'uptime']);

function loadEnv() {
  const out = { ...process.env };
  try {
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      const clean = line.trim();
      if (!clean || clean.startsWith('#') || !clean.includes('=')) continue;
      const [key, ...rest] = clean.split('=');
      out[key] = rest.join('=');
    }
  } catch {}
  return out;
}

function send(res, code, data, origin) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin || 'http://localhost:5173',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function resolveSafe(input = '~') {
  const expanded = input === '~' || input.startsWith('~/') ? path.join(homedir(), input.slice(2)) : input;
  const full = path.resolve(expanded);
  if (![...roots].some((root) => full === root || full.startsWith(`${root}${path.sep}`))) {
    throw new Error('Path outside allowed roots');
  }
  return full;
}

function run(bin, args = []) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: 10000 }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: stdout.trim(), stderr: stderr.trim(), error: error?.message || '' });
    });
  });
}

async function listFiles(target = '~') {
  const full = resolveSafe(target);
  const rows = await Promise.all(
    (await readdir(full)).slice(0, 200).map(async (name) => {
      const item = path.join(full, name);
      const info = await stat(item);
      return {
        name,
        path: item,
        type: info.isDirectory() ? 'dir' : 'file',
        size: info.size,
        modified: info.mtimeMs,
      };
    }),
  );
  return { path: full, parent: path.dirname(full), entries: rows.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)) };
}

function metrics() {
  return {
    platform: platform(),
    cpu: cpus()[0]?.model || 'CPU',
    cores: cpus().length,
    load: loadavg()[0],
    ramFreeMb: Math.round(freemem() / 1024 / 1024),
    ramTotalMb: Math.round(totalmem() / 1024 / 1024),
    uptimeSec: Math.round(uptime()),
  };
}

async function openTarget(target) {
  const full = target.startsWith('http') ? target : resolveSafe(target);
  if (platform() === 'darwin') await run('open', [full]);
  else if (platform() === 'win32') await run('cmd', ['/c', 'start', '', full]);
  else await run('xdg-open', [full]);
  return { message: `Opened ${full}` };
}

async function shell(command) {
  const parts = String(command || '').trim().split(/\s+/).filter(Boolean);
  const bin = parts[0];
  if (!shellAllow.has(bin)) return { ok: false, output: `Blocked command: ${bin}. Allowed: ${[...shellAllow].join(', ')}` };
  const result = await run(bin, parts.slice(1));
  return { ok: result.ok, output: result.stdout || result.stderr || result.error };
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in a local directory on the host machine',
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'Path to list, e.g., ~ or ~/Downloads' } }, required: ['path'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_metrics',
      description: 'Get host machine hardware metrics (CPU, RAM, OS)',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'shell_command',
      description: 'Run a shell command on the host machine (only safe commands like ls, pwd, date, whoami, uname, df, free, uptime)',
      parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_target',
      description: 'Open a local file, directory, or URL using the host machine\'s default application',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write text content to a new or existing file on the host machine',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to write the file to, e.g., ~/Documents/pancake_ingredients.txt' },
          content: { type: 'string', description: 'The text content to write into the file' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'frontend_action',
      description: 'Instruct the Browser OS frontend to perform an action (e.g. open a virtual app, set wallpaper, create widget)',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['openApp', 'setWallpaper', 'setBrightness', 'createWidget'] },
          payload: { type: 'string', description: 'App ID (finder, terminal, notes, browser, calculator, settings), value for setting, or widget type (weather)' },
          url: { type: 'string', description: 'URL to open if action is openApp and payload is browser' },
          data: { type: 'object', description: 'Data for the widget if action is createWidget (e.g., { temp: "30", desc: "Sunny", location: "New Delhi" })' }
        },
        required: ['action', 'payload']
      }
    }
  }
];

async function agentLoop(userPrompt, context) {
  if (!env.GROQ_API_KEY) return { message: 'AI key missing in .env', frontendActions: [] };
  
  let messages = [
    { role: 'system', content: 'You are AuraAI, an intelligent agent controlling both a simulated browser OS and bridging to the user\'s local host machine. You can use tools to read local files, check hardware, and run shell commands. You can also trigger frontend actions like opening virtual apps (finder, terminal, settings, etc). Be concise. Use tools ONLY to fulfill the user\'s specific requests. Do NOT use any tools if the user just says "hi" or asks a general question. If the user wants to see files, you can use frontend_action openApp finder. You can only use allowed shell commands.' },
    { role: 'user', content: userPrompt }
  ];

  let frontendActions = [];
  
  for (let i = 0; i < 5; i++) { // Max 5 iterations
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages,
        tools,
        tool_choice: 'auto',
        max_tokens: 1024,
        temperature: 0.2,
      }),
    });
    
    if (!res.ok) return { message: `Groq failed: ${res.status}`, frontendActions };
    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) return { message: 'No AI reply', frontendActions };
    
    messages.push(msg);

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        let resultData = '';
        try {
          const args = JSON.parse(tc.function.arguments || '{}');
          if (tc.function.name === 'list_files') {
            const res = await listFiles(args.path);
            resultData = JSON.stringify(res.entries.slice(0, 50).map(e => e.name));
          } else if (tc.function.name === 'get_metrics') {
            resultData = JSON.stringify(metrics());
          } else if (tc.function.name === 'shell_command') {
            const res = await shell(args.command);
            resultData = JSON.stringify(res);
          } else if (tc.function.name === 'open_target') {
            const res = await openTarget(args.path);
            resultData = JSON.stringify(res);
          } else if (tc.function.name === 'write_file') {
            const fullPath = resolveSafe(args.path);
            await writeFile(fullPath, args.content, 'utf8');
            resultData = `Successfully wrote file to ${fullPath}`;
          } else if (tc.function.name === 'frontend_action') {
            frontendActions.push({ action: args.action, payload: args.payload, url: args.url, data: args.data });
            resultData = `Frontend action queued: ${args.action} ${args.payload}`;
          } else {
            resultData = 'Unknown tool';
          }
        } catch (err) {
          resultData = `Error: ${err.message}`;
        }
        messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: String(resultData) || 'success' });
      }
    } else {
      return { message: msg.content || 'Task complete', frontendActions };
    }
  }
  return { message: 'Agent loop limit reached', frontendActions };
}

createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (req.method === 'OPTIONS') return send(res, 204, {}, origin);
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/health') return send(res, 200, { ok: true, groq: Boolean(env.GROQ_API_KEY), roots: [...roots] }, origin);
    if (url.pathname === '/metrics') return send(res, 200, metrics(), origin);
    if (url.pathname === '/files') return send(res, 200, await listFiles(url.searchParams.get('path') || '~'), origin);
    if (url.pathname === '/open' && req.method === 'POST') return send(res, 200, await openTarget((await readBody(req)).path), origin);
    if (url.pathname === '/shell' && req.method === 'POST') return send(res, 200, await shell((await readBody(req)).command), origin);
    if (url.pathname === '/command' && req.method === 'POST') {
      const { command, context } = await readBody(req);
      const agentResult = await agentLoop(command, context);
      return send(res, 200, agentResult, origin);
    }
    return send(res, 404, { error: 'Not found' }, origin);
  } catch (error) {
    return send(res, 500, { error: error.message }, origin);
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`AuraOS bridge ready at http://127.0.0.1:${port}`);
});
