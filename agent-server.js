import express from 'express';
import Groq from 'groq-sdk';
import { exec, execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readdir, stat, writeFile, readFile, mkdir } from 'node:fs/promises';
import { cpus, freemem, homedir, loadavg, platform, totalmem, uptime } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createServer } from 'node:http';
import { SyncEngine } from './sync-engine.js';

const env = loadEnv();
const groq = new Groq({ apiKey: env.GROQ_API_KEY });

const app = express();
const port = Number(env.AURA_AGENT_PORT || 4777);
const defaultRoots = [
  homedir(),
  process.cwd(),
  '/tmp',
  '/storage/emulated/0',
  '/sdcard',
  '/mnt/sdcard',
].filter(Boolean);
const envRoots = String(env.AURA_ALLOWED_ROOTS || '')
  .split(',')
  .map((root) => root.trim())
  .filter(Boolean);
const roots = new Set([...defaultRoots, ...envRoots].map((root) => path.resolve(root)).filter((root) => root === '/tmp' || existsSync(root)));
// Full shell access granted by user request

function loadEnv() {
  const out = { ...process.env };
  try {
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      const clean = line.trim();
      if (!clean || clean.startsWith('#') || !clean.includes('=')) continue;
      const [key, ...rest] = clean.split('=');
      if (out[key] === undefined) out[key] = rest.join('=');
    }
  } catch { }
  return out;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Sync Engine Setup ────────────────────────────────────
const syncEngine = new SyncEngine({
  account: env.AURA_ACCOUNT || 'default',
  deviceName: env.DEVICE_NAME || `${process.env.USER || 'User'}'s ${platform() === 'darwin' ? 'Mac' : 'PC'}`,
});

// Start watching files
syncEngine.startWatching();

// Log sync events
syncEngine.on((event, data) => {
  if (event === 'file_changed') {
    console.log(`📝 [Sync] ${data.event}: ${data.virtualPath}`);
    // Forward to cloud server
    if (cloudWs && cloudWs.readyState === WebSocket.OPEN) {
      cloudWs.send(JSON.stringify({
        action: 'file_changed',
        fileEvent: data,
      }));
    }
  } else if (event === 'conflict') {
    console.log(`⚠️  [Sync] Conflict on: ${data.virtualPath} from device ${data.deviceId}`);
  } else if (event === 'file_synced') {
    console.log(`✅ [Sync] Synced: ${data.virtualPath}`);
  }
});

// Optimized Retry for 8B/Tool-use models (Higher Quotas)
async function withRetry(fn, retries = 5, delay = 4000) {
  try {
    return await fn();
  } catch (err) {
    const isRateLimit = err.status === 429 ||
      err.message?.includes('429') ||
      err.message?.includes('rate_limit_reached');

    if (retries > 0 && isRateLimit) {
      console.warn(`[Groq] Rate limit hit. Retrying in ${delay}ms... (${retries} left)`);
      await sleep(delay);
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw err;
  }
}

app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html>
<html><head><title>AuraOS Bridge</title><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui;background:#101018;color:#f4f4ff;padding:24px;line-height:1.5">
<h1>AuraOS Bridge OK</h1>
<p>This is the file/agent bridge. Open the app, not this port:</p>
<p><a style="color:#7eb4ff" href="http://${req.hostname}:5176/">http://${req.hostname}:5176/</a></p>
<p>Health: <a style="color:#7eb4ff" href="/health">/health</a></p>
</body></html>`);
});

function resolveSafe(input = '~') {
  const expanded = input === '~' || input.startsWith('~/') ? path.join(homedir(), input.slice(2)) : input;
  const full = path.resolve(expanded);
  if (![...roots].some((root) => full === root || full.startsWith(`${root}${path.sep}`))) {
    console.warn(`[Security] Path access denied: ${full}`);
    throw new Error('Path outside allowed roots');
  }
  return full;
}

function run(bin, args = []) {
  console.log(`[Exec] Running: ${bin} ${args.join(' ')}`);
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) console.error(`[Exec] Error: ${error.message}`);
      resolve({ ok: !error, stdout: stdout.trim(), stderr: stderr.trim(), error: error?.message || '' });
    });
  });
}

async function listFiles(target = '~') {
  console.log(`[Files] Listing: ${target}`);
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
  console.log('[Metrics] Gathering hardware info');
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
  console.log(`[Open] Target: ${target}`);
  const full = target.startsWith('http') ? target : resolveSafe(target);
  if (platform() === 'darwin') await run('open', [full]);
  else if (platform() === 'win32') await run('cmd', ['/c', 'start', '', full]);
  else await run('xdg-open', [full]);
  return { message: `Opened ${full}` };
}

async function shell(command) {
  const text = String(command || '').trim();
  console.log(`[Shell] Command: ${text}`);
  if (!text) return { ok: false, output: 'No command provided' };
  return new Promise((resolve) => {
    exec(text, { timeout: 30000, maxBuffer: 1024 * 1024, shell: '/bin/bash' }, (error, stdout, stderr) => {
      if (error) console.error(`[Shell] Error: ${error.message}`);
      resolve({ ok: !error, output: stdout.trim() || stderr.trim() || error?.message || '' });
    });
  });
}

/**
 * Read file content and return as text (for AI to inspect)
 */
async function readFileContent(filePath) {
  console.log(`[Files] Reading content: ${filePath}`);
  const full = resolveSafe(filePath);
  const stats = await stat(full);
  if (stats.size > 1024 * 1024) {
    console.warn(`[Files] File too large: ${full} (${stats.size} bytes)`);
    return { error: 'File too large to read (>1MB)' };
  }
  const content = await readFile(full, 'utf8');
  return { path: full, content, size: stats.size };
}

async function downloadWallpaper(prompt) {
  const picturesDir = path.join(homedir(), 'Pictures');
  await mkdir(picturesDir, { recursive: true });
  const clean = prompt
    .replace(/\b(download|set|search|find|wallpaper|background|for|and|as|my)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'beautiful desktop wallpaper';
  const urls = [
    `https://image.pollinations.ai/prompt/${encodeURIComponent(`${clean} wallpaper`)}`,
    `https://picsum.photos/seed/${encodeURIComponent(clean)}/1920/1080`,
  ];
  let res = null;
  for (const url of urls) {
    res = await fetch(url);
    if (res.ok) break;
  }
  if (!res?.ok) throw new Error(`Wallpaper download failed: ${res?.status || 'offline'}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const filePath = path.join(picturesDir, `aura-wallpaper-${Date.now()}.jpg`);
  await writeFile(filePath, bytes);
  return filePath;
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in a local directory. Default path is "~" for home directory.',
      parameters: {
        type: 'object', properties: {
          path: { type: 'string', description: 'Path to list. Always use "~" for home directory, or "~/Downloads", "~/Documents" etc. Never use absolute paths like /home/user.' }
        }, required: ['path']
      }
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
      description: 'Run ANY shell command on the host machine. You have FULL device access. You can use curl, wget, python, etc. to download files, process data, or perform complex tasks.',
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
      name: 'read_file',
      description: 'Read the text content of a file on the host machine (max 1MB)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to read, e.g., ~/Documents/notes.txt' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sync_status',
      description: 'Get the current file sync status across all devices — shows which folders are being synced, how many files, conflicts, etc.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browse_synced_files',
      description: 'Browse files in the synced virtual filesystem. Use "/" to see root sync folders (Desktop, Documents, etc.), or "Desktop" to see Desktop files.',
      parameters: {
        type: 'object',
        properties: {
          virtualPath: { type: 'string', description: 'Virtual path to browse, e.g., "/" for root, "Desktop", "Documents/work"' }
        },
        required: ['virtualPath']
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
          payload: { type: 'string', description: 'App ID (finder, terminal, notes, browser, calculator, settings, cloud-drive), value for setting, or widget type (weather)' },
          url: { type: 'string', description: 'URL to open if action is openApp and payload is browser' },
          data: { type: 'object', description: 'Data for the widget if action is createWidget (e.g., { temp: "30", desc: "Sunny", location: "New Delhi" })' }
        },
        required: ['action', 'payload']
      }
    }
  }
];

async function agentLoop(userPrompt, context) {
  console.log(`[Agent] New request: "${userPrompt}"`);
  // Skip Groq for simple greetings
  const simple = /^(hi+|hello|hey|sup|yo)\s*[!?]*$/i;
  if (simple.test(userPrompt.trim())) {
    return { message: "Hey! Ask me to open apps, list files, sync status, or check hardware.", frontendActions: [] };
  }

  if (/\b(wallpaper|background)\b/i.test(userPrompt) && /\b(download|set|search|find|change)\b/i.test(userPrompt)) {
    try {
      console.log('[Agent] Detected wallpaper request');
      const filePath = await downloadWallpaper(userPrompt);
      return {
        message: `Wallpaper downloaded and set: ${filePath}`,
        frontendActions: [{ action: 'setWallpaper', payload: filePath }],
      };
    } catch (err) {
      console.error('[Agent] Wallpaper failed:', err.message);
      return { message: `Wallpaper failed: ${err.message}`, frontendActions: [] };
    }
  }

  if (/\b(list|show|browse)\b/i.test(userPrompt) && /\b(files?|folder|directory|downloads?|documents?|pictures?)\b/i.test(userPrompt)) {
    const lower = userPrompt.toLowerCase();
    const target = lower.includes('download') ? '~/Downloads'
      : lower.includes('document') ? '~/Documents'
      : lower.includes('picture') || lower.includes('photo') ? '~/Pictures'
      : '~';
    console.log(`[Agent] Detected list request for ${target}`);
    const data = await listFiles(target);
    return {
      message: data.entries.slice(0, 30).map((entry) => `${entry.type === 'dir' ? 'DIR ' : 'FILE'} ${entry.name}`).join('\n') || 'Empty folder',
      frontendActions: [{ action: 'openApp', payload: 'finder' }],
    };
  }

  if (/\b(hardware|status|metrics|ram|cpu)\b/i.test(userPrompt)) {
    console.log('[Agent] Detected hardware request');
    return { message: JSON.stringify(metrics(), null, 2), frontendActions: [] };
  }

  if (/\b(open|launch)\b/i.test(userPrompt)) {
    const lower = userPrompt.toLowerCase();
    const appMap = [
      ['finder', 'finder'],
      ['files', 'finder'],
      ['cloud', 'cloud-drive'],
      ['drive', 'cloud-drive'],
      ['terminal', 'terminal'],
      ['notes', 'notes'],
      ['settings', 'settings'],
      ['browser', 'browser'],
      ['google', 'browser'],
    ];
    const match = appMap.find(([word]) => lower.includes(word));
    if (match) {
      console.log(`[Agent] Detected app open request: ${match[1]}`);
      return {
        message: `Opening ${match[1]}`,
        frontendActions: [{ action: 'openApp', payload: 'finder' }],
      };
    }
  }

  if (!env.GROQ_API_KEY) {
    console.error('[Agent] Groq API key missing');
    return { message: 'AI key missing in .env', frontendActions: [] };
  }

  let messages = [
    { role: 'system', content: `You are AuraAI, an advanced OS assistant with cross-device file sync capabilities. You can:
- List and browse files on this device and synced folders
- Read and write files
- Check sync status across all connected devices
- Open apps and manage the OS
- Check hardware metrics
- Run ANY shell command: curl, wget, python, ls, grep, etc. You have full device access.

ALWAYS use the provided tools. NEVER write tool calls as text.
To open apps use the frontend_action tool. Available apps: finder, terminal, notes, browser, calculator, settings, cloud-drive, ai-assistant, sensors, debugger.
For file sync operations, use sync_status and browse_synced_files.
To open the cloud drive app, use frontend_action with action="openApp" and payload="cloud-drive".
To set the wallpaper, use frontend_action with action="setWallpaper" and payload="<absolute-path>".
If asked to download and set a wallpaper (e.g. chainsaw man), use shell_command to download one reliably like this: curl 'https://image.pollinations.ai/prompt/chainsaw%20man%20wallpaper' -o ~/Pictures/wall.jpg, then use frontend_action with action="setWallpaper" and payload="/home/YOUR_USER/Pictures/wall.jpg".` },
    { role: 'user', content: userPrompt }
  ];

  let frontendActions = [];

  for (let i = 0; i < 15; i++) { // Max 15 iterations for complex tasks
    console.log(`[Agent] Iteration ${i+1}/15`);
    if (i > 0) await sleep(2500);

    const data = await withRetry(async () => {
      console.log(`[Groq] Sending request (model: ${env.GROQ_MODEL || 'llama-3.3-70b-versatile'})`);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          messages,
          tools,
          tool_choice: 'auto',
          max_tokens: 1024,
          temperature: 0, // Zero temp for reliable tool calling
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Groq] Error ${res.status}: ${errText}`);
        const err = new Error(`Groq failed: ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return await res.json();
    });

    const msg = data.choices?.[0]?.message;
    if (!msg) {
      console.error('[Agent] No AI reply in response data');
      return { message: 'No AI reply', frontendActions };
    }

    messages.push(msg);

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      console.log(`[Agent] AI requested ${msg.tool_calls.length} tools`);
      for (const tc of msg.tool_calls) {
        let resultData = '';
        try {
          const args = JSON.parse(tc.function.arguments || '{}');
          console.log(`[Agent] Tool: ${tc.function.name} Args:`, args);
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
          } else if (tc.function.name === 'read_file') {
            const res = await readFileContent(args.path);
            resultData = JSON.stringify(res);
          } else if (tc.function.name === 'sync_status') {
            resultData = JSON.stringify(syncEngine.getSyncStatus());
          } else if (tc.function.name === 'browse_synced_files') {
            const res = await syncEngine.browse(args.virtualPath);
            resultData = JSON.stringify(res);
          } else if (tc.function.name === 'frontend_action') {
            frontendActions.push({ action: args.action, payload: args.payload, url: args.url, data: args.data });
            resultData = `Frontend action queued: ${args.action} ${args.payload}`;
          } else {
            console.warn(`[Agent] Unknown tool called: ${tc.function.name}`);
            resultData = 'Unknown tool';
          }
        } catch (err) {
          console.error(`[Agent] Tool error (${tc.function.name}):`, err.message);
          resultData = `Error: ${err.message}`;
        }
        messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: String(resultData) || 'success' });
      }
    } else {
      const cleanContent = (msg.content || 'Task complete')
        .replace(/<[^>]+>/g, '')  // strip leaked XML tags
        .trim();
      console.log(`[Agent] Loop finished with message: ${cleanContent}`);
      return { message: cleanContent || 'Task complete', frontendActions };
    }
  }
  console.warn('[Agent] Loop limit reached');
  return { message: 'Agent loop limit reached', frontendActions };
}

// ─── REST API ─────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ ok: true, groq: Boolean(env.GROQ_API_KEY), roots: [...roots], sync: true }));
app.get('/metrics', (req, res) => res.json(metrics()));

// ─── Agent Configuration Endpoint ────────────────────────
app.get('/config', (req, res) => {
  res.json({
    deviceName:  syncEngine.deviceName,
    deviceId:    syncEngine.deviceId,
    account:     syncEngine.account,
    platform:    process.platform,
    port,
    groqModel:   env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    groqKeySet:  Boolean(env.GROQ_API_KEY),
    cloudUrl:    env.AURA_CLOUD_URL || 'ws://127.0.0.1:4778',
    cloudConnected: cloudWs !== null && cloudWs.readyState === 1,
    roots:       [...roots],
    syncFolders: syncEngine.syncFolders,
    syncStats:   syncEngine.syncStats,
  });
});
app.get('/files', async (req, res) => {
  try {
    res.json(await listFiles(req.query.path || '~'));
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});
app.post('/open', async (req, res) => {
  try {
    res.json(await openTarget(req.body.path));
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});
app.post('/mkdir', async (req, res) => {
  try {
    const fullPath = resolveSafe(req.body.path);
    await mkdir(fullPath, { recursive: true });
    res.json({ ok: true, path: fullPath });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});
app.post('/shell', async (req, res) => res.json(await shell(req.body.command)));
app.post('/command', async (req, res) => {
  const { command, context } = req.body;
  const agentResult = await agentLoop(command, context);
  res.json(agentResult);
});

// ─── Sync API Endpoints ───────────────────────────────────

app.get('/sync/status', (req, res) => {
  res.json(syncEngine.getSyncStatus());
});

app.get('/sync/browse', async (req, res) => {
  try {
    const result = await syncEngine.browse(req.query.path || '/');
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.get('/sync/file', async (req, res) => {
  try {
    const result = await syncEngine.readFileForSync(req.query.path);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.post('/sync/write', async (req, res) => {
  try {
    await syncEngine.writeFileFromSync(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/sync/index', async (req, res) => {
  const index = await syncEngine.buildFullIndex();
  res.json(index);
});

// ─── Read File Content (for Cloud Drive preview) ─────────
app.get('/sync/read', async (req, res) => {
  try {
    const virtualPath = req.query.path;
    if (!virtualPath) return res.status(400).json({ error: 'path required' });
    const result = await syncEngine.readFileForSync(virtualPath);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.get('/raw', (req, res) => {
  try {
    const filePath = resolveSafe(req.query.path);
    if (!existsSync(filePath)) return res.status(404).send('Not found');
    res.sendFile(filePath);
  } catch (err) {
    res.status(403).send(err.message);
  }
});

app.post('/upload', express.json({ limit: '50mb' }), async (req, res) => {
  try {
    const { filename, base64 } = req.body;
    const dest = path.join(path.resolve(homedir(), 'Downloads'), filename);
    await writeFile(dest, Buffer.from(base64, 'base64'));
    res.json({ ok: true, path: dest });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── HTTP Server + Cloud Connection ───────────────────────

const httpServer = createServer(app);
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`🖥️  AuraOS bridge ready at http://127.0.0.1:${port}`);
  connectToCloud();
});

let cloudWs = null;

function connectToCloud() {
  const cloudUrl = env.AURA_CLOUD_URL || 'ws://127.0.0.1:4778';
  const ws = new WebSocket(cloudUrl);
  cloudWs = ws;

  ws.on('error', (err) => {
    console.error('⚠️ Agent failed to connect to Cloud Server. Retrying in 5s...');
  });

  ws.on('open', () => {
    console.log('✅ Connected to Cloud Server');
    ws.send(JSON.stringify({
      action: 'register',
      type: 'device',
      account: env.AURA_ACCOUNT || 'default',
      deviceName: syncEngine.deviceName,
      syncCapable: true,
    }));
  });

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);

      // ─── Sync Protocol Handlers ─────────────────────────
      if (msg.action === 'request_manifest') {
        // Cloud server is asking for our file manifest
        const manifest = await syncEngine.buildFullIndex();
        ws.send(JSON.stringify({
          action: 'manifest_update',
          manifest,
        }));
        return;
      }

      if (msg.type === 'remote_manifest') {
        // Another device's manifest — diff and pull missing/newer files
        console.log(`📋 [Sync] Received manifest from ${msg.sourceDeviceName} (${msg.sourceDeviceId})`);
        const actions = syncEngine.diffManifest(msg.manifest, msg.sourceDeviceId);
        console.log(`[Sync] Diff result: ${actions.length} files to pull from ${msg.sourceDeviceName}`);

        // Request each file we need (throttled to avoid overwhelming the network)
        for (let i = 0; i < actions.length; i++) {
          const act = actions[i];
          if (act.action === 'pull') {
            // Stagger requests by 100ms each to avoid flooding
            setTimeout(() => {
              const requestId = `sync_${Date.now()}_${Math.random().toString(36).substring(7)}`;
              if (cloudWs && cloudWs.readyState === WebSocket.OPEN) {
                cloudWs.send(JSON.stringify({
                  action: 'request_file_sync',
                  targetDeviceId: msg.sourceDeviceId,
                  virtualPath: act.virtualPath,
                  requestId,
                }));
              }
            }, i * 100);
          }
        }
        return;
      }

      if (msg.type === 'remote_file_changed') {
        // Another device changed a file — request the file data
        const fileEvent = msg.fileEvent;
        console.log(`📡 [Sync] Remote change from ${msg.sourceDeviceName}: ${fileEvent.event} ${fileEvent.virtualPath}`);

        if (fileEvent.event === 'delete') {
          await syncEngine.deleteFileFromSync(fileEvent.virtualPath);
        } else if (fileEvent.event !== 'mkdir') {
          // Request the actual file content from the source device
          const requestId = `sync_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          ws.send(JSON.stringify({
            action: 'request_file_sync',
            targetDeviceId: msg.sourceDeviceId,
            virtualPath: fileEvent.virtualPath,
            requestId,
          }));
        } else {
          // Just create the directory
          await syncEngine.writeFileFromSync({ virtualPath: fileEvent.virtualPath, type: 'directory', isDir: true });
        }
        return;
      }

      if (msg.type === 'file_sync_data') {
        // Received file data from another device
        console.log(`📥 [Sync] Received file data for: ${msg.fileData?.virtualPath}`);
        if (msg.fileData) {
          await syncEngine.writeFileFromSync(msg.fileData);
        }
        return;
      }

      if (msg.action === 'file_sync_request') {
        // Another device is requesting a file from us
        try {
          const fileData = await syncEngine.readFileForSync(msg.virtualPath);
          ws.send(JSON.stringify({
            action: 'file_sync_response',
            requestId: msg.requestId,
            targetDeviceId: msg.requestingDeviceId,
            fileData,
          }));
        } catch (err) {
          ws.send(JSON.stringify({
            action: 'file_sync_response',
            requestId: msg.requestId,
            targetDeviceId: msg.requestingDeviceId,
            fileData: { error: err.message },
          }));
        }
        return;
      }

      // ─── Browse requests from cloud (for REST API) ───────
      if (msg.action === 'browse_request') {
        try {
          const result = await syncEngine.browse(msg.virtualPath);
          ws.send(JSON.stringify({
            action: 'browse_result',
            requestId: msg.requestId,
            result,
          }));
        } catch (err) {
          ws.send(JSON.stringify({
            action: 'browse_result',
            requestId: msg.requestId,
            result: { error: err.message },
          }));
        }
        return;
      }

      if (msg.action === 'file_request') {
        try {
          const result = await syncEngine.readFileForSync(msg.virtualPath);
          ws.send(JSON.stringify({
            action: 'file_result',
            requestId: msg.requestId,
            result,
          }));
        } catch (err) {
          ws.send(JSON.stringify({
            action: 'file_result',
            requestId: msg.requestId,
            result: { error: err.message },
          }));
        }
        return;
      }

      // ─── Original Agent Commands ─────────────────────────
      if (msg.action === 'agent_command') {
        let command = msg.command;
        let result;

        if (command === 'list_files') {
          result = await listFiles(msg.context?.path);
        } else if (command === 'open_path') {
          result = await openTarget(msg.context?.path);
        } else if (command === 'mkdir') {
          const fullPath = resolveSafe(msg.context?.path);
          await mkdir(fullPath, { recursive: true });
          result = { ok: true, path: fullPath };
        } else if (command === 'shell_command') {
          result = await shell(msg.context?.command);
        } else if (command === 'write_file') {
          const fullPath = resolveSafe(msg.context?.path);
          await writeFile(fullPath, msg.context?.content, 'utf8');
          result = { message: `Successfully wrote file to ${fullPath}` };
        } else {
          result = await agentLoop(command, msg.context);
        }

        ws.send(JSON.stringify({
          action: 'command_result',
          requestId: msg.requestId,
          targetClientId: msg.sourceClientId,
          result: result
        }));
      }
    } catch (err) {
      console.error('Cloud command error:', err);
    }
  });

  ws.on('close', () => {
    cloudWs = null;
    setTimeout(connectToCloud, 5000);
  });
}