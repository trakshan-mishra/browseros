import { useEffect, useState } from 'react';
import { agent } from '../services/agent';
import './Finder.css';

function formatSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function FinderApp({ startPath = '~' }) {
  const [currentPath, setCurrentPath] = useState(startPath);
  const [parent, setParent] = useState('~');
  const [entries, setEntries] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPath(startPath);
  }, [startPath]);

  const loadPath = async (target) => {
    setLoading(true);
    setError('');
    try {
      const data = await agent.files(target);
      setCurrentPath(data.path);
      setParent(data.parent);
      setEntries(data.entries || []);
      setSelected(null);
    } catch (err) {
      setError(`Bridge not running or path blocked: ${err.message}`);
    }
    setLoading(false);
  };

  const openEntry = async (entry) => {
    if (entry.type === 'dir') {
      loadPath(entry.path);
      return;
    }
    try {
      await agent.openPath(entry.path);
    } catch (err) {
      setError(`Could not open file: ${err.message}`);
    }
  };

  const sidebar = [
    ['Home', '~', '🏠'],
    ['Desktop', '~/Desktop', '🖥️'],
    ['Documents', '~/Documents', '📄'],
    ['Downloads', '~/Downloads', '⬇️'],
    ['Pictures', '~/Pictures', '🖼️'],
    ['Project', '/home/trakshan/temporary/os', '📂'],
  ];

  return (
    <div className="finder">
      <div className="finder-sidebar">
        <div className="finder-sidebar-section">Real Files</div>
        {sidebar.map(([name, target, icon]) => (
          <button key={name} className="finder-sidebar-item" onClick={() => loadPath(target)}>
            <span className="finder-sidebar-icon">{icon}</span>
            {name}
          </button>
        ))}
      </div>
      <div className="finder-main">
        <div className="finder-toolbar">
          <button className="finder-nav-btn" onClick={() => loadPath(parent)} disabled={!parent || currentPath === parent}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div className="finder-breadcrumb">
            <button className="finder-crumb" onClick={() => loadPath(currentPath)}>{currentPath}</button>
          </div>
        </div>
        <div className="finder-content">
          {loading && <div className="finder-empty">Loading real files...</div>}
          {error && <div className="finder-empty">{error}</div>}
          {!loading && !error && entries.map((entry) => (
            <div
              key={entry.path}
              className={`finder-item ${selected === entry.path ? 'finder-item-selected' : ''}`}
              onClick={() => setSelected(entry.path)}
              onDoubleClick={() => openEntry(entry)}
            >
              <div className="finder-item-icon">{entry.type === 'dir' ? '📁' : '📄'}</div>
              <div className="finder-item-name">{entry.name}</div>
              <div className="finder-item-size">{entry.type === 'dir' ? 'Folder' : formatSize(entry.size)}</div>
            </div>
          ))}
          {!loading && !error && entries.length === 0 && <div className="finder-empty">This folder is empty</div>}
        </div>
      </div>
    </div>
  );
}
