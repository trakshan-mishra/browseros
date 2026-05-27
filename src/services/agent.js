const AGENT_URL = import.meta.env.VITE_AURA_AGENT_URL || 'http://127.0.0.1:4777';

async function call(path, options = {}) {
  const res = await fetch(`${AGENT_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`Agent ${res.status}`);
  return res.json();
}

export const agent = {
  health: () => call('/health'),
  metrics: () => call('/metrics'),
  files: (path = '~') => call(`/files?path=${encodeURIComponent(path)}`),
  openPath: (path) => call('/open', { method: 'POST', body: JSON.stringify({ path }) }),
  command: (command, context = {}) => call('/command', { method: 'POST', body: JSON.stringify({ command, context }) }),
  shell: (command) => call('/shell', { method: 'POST', body: JSON.stringify({ command }) }),
};
