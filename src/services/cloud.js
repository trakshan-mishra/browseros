export class CloudService {
  constructor() {
    this.ws = null;
    this.account = 'default';
    this.syncListeners = new Set();
    this.deviceListeners = new Set();
    this.devices = [];
    this.pendingCommands = new Map();
  }

  connect(account, onSync, onDevices) {
    if (this.ws) {
      this.ws.close();
    }
    this.account = account || 'default';
    if (onSync) this.syncListeners.add(onSync);
    if (onDevices) this.deviceListeners.add(onDevices);

    // Support accessing from other devices on the local network (e.g., phones)
    const defaultHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const CLOUD_URL = import.meta.env.VITE_AURA_CLOUD_URL || `ws://${defaultHost}:4778`;
    this.ws = new WebSocket(CLOUD_URL);
    
    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({ action: 'register', type: 'client', account: this.account }));
      this.ws.send(JSON.stringify({ action: 'sync_state' }));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'devices_list') {
          this.devices = msg.devices;
          for (const fn of this.deviceListeners) fn(this.devices);
        } else if (msg.type === 'state_sync') {
          for (const fn of this.syncListeners) fn(msg.state);
        } else if (msg.type === 'command_result' || msg.action === 'command_result') {
          const requestId = msg.requestId;
          if (this.pendingCommands.has(requestId)) {
            this.pendingCommands.get(requestId)(msg.result || { error: msg.error });
            this.pendingCommands.delete(requestId);
          }
        }
      } catch (err) {
        console.error('Cloud message error:', err);
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
    };
  }

  updateState(state) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'update_state', state }));
    }
  }

  async sendCommand(targetDeviceId, command, context = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Cloud offline');
    }
    
    const requestId = Math.random().toString(36).substring(7);
    return new Promise((resolve) => {
      this.pendingCommands.set(requestId, resolve);
      
      // Extract commandType and base64 for asset relay if present in context
      const { commandType, base64, ...restContext } = context;

      this.ws.send(JSON.stringify({
        action: 'execute_command',
        targetDeviceId,
        requestId,
        command,
        commandType,
        base64,
        context: restContext
      }));
      
      // Timeout
      setTimeout(() => {
        if (this.pendingCommands.has(requestId)) {
          this.pendingCommands.delete(requestId);
          resolve({ error: 'Command timed out' });
        }
      }, 30000);
    });
  }
}

export const cloud = new CloudService();
