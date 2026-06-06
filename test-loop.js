import { readFileSync } from 'node:fs';

const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  if (line.includes('=')) {
    const [k, ...v] = line.split('=');
    env[k] = v.join('=');
  }
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
      name: 'frontend_action',
      description: 'Instruct the Browser OS frontend to perform an action (e.g. open a virtual app)',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['openApp', 'setWallpaper', 'setBrightness'] },
          payload: { type: 'string', description: 'App ID (finder, terminal, notes, browser, calculator, settings) or value for setting' }
        },
        required: ['action', 'payload']
      }
    }
  }
];

async function test() {
  let messages = [
    { role: 'system', content: 'You are an agent.' },
    { role: 'user', content: 'What files are in my home directory? Also, change the wallpaper to something else' }
  ];

  for (let i = 0; i < 3; i++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages,
        tools,
        tool_choice: 'auto',
      }),
    });
    const data = await res.json();
    if (!res.ok) { console.error('Error 400:', JSON.stringify(data)); break; }
    const msg = data.choices[0].message;
    console.log('MSG:', msg);
    messages.push(msg);
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: 'Some result' });
      }
    } else {
      break;
    }
  }
}
test();
