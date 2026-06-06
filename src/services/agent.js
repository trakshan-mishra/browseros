import { cloud } from './cloud';

const defaultHost = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
const AGENT_URL = import.meta.env.VITE_AURA_AGENT_URL || `http://${defaultHost}:4777`;

async function callLocal(endpoint, options = {}) {
  const res = await fetch(`${AGENT_URL}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`Agent ${res.status}`);
  return res.json();
}

export const agent = {
  activeDeviceId: 'local',

  health: () => callLocal('/health'),
  metrics: () => callLocal('/metrics'),
  
  files: async (path = '~') => {
    if (agent.activeDeviceId && agent.activeDeviceId !== 'local') {
      return cloud.sendCommand(agent.activeDeviceId, 'list_files', { path });
    }
    return callLocal(`/files?path=${encodeURIComponent(path)}`);
  },

  openPath: async (path) => {
    if (agent.activeDeviceId && agent.activeDeviceId !== 'local') {
      return cloud.sendCommand(agent.activeDeviceId, 'open_path', { path });
    }
    return callLocal('/open', { method: 'POST', body: JSON.stringify({ path }) });
  },

  mkdir: async (path) => {
    if (agent.activeDeviceId && agent.activeDeviceId !== 'local') {
      return cloud.sendCommand(agent.activeDeviceId, 'mkdir', { path });
    }
    return callLocal('/mkdir', { method: 'POST', body: JSON.stringify({ path }) });
  },

  rawUrl: (path) => `${AGENT_URL}/raw?path=${encodeURIComponent(path)}`,

  command: async (command, context = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    if (agent.activeDeviceId && agent.activeDeviceId !== 'local') {
      return cloud.sendCommand(agent.activeDeviceId, command, context);
    }
    try {
      return await callLocal('/command', { method: 'POST', body: JSON.stringify({ command, context }), signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  },

  shell: async (command) => {
    if (agent.activeDeviceId && agent.activeDeviceId !== 'local') {
      return cloud.sendCommand(agent.activeDeviceId, 'shell_command', { command });
    }
    return callLocal('/shell', { method: 'POST', body: JSON.stringify({ command }) });
  },

  // ─── Sync APIs ──────────────────────────────────
  syncStatus: () => callLocal('/sync/status'),
  syncBrowse: (virtualPath = '/') => callLocal(`/sync/browse?path=${encodeURIComponent(virtualPath)}`),
  syncReadFile: (virtualPath) => callLocal(`/sync/read?path=${encodeURIComponent(virtualPath)}`),
  syncIndex: () => callLocal('/sync/index'),
};
