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
      model: env.GROQ_MODEL,
      messages: [{ role: 'user', content: 'What time is it?' }],
      tools: [{ type: 'function', function: { name: 'getTime', description: 'Get time' } }]
    })
  });
  console.log(await res.json());
}
test();
