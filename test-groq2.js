import { readFileSync } from 'node:fs';

const env = {};
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  if (line.includes('=')) {
    const [k, ...v] = line.split('=');
    env[k] = v.join('=');
  }
}

async function test() {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [
        { role: 'user', content: 'What files are in my home directory? Also, change the wallpaper to something else' },
        { role: 'assistant', tool_calls: [{ id: '1', type: 'function', function: { name: 'list_files', arguments: '{"path":"~"}' } }] },
        { role: 'tool', tool_call_id: '1', content: '["file1"]' }
      ]
    })
  });
  console.log(await res.json());
}
test();
