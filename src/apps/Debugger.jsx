import { useState, useEffect } from 'react';
import { useOS } from '../context/OSContext';
import { agent } from '../services/agent';
import { cloud } from '../services/cloud';
import './Debugger.css';

export default function DebuggerApp() {
  const os = useOS();
  const [activeTab, setActiveTab] = useState('state');
  const [agentHealth, setAgentHealth] = useState({ loading: true, data: null });
  
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const data = await agent.health();
        setAgentHealth({ loading: false, data });
      } catch (err) {
        setAgentHealth({ loading: false, data: { ok: false, error: err.message } });
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  // Filter out internal React/Context props from display
  const cleanState = { ...os };
  delete cleanState.dispatch;
  delete cleanState.openApp;
  delete cleanState.closeWindow;
  delete cleanState.focusWindow;
  delete cleanState.minimizeWindow;
  delete cleanState.maximizeWindow;
  delete cleanState.updateWindow;
  delete cleanState.toggleSpotlight;
  delete cleanState.closeSpotlight;
  delete cleanState.notify;
  delete cleanState.dismissNotification;
  delete cleanState.setWallpaper;
  delete cleanState.setVolume;
  delete cleanState.setBrightness;
  delete cleanState.toggleWifi;
  delete cleanState.setContextMenu;
  delete cleanState.closeContextMenu;
  delete cleanState.addWidget;
  delete cleanState.setActiveDevice;
  delete cleanState.login;
  delete cleanState.setUsername;

  return (
    <div className="debugger">
      <div className="debugger-sidebar">
        <button className={activeTab === 'state' ? 'active' : ''} onClick={() => setActiveTab('state')}>📦 OS State</button>
        <button className={activeTab === 'network' ? 'active' : ''} onClick={() => setActiveTab('network')}>🌐 Network</button>
        <button className={activeTab === 'devices' ? 'active' : ''} onClick={() => setActiveTab('devices')}>📱 Devices</button>
      </div>
      
      <div className="debugger-content">
        {activeTab === 'state' && (
          <div className="debugger-panel">
            <h3>Global OS State</h3>
            <pre className="debugger-json">{JSON.stringify(cleanState, null, 2)}</pre>
          </div>
        )}

        {activeTab === 'network' && (
          <div className="debugger-panel">
            <h3>Connectivity Status</h3>
            <div className="debug-item">
              <span className="debug-label">Cloud WebSocket:</span>
              <span className={`debug-status ${cloud.ws?.readyState === WebSocket.OPEN ? 'status-ok' : 'status-err'}`}>
                {cloud.ws?.readyState === WebSocket.OPEN ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>
            <div className="debug-item">
              <span className="debug-label">Agent Bridge:</span>
              <span className={`debug-status ${agentHealth.data?.ok ? 'status-ok' : 'status-err'}`}>
                {agentHealth.loading ? 'CHECKING...' : (agentHealth.data?.ok ? 'ONLINE' : 'OFFLINE')}
              </span>
            </div>
            {agentHealth.data?.error && <div className="debug-error">{agentHealth.data.error}</div>}
            
            <div style={{ marginTop: '20px' }}>
              <h4>Service URLs</h4>
              <code>Agent: http://127.0.0.1:4777</code><br/>
              <code>Cloud: ws://127.0.0.1:4778</code>
            </div>
          </div>
        )}

        {activeTab === 'devices' && (
          <div className="debugger-panel">
            <h3>Connected Cloud Devices</h3>
            {os.devices.length === 0 ? (
              <p>No remote devices connected to account: <strong>{os.account}</strong></p>
            ) : (
              <ul className="debug-device-list">
                <li className={os.activeDeviceId === 'local' ? 'active' : ''}>
                  Local Machine (Default)
                </li>
                {os.devices.map(d => (
                  <li key={d.id} className={os.activeDeviceId === d.id ? 'active' : ''}>
                    {d.name} <small>({d.id})</small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
