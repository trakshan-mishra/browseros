import { useEffect, useState, useCallback, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { syncService } from '../services/sync';
import './CloudDrive.css';

function formatSize(size) {
  if (!size) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function getFileIcon(name, isDir) {
  if (isDir) return '📁';
  const ext = name?.split('.').pop()?.toLowerCase();
  const map = {
    pdf: '📕', doc: '📘', docx: '📘', txt: '📄', md: '📄', rtf: '📄',
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️', bmp: '🖼️',
    mp4: '🎬', mkv: '🎬', avi: '🎬', mov: '🎬', webm: '🎬',
    mp3: '🎵', wav: '🎵', flac: '🎵', ogg: '🎵', aac: '🎵',
    zip: '📦', tar: '📦', gz: '📦', rar: '📦', '7z': '📦',
    js: '⚡', jsx: '⚡', ts: '⚡', tsx: '⚡',
    py: '🐍', rb: '💎', go: '🔵', rs: '🦀', java: '☕', c: '🔧', cpp: '🔧', h: '🔧',
    html: '🌐', css: '🎨', json: '📋', xml: '📋', yaml: '📋', yml: '📋',
    sh: '🖥️', bash: '🖥️', zsh: '🖥️',
    exe: '⚙️', app: '⚙️', dmg: '💿', iso: '💿',
  };
  return map[ext] || '📄';
}

export default function CloudDriveApp() {
  const { account, devices, activeDeviceId } = useOS();
  const [tab, setTab] = useState('files'); // files | devices | activity | status
  const [currentPath, setCurrentPath] = useState('/');
  const [entries, setEntries] = useState([]);
  const [pathHistory, setPathHistory] = useState(['/']);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncEvents, setSyncEvents] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('list'); // list | grid
  const [browsingDevice, setBrowsingDevice] = useState('local'); // 'local' or device id
  const scrollRef = useRef(null);

  // Load files for the current path
  const loadPath = useCallback(async (targetPath, device = browsingDevice) => {
    setLoading(true);
    setError('');
    setSelectedFile(null);
    setFilePreview(null);
    try {
      let data;
      if (device === 'local') {
        data = await syncService.browse(targetPath);
      } else {
        data = await syncService.browseRemote(device, targetPath, account);
      }
      setEntries(data.entries || []);
      setCurrentPath(data.virtualPath || targetPath);
    } catch (err) {
      setError(err.message);
      setEntries([]);
    }
    setLoading(false);
  }, [browsingDevice, account]);

  // Navigate to a path
  const navigateTo = useCallback((targetPath, device) => {
    const dev = device || browsingDevice;
    setPathHistory(prev => [...prev.slice(0, historyIndex + 1), targetPath]);
    setHistoryIndex(prev => prev + 1);
    loadPath(targetPath, dev);
  }, [browsingDevice, historyIndex, loadPath]);

  const goBack = () => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      loadPath(pathHistory[historyIndex - 1]);
    }
  };

  const goForward = () => {
    if (historyIndex < pathHistory.length - 1) {
      setHistoryIndex(prev => prev + 1);
      loadPath(pathHistory[historyIndex + 1]);
    }
  };

  // Initial load
  useEffect(() => {
    loadPath('/');
    syncService.getStatus().then(setSyncStatus).catch(() => {});
  }, []);

  // Reload when device changes
  useEffect(() => {
    loadPath('/', browsingDevice);
    setPathHistory(['/']);
    setHistoryIndex(0);
  }, [browsingDevice]);

  // Sync events polling
  useEffect(() => {
    const interval = setInterval(() => {
      setSyncEvents(syncService.getRecentEvents());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Periodic status refresh
  useEffect(() => {
    const interval = setInterval(() => {
      syncService.getStatus().then(setSyncStatus).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Open file/folder
  const openEntry = async (entry) => {
    if (entry.isDir) {
      navigateTo(entry.virtualPath);
    } else {
      setSelectedFile(entry);
      // Try to preview text files
      const ext = entry.name?.split('.').pop()?.toLowerCase();
      const textExts = ['txt', 'md', 'json', 'js', 'jsx', 'ts', 'tsx', 'py', 'css', 'html', 'xml', 'yaml', 'yml', 'sh', 'env', 'cfg', 'ini', 'log', 'csv'];
      if (textExts.includes(ext) && entry.size < 512 * 1024) {
        try {
          const fileData = browsingDevice === 'local'
            ? await syncService.readFile(entry.virtualPath)
            : await syncService.readFileRemote(browsingDevice, entry.virtualPath, account);
          if (fileData.data) {
            setFilePreview(atob(fileData.data));
          }
        } catch {}
      }
    }
  };

  // Breadcrumb segments
  const breadcrumbs = currentPath === '/' ? ['/'] : ['/', ...currentPath.split('/').filter(Boolean)];
  const breadcrumbPaths = breadcrumbs.map((_, i) =>
    i === 0 ? '/' : breadcrumbs.slice(1, i + 1).join('/')
  );

  // Filter entries by search
  const filteredEntries = searchQuery
    ? entries.filter(e => e.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : entries;

  const deviceLabel = browsingDevice === 'local' ? 'This Device' : (devices.find(d => d.id === browsingDevice)?.name || browsingDevice);

  return (
    <div className="cloud-drive">
      {/* ─── Sidebar ─────────────────────────────── */}
      <div className="cd-sidebar">
        <div className="cd-sidebar-header">
          <div className="cd-logo">
            <span className="cd-logo-icon">☁️</span>
            <span className="cd-logo-text">Cloud Drive</span>
          </div>
        </div>

        <div className="cd-sidebar-nav">
          <button className={`cd-nav-item ${tab === 'files' ? 'cd-nav-active' : ''}`} onClick={() => setTab('files')}>
            <span className="cd-nav-icon">📂</span> Files
          </button>
          <button className={`cd-nav-item ${tab === 'devices' ? 'cd-nav-active' : ''}`} onClick={() => setTab('devices')}>
            <span className="cd-nav-icon">🔗</span> Devices
            {devices.length > 0 && <span className="cd-badge">{devices.length}</span>}
          </button>
          <button className={`cd-nav-item ${tab === 'activity' ? 'cd-nav-active' : ''}`} onClick={() => setTab('activity')}>
            <span className="cd-nav-icon">📡</span> Activity
            {syncEvents.length > 0 && <span className="cd-badge-dot" />}
          </button>
          <button className={`cd-nav-item ${tab === 'status' ? 'cd-nav-active' : ''}`} onClick={() => setTab('status')}>
            <span className="cd-nav-icon">📊</span> Sync Status
          </button>
        </div>

        <div className="cd-sidebar-section">
          <div className="cd-section-title">Quick Access</div>
          {['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos'].map(folder => (
            <button key={folder} className="cd-quick-item" onClick={() => { setTab('files'); navigateTo(folder); }}>
              <span className="cd-nav-icon">{getFileIcon(folder, true)}</span> {folder}
            </button>
          ))}
        </div>

        <div className="cd-sidebar-section">
          <div className="cd-section-title">Devices</div>
          <button
            className={`cd-device-item ${browsingDevice === 'local' ? 'cd-device-active' : ''}`}
            onClick={() => { setBrowsingDevice('local'); setTab('files'); }}
          >
            <span className="cd-device-dot cd-dot-online" />
            <span>💻 This PC</span>
          </button>
          {devices.map(d => (
            <button
              key={d.id}
              className={`cd-device-item ${browsingDevice === d.id ? 'cd-device-active' : ''}`}
              onClick={() => { setBrowsingDevice(d.id); setTab('files'); }}
            >
              <span className="cd-device-dot cd-dot-online" />
              <span>📱 {d.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Main Content ────────────────────────── */}
      <div className="cd-main">
        {tab === 'files' && (
          <>
            {/* Toolbar */}
            <div className="cd-toolbar">
              <div className="cd-toolbar-left">
                <button className="cd-tool-btn" onClick={goBack} disabled={historyIndex <= 0} title="Back">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <button className="cd-tool-btn" onClick={goForward} disabled={historyIndex >= pathHistory.length - 1} title="Forward">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </button>
                <button className="cd-tool-btn" onClick={() => loadPath(currentPath)} title="Refresh">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                </button>
              </div>

              <div className="cd-breadcrumb">
                <span className="cd-device-tag">
                  {browsingDevice === 'local' ? '💻' : '📱'} {deviceLabel}
                </span>
                <span className="cd-breadcrumb-sep">›</span>
                {breadcrumbs.map((crumb, i) => (
                  <span key={i}>
                    <button className="cd-crumb-btn" onClick={() => navigateTo(breadcrumbPaths[i])}>
                      {crumb === '/' ? '☁️ Root' : crumb}
                    </button>
                    {i < breadcrumbs.length - 1 && <span className="cd-breadcrumb-sep">›</span>}
                  </span>
                ))}
              </div>

              <div className="cd-toolbar-right">
                <div className="cd-search">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                  <input
                    placeholder="Search files..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <button className={`cd-view-btn ${viewMode === 'list' ? 'cd-view-active' : ''}`} onClick={() => setViewMode('list')} title="List">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
                </button>
                <button className={`cd-view-btn ${viewMode === 'grid' ? 'cd-view-active' : ''}`} onClick={() => setViewMode('grid')} title="Grid">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                </button>
              </div>
            </div>

            {/* File List */}
            <div className={`cd-content ${viewMode}`} ref={scrollRef}>
              {loading && (
                <div className="cd-loading">
                  <div className="cd-spinner" />
                  <span>Loading files...</span>
                </div>
              )}
              {error && <div className="cd-error">⚠️ {error}</div>}

              {!loading && !error && viewMode === 'list' && filteredEntries.length > 0 && (
                <div className="cd-list-header">
                  <span className="cd-col-name">Name</span>
                  <span className="cd-col-size">Size</span>
                  <span className="cd-col-date">Modified</span>
                </div>
              )}

              {!loading && !error && filteredEntries.map(entry => (
                viewMode === 'list' ? (
                  <div
                    key={entry.virtualPath || entry.name}
                    className={`cd-list-item ${selectedFile?.virtualPath === entry.virtualPath ? 'cd-item-selected' : ''}`}
                    onClick={() => setSelectedFile(entry)}
                    onDoubleClick={() => openEntry(entry)}
                  >
                    <span className="cd-col-name">
                      <span className="cd-file-icon">{getFileIcon(entry.name, entry.isDir)}</span>
                      <span className="cd-file-name">{entry.name}</span>
                    </span>
                    <span className="cd-col-size">{entry.isDir ? '—' : formatSize(entry.size)}</span>
                    <span className="cd-col-date">{formatTime(entry.mtime)}</span>
                  </div>
                ) : (
                  <div
                    key={entry.virtualPath || entry.name}
                    className={`cd-grid-item ${selectedFile?.virtualPath === entry.virtualPath ? 'cd-item-selected' : ''}`}
                    onClick={() => setSelectedFile(entry)}
                    onDoubleClick={() => openEntry(entry)}
                  >
                    <div className="cd-grid-icon">{getFileIcon(entry.name, entry.isDir)}</div>
                    <div className="cd-grid-name">{entry.name}</div>
                    <div className="cd-grid-meta">{entry.isDir ? 'Folder' : formatSize(entry.size)}</div>
                  </div>
                )
              ))}

              {!loading && !error && filteredEntries.length === 0 && (
                <div className="cd-empty">
                  <div className="cd-empty-icon">📭</div>
                  <div className="cd-empty-text">{searchQuery ? 'No matching files found' : 'This folder is empty'}</div>
                </div>
              )}
            </div>

            {/* File Preview Panel */}
            {selectedFile && (
              <div className="cd-preview">
                <div className="cd-preview-header">
                  <span className="cd-preview-icon">{getFileIcon(selectedFile.name, selectedFile.isDir)}</span>
                  <span className="cd-preview-name">{selectedFile.name}</span>
                </div>
                <div className="cd-preview-meta">
                  <div className="cd-meta-row"><span>Size</span><span>{formatSize(selectedFile.size)}</span></div>
                  <div className="cd-meta-row"><span>Modified</span><span>{formatTime(selectedFile.mtime)}</span></div>
                  <div className="cd-meta-row"><span>Type</span><span>{selectedFile.isDir ? 'Folder' : selectedFile.name?.split('.').pop()?.toUpperCase() || 'File'}</span></div>
                  <div className="cd-meta-row"><span>Location</span><span>{deviceLabel}</span></div>
                </div>
                {filePreview && (
                  <div className="cd-preview-content">
                    <pre>{filePreview.substring(0, 2000)}</pre>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ─── Devices Tab ───────────────────────── */}
        {tab === 'devices' && (
          <div className="cd-panel">
            <h2 className="cd-panel-title">Connected Devices</h2>
            <p className="cd-panel-desc">All devices linked to account <strong>{account}</strong>. Browse files from any device.</p>

            <div className="cd-devices-grid">
              <div className="cd-device-card cd-device-self">
                <div className="cd-device-card-icon">💻</div>
                <div className="cd-device-card-info">
                  <div className="cd-device-card-name">{syncStatus?.deviceName || 'This PC'}</div>
                  <div className="cd-device-card-detail">{syncStatus?.platform || 'Local'} • {syncStatus?.hostname || ''}</div>
                  <div className="cd-device-card-status">
                    <span className="cd-dot-online" /> Online • Syncing
                  </div>
                </div>
                <div className="cd-device-card-stats">
                  <div>{syncStatus?.fileIndex || 0} files indexed</div>
                  <div>{Object.keys(syncStatus?.folders || {}).length} folders watched</div>
                </div>
                <button className="cd-device-browse-btn" onClick={() => { setBrowsingDevice('local'); setTab('files'); }}>
                  Browse Files →
                </button>
              </div>

              {devices.map(d => (
                <div key={d.id} className="cd-device-card">
                  <div className="cd-device-card-icon">📱</div>
                  <div className="cd-device-card-info">
                    <div className="cd-device-card-name">{d.name}</div>
                    <div className="cd-device-card-detail">ID: {d.id}</div>
                    <div className="cd-device-card-status">
                      <span className="cd-dot-online" /> Online {d.syncCapable && '• Sync Capable'}
                    </div>
                  </div>
                  <button className="cd-device-browse-btn" onClick={() => { setBrowsingDevice(d.id); setTab('files'); }}>
                    Browse Files →
                  </button>
                </div>
              ))}

              {devices.length === 0 && (
                <div className="cd-no-devices">
                  <div className="cd-no-devices-icon">🔌</div>
                  <div>No other devices connected</div>
                  <div className="cd-no-devices-hint">Run the agent-server on another machine with the same account to connect</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Activity Tab ──────────────────────── */}
        {tab === 'activity' && (
          <div className="cd-panel">
            <h2 className="cd-panel-title">Sync Activity</h2>
            <p className="cd-panel-desc">Real-time file changes across all devices</p>

            <div className="cd-activity-list">
              {syncEvents.length === 0 && (
                <div className="cd-activity-empty">
                  <div className="cd-empty-icon">📡</div>
                  <div>No sync activity yet</div>
                  <div className="cd-no-devices-hint">File changes will appear here in real-time</div>
                </div>
              )}
              {syncEvents.map((evt, i) => (
                <div key={i} className="cd-activity-item">
                  <div className="cd-activity-icon">
                    {evt.data?.fileEvent?.event === 'create' ? '➕' :
                     evt.data?.fileEvent?.event === 'modify' ? '✏️' :
                     evt.data?.fileEvent?.event === 'delete' ? '🗑️' : '📁'}
                  </div>
                  <div className="cd-activity-info">
                    <div className="cd-activity-action">
                      {evt.data?.fileEvent?.event || evt.event} — {evt.data?.fileEvent?.virtualPath || 'Unknown'}
                    </div>
                    <div className="cd-activity-device">
                      {evt.data?.deviceName || 'Unknown Device'} • {formatTime(evt.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Status Tab ────────────────────────── */}
        {tab === 'status' && (
          <div className="cd-panel">
            <h2 className="cd-panel-title">Sync Engine Status</h2>

            {syncStatus ? (
              <div className="cd-status-grid">
                <div className="cd-stat-card">
                  <div className="cd-stat-value">{syncStatus.fileIndex || 0}</div>
                  <div className="cd-stat-label">Files Indexed</div>
                </div>
                <div className="cd-stat-card">
                  <div className="cd-stat-value">{syncStatus.stats?.synced || 0}</div>
                  <div className="cd-stat-label">Files Synced</div>
                </div>
                <div className="cd-stat-card">
                  <div className="cd-stat-value">{syncStatus.stats?.conflicts || 0}</div>
                  <div className="cd-stat-label">Conflicts</div>
                </div>
                <div className="cd-stat-card">
                  <div className="cd-stat-value">{syncStatus.stats?.errors || 0}</div>
                  <div className="cd-stat-label">Errors</div>
                </div>

                <div className="cd-status-section">
                  <h3>Watched Folders</h3>
                  <div className="cd-folder-list">
                    {Object.entries(syncStatus.folders || {}).map(([name, info]) => (
                      <div key={name} className="cd-folder-item">
                        <span className="cd-folder-status">
                          {info.watching ? '🟢' : '🔴'}
                        </span>
                        <span className="cd-folder-name">{name}</span>
                        <span className="cd-folder-path">{info.path}</span>
                        <span className="cd-folder-count">{info.entries} items</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="cd-status-section">
                  <h3>Device Info</h3>
                  <div className="cd-info-grid">
                    <div className="cd-info-item"><span>Device ID</span><code>{syncStatus.deviceId}</code></div>
                    <div className="cd-info-item"><span>Device Name</span><span>{syncStatus.deviceName}</span></div>
                    <div className="cd-info-item"><span>Platform</span><span>{syncStatus.platform}</span></div>
                    <div className="cd-info-item"><span>Account</span><span>{syncStatus.account}</span></div>
                    <div className="cd-info-item"><span>Last Sync</span><span>{syncStatus.stats?.lastSync ? formatTime(syncStatus.stats.lastSync) : 'Never'}</span></div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="cd-loading">
                <div className="cd-spinner" />
                <span>Loading sync status...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
