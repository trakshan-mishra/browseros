import { WebSocketServer } from 'ws';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import express from 'express';
import { createServer } from 'node:http';

const DB_FILE = 'cloud-db.json';
const port = 4778;

// Simple Cloud DB for State Sync
let db = { users: {} };
if (existsSync(DB_FILE)) {
  try { db = JSON.parse(readFileSync(DB_FILE, 'utf8')); } catch {}
}
function saveDb() {
  writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 50 * 1024 * 1024 }); // 50MB max for file chunks
const clients = new Map(); // ws -> { id, type, account, deviceName, syncCapable, lastSeen }
const tempStore = new Map(); // key -> { data, ts }
const fileManifests = new Map(); // account -> { deviceId -> manifest }

app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    server: 'NexusOS Cloud',
    version: '1.0.0',
    endpoints: [
      '/asset/:key',
      '/sync/status/:account',
      '/sync/browse/:account/:deviceId',
      '/sync/file/:account/:deviceId'
    ]
  });
});

app.get('/asset/:key', (req, res) => {
  const asset = tempStore.get(req.params.key);
  if (!asset) return res.status(404).end();
  res.json({ base64: asset.data });
});

// REST endpoint for sync status
app.get('/sync/status/:account', (req, res) => {
  const account = req.params.account;
  const devices = [];
  for (const [_, c] of clients.entries()) {
    if (c.account === account && c.type === 'device') {
      devices.push({
        id: c.id,
        name: c.deviceName,
        syncCapable: c.syncCapable || false,
        lastSeen: c.lastSeen,
        online: true
      });
    }
  }
  const manifest = fileManifests.get(account) || {};
  res.json({ account, devices, manifests: Object.keys(manifest) });
});

// REST endpoint to browse remote device files
app.get('/sync/browse/:account/:deviceId', async (req, res) => {
  const { account, deviceId } = req.params;
  const virtualPath = req.query.path || '/';

  // Find the target device websocket
  for (const [ws, c] of clients.entries()) {
    if (c.type === 'device' && c.account === account && c.id === deviceId && ws.readyState === 1) {
      const requestId = `browse_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Set up one-time response handler
      const timeout = setTimeout(() => res.status(504).json({ error: 'Device timeout' }), 15000);

      const handler = (msg) => {
        try {
          const data = JSON.parse(msg);
          if (data.action === 'browse_result' && data.requestId === requestId) {
            clearTimeout(timeout);
            ws.removeListener('message', handler);
            res.json(data.result);
          }
        } catch {}
      };
      ws.on('message', handler);

      ws.send(JSON.stringify({
        action: 'browse_request',
        requestId,
        virtualPath
      }));
      return;
    }
  }
  res.status(404).json({ error: 'Device offline or not found' });
});

// REST endpoint to download a file from remote device
app.get('/sync/file/:account/:deviceId', async (req, res) => {
  const { account, deviceId } = req.params;
  const virtualPath = req.query.path;
  if (!virtualPath) return res.status(400).json({ error: 'path required' });

  for (const [ws, c] of clients.entries()) {
    if (c.type === 'device' && c.account === account && c.id === deviceId && ws.readyState === 1) {
      const requestId = `file_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const timeout = setTimeout(() => res.status(504).json({ error: 'Device timeout' }), 30000);

      const handler = (msg) => {
        try {
          const data = JSON.parse(msg);
          if (data.action === 'file_result' && data.requestId === requestId) {
            clearTimeout(timeout);
            ws.removeListener('message', handler);
            res.json(data.result);
          }
        } catch {}
      };
      ws.on('message', handler);

      ws.send(JSON.stringify({
        action: 'file_request',
        requestId,
        virtualPath
      }));
      return;
    }
  }
  res.status(404).json({ error: 'Device offline or not found' });
});

console.log(`☁️  NexusOS Cloud Server running on http://localhost:${port}`);

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).substring(7);
  clients.set(ws, { id, type: 'unknown', lastSeen: Date.now() });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      const client = clients.get(ws);
      client.lastSeen = Date.now();

      // ─── Registration ──────────────────────────────────
      if (data.action === 'register') {
        client.type = data.type; // 'client' or 'device'
        client.account = data.account || 'default';
        client.deviceName = data.deviceName || 'Unknown Device';
        client.syncCapable = data.syncCapable || false;

        // Initialize user in DB if not present
        if (!db.users[client.account]) {
          db.users[client.account] = { state: {}, syncEnabled: true };
          saveDb();
        }

        ws.send(JSON.stringify({ type: 'registered', id, message: 'Connected to Cloud' }));
        broadcastDevices(client.account);

        // If device is sync-capable, request its manifest
        if (client.syncCapable && client.type === 'device') {
          ws.send(JSON.stringify({ action: 'request_manifest' }));
        }
        return;
      }

      // Ensure registered
      if (client.type === 'unknown') return;

      // ─── State Sync ─────────────────────────────────────
      if (data.action === 'sync_state') {
        ws.send(JSON.stringify({ type: 'state_sync', state: db.users[client.account]?.state || {} }));
        return;
      }

      if (data.action === 'update_state') {
        db.users[client.account].state = {
          ...(db.users[client.account].state || {}),
          ...data.state
        };
        saveDb();
        return;
      }

      // ─── File Sync Protocol ─────────────────────────────

      // Device sends its file manifest
      if (data.action === 'manifest_update' && client.type === 'device') {
        if (!fileManifests.has(client.account)) fileManifests.set(client.account, {});
        fileManifests.get(client.account)[client.id] = {
          deviceName: client.deviceName,
          manifest: data.manifest,
          timestamp: Date.now()
        };

        // Broadcast manifest to all other devices in the account for sync comparison
        for (const [targetWs, targetClient] of clients.entries()) {
          if (targetWs !== ws && targetClient.account === client.account &&
              targetClient.type === 'device' && targetClient.syncCapable) {
            targetWs.send(JSON.stringify({
              type: 'remote_manifest',
              sourceDeviceId: client.id,
              sourceDeviceName: client.deviceName,
              manifest: data.manifest,
              timestamp: Date.now()
            }));
          }
        }
        return;
      }

      // File change event — relay to other devices
      if (data.action === 'file_changed' && client.type === 'device') {
        for (const [targetWs, targetClient] of clients.entries()) {
          if (targetWs !== ws && targetClient.account === client.account &&
              targetClient.type === 'device' && targetClient.syncCapable) {
            targetWs.send(JSON.stringify({
              type: 'remote_file_changed',
              sourceDeviceId: client.id,
              sourceDeviceName: client.deviceName,
              fileEvent: data.fileEvent,
            }));
          }
        }

        // Also broadcast to clients (frontend) for real-time UI updates
        for (const [targetWs, targetClient] of clients.entries()) {
          if (targetClient.type === 'client' && targetClient.account === client.account) {
            targetWs.send(JSON.stringify({
              type: 'sync_event',
              event: 'file_changed',
              deviceId: client.id,
              deviceName: client.deviceName,
              fileEvent: data.fileEvent,
            }));
          }
        }
        return;
      }

      // File sync request — device asks another device for a file
      if (data.action === 'request_file_sync') {
        for (const [targetWs, targetClient] of clients.entries()) {
          if (targetClient.type === 'device' && targetClient.id === data.targetDeviceId &&
              targetClient.account === client.account && targetWs.readyState === 1) {
            targetWs.send(JSON.stringify({
              action: 'file_sync_request',
              requestId: data.requestId,
              virtualPath: data.virtualPath,
              requestingDeviceId: client.id,
            }));
            return;
          }
        }
        ws.send(JSON.stringify({
          type: 'file_sync_response',
          requestId: data.requestId,
          error: 'Target device offline'
        }));
        return;
      }

      // File sync response — device sends file data to another device
      if (data.action === 'file_sync_response') {
        for (const [targetWs, targetClient] of clients.entries()) {
          if (targetClient.type === 'device' && targetClient.id === data.targetDeviceId &&
              targetClient.account === client.account && targetWs.readyState === 1) {
            targetWs.send(JSON.stringify({
              type: 'file_sync_data',
              requestId: data.requestId,
              fileData: data.fileData,
              sourceDeviceId: client.id,
            }));
            return;
          }
        }
        return;
      }

      // Browse result from device
      if (data.action === 'browse_result' || data.action === 'file_result') {
        // Handled by the REST endpoint listener above
        return;
      }

      // ─── Command Routing (Client -> Device) ─────────────
      if (data.action === 'execute_command' && client.type === 'client') {
        let commandToForward = data.command;
        let assetKey = null;

        // Special handling for voice/image assets
        if (data.commandType === 'voice' || data.commandType === 'image') {
          const key = `tmp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          tempStore.set(key, { data: data.base64, ts: Date.now() });
          setTimeout(() => tempStore.delete(key), 5 * 60 * 1000); // 5min TTL
          assetKey = key;
        }

        // Find target device
        for (const [targetWs, targetClient] of clients.entries()) {
          if (targetClient.type === 'device' && targetClient.account === client.account && targetClient.id === data.targetDeviceId) {
            targetWs.send(JSON.stringify({
              action: 'agent_command',
              requestId: data.requestId,
              command: commandToForward,
              commandType: data.commandType,
              assetKey: assetKey,
              context: data.context,
              sourceClientId: id
            }));
            return;
          }
        }
        ws.send(JSON.stringify({ type: 'command_result', requestId: data.requestId, error: 'Device offline' }));
      }

      // Command Result Routing (Device -> Client)
      if (data.action === 'command_result' && client.type === 'device') {
        for (const [targetWs, targetClient] of clients.entries()) {
          if (targetClient.id === data.targetClientId) {
            targetWs.send(JSON.stringify({
              type: 'command_result',
              requestId: data.requestId,
              result: data.result
            }));
            return;
          }
        }
      }

    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  ws.on('close', () => {
    const client = clients.get(ws);
    clients.delete(ws);
    if (client && client.account) {
      broadcastDevices(client.account);

      // Notify clients about device going offline
      for (const [targetWs, targetClient] of clients.entries()) {
        if (targetClient.type === 'client' && targetClient.account === client.account) {
          targetWs.send(JSON.stringify({
            type: 'sync_event',
            event: 'device_offline',
            deviceId: client.id,
            deviceName: client.deviceName,
          }));
        }
      }
    }
  });
});

function broadcastDevices(account) {
  const devices = [];
  for (const [_, c] of clients.entries()) {
    if (c.type === 'device' && c.account === account) {
      devices.push({
        id: c.id,
        name: c.deviceName,
        syncCapable: c.syncCapable || false,
        lastSeen: c.lastSeen
      });
    }
  }

  for (const [ws, c] of clients.entries()) {
    if (c.type === 'client' && c.account === account) {
      ws.send(JSON.stringify({ type: 'devices_list', devices }));
    }
  }
}

server.listen(port, '0.0.0.0');
