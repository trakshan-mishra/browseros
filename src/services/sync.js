import { cloud } from './cloud';

const AGENT_URL = import.meta.env.VITE_AURA_AGENT_URL || 'http://127.0.0.1:4777';

/**
 * SyncService — Frontend service for cross-device file synchronization
 * Provides real-time sync events, file browsing across devices, and file transfer
 */
class SyncService {
  constructor() {
    this.listeners = new Set();
    this.syncEvents = [];
    this.maxEvents = 100;
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _emit(event, data) {
    const entry = { event, data, timestamp: Date.now() };
    this.syncEvents.unshift(entry);
    if (this.syncEvents.length > this.maxEvents) this.syncEvents.pop();
    for (const fn of this.listeners) {
      try { fn(event, data); } catch (e) { console.error('[SyncService] listener error:', e); }
    }
  }

  /**
   * Initialize cloud sync event listener
   */
  initCloudListener() {
    // The cloud service already handles messages. We hook into it for sync events.
    if (cloud.ws) {
      const origOnMessage = cloud.ws.onmessage;
      cloud.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'sync_event') {
            this._emit(msg.event, {
              deviceId: msg.deviceId,
              deviceName: msg.deviceName,
              fileEvent: msg.fileEvent,
            });
          }
        } catch {}
        // Call original handler
        if (origOnMessage) origOnMessage(event);
      };
    }
  }

  /**
   * Get sync status from this device's agent
   */
  async getStatus() {
    const res = await fetch(`${AGENT_URL}/sync/status`);
    if (!res.ok) throw new Error(`Sync status: ${res.status}`);
    return res.json();
  }

  /**
   * Browse files on this device via virtual path
   */
  async browse(virtualPath = '/') {
    const res = await fetch(`${AGENT_URL}/sync/browse?path=${encodeURIComponent(virtualPath)}`);
    if (!res.ok) throw new Error(`Browse failed: ${res.status}`);
    return res.json();
  }

  /**
   * Browse files on a REMOTE device via the cloud server
   */
  async browseRemote(deviceId, virtualPath = '/', account = 'default') {
    const cloudUrl = import.meta.env.VITE_CLOUD_URL || 'http://127.0.0.1:4778';
    const res = await fetch(`${cloudUrl}/sync/browse/${account}/${deviceId}?path=${encodeURIComponent(virtualPath)}`);
    if (!res.ok) throw new Error(`Remote browse failed: ${res.status}`);
    return res.json();
  }

  /**
   * Read a file from this device
   */
  async readFile(virtualPath) {
    const res = await fetch(`${AGENT_URL}/sync/read?path=${encodeURIComponent(virtualPath)}`);
    if (!res.ok) throw new Error(`Read failed: ${res.status}`);
    return res.json();
  }

  /**
   * Read a file from a REMOTE device
   */
  async readFileRemote(deviceId, virtualPath, account = 'default') {
    const cloudUrl = import.meta.env.VITE_CLOUD_URL || 'http://127.0.0.1:4778';
    const res = await fetch(`${cloudUrl}/sync/file/${account}/${deviceId}?path=${encodeURIComponent(virtualPath)}`);
    if (!res.ok) throw new Error(`Remote read failed: ${res.status}`);
    return res.json();
  }

  /**
   * Get full file index from this device
   */
  async getFullIndex() {
    const res = await fetch(`${AGENT_URL}/sync/index`);
    if (!res.ok) throw new Error(`Index failed: ${res.status}`);
    return res.json();
  }

  /**
   * Get recent sync activity
   */
  getRecentEvents() {
    return this.syncEvents;
  }
}

export const syncService = new SyncService();
