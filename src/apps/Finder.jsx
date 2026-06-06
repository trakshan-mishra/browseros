import { useEffect, useMemo, useRef, useState } from 'react';
import { useOS } from '../context/OSContext';
import { agent } from '../services/agent';
import './Finder.css';

function formatSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function FinderApp({ startPath = '~' }) {
  const { activeDeviceId, devices, openApp } = useOS();
  const [currentPath, setCurrentPath] = useState(startPath);
  const [parent, setParent] = useState('~');
  const [entries, setEntries] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [phoneFiles, setPhoneFiles] = useState([]);
  const [phoneHandles, setPhoneHandles] = useState(null);
  const [phonePath, setPhonePath] = useState('');
  const [mode, setMode] = useState('real');
  const phoneInputRef = useRef(null);

  const isRemote = activeDeviceId !== 'local';
  const activeDeviceName = devices.find(d => d.id === activeDeviceId)?.name || 'Unknown Device';

  useEffect(() => {
    loadPath(startPath);
  }, [startPath, activeDeviceId]);

  const phoneEntries = useMemo(() => {
    if (phoneHandles) {
      const current = phonePath ? phonePath.split('/').filter(Boolean).reduce((node, part) => node?.children?.find(child => child.name === part), phoneHandles) : phoneHandles;
      return current?.children?.map((entry) => ({
        ...entry,
        path: `phone://${phonePath ? `${phonePath}/` : ''}${entry.name}`,
        type: entry.kind === 'directory' ? 'dir' : 'file',
        size: entry.file?.size || 0,
        modified: entry.file?.lastModified || 0,
      })) || [];
    }

    if (!phoneFiles.length) return [];
    const folders = new Set();
    const files = [];
    const prefix = phonePath ? `${phonePath}/` : '';

    phoneFiles.forEach((file) => {
      const relative = file.webkitRelativePath || file.name;
      if (!relative.startsWith(prefix)) return;
      const rest = relative.slice(prefix.length);
      if (!rest) return;
      const [name, ...tail] = rest.split('/');
      if (tail.length) folders.add(name);
      else files.push({
        name,
        path: `phone://${relative}`,
        type: 'file',
        size: file.size,
        modified: file.lastModified,
        file,
      });
    });

    return [
      ...[...folders].sort().map((name) => ({
        name,
        path: `phone://${prefix}${name}`,
        type: 'dir',
        size: 0,
      })),
      ...files.sort((a, b) => a.name.localeCompare(b.name)),
    ];
  }, [phoneFiles, phoneHandles, phonePath]);

  const selectedEntry = visibleEntryByPath(selected);

  function visibleEntryByPath(path) {
    const list = mode === 'phone' ? phoneEntries : entries;
    return list.find(entry => entry.path === path);
  }

  const loadPath = async (target) => {
    setMode('real');
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
    if (mode === 'phone') {
      if (entry.type === 'dir') {
        setPhonePath(entry.path.replace('phone://', ''));
        setSelected(null);
        return;
      }
      const objectUrl = URL.createObjectURL(entry.file);
      openApp('browser', {
        title: entry.name,
        props: { startUrl: objectUrl },
        allowMultiple: true,
      });
      return;
    }

    if (entry.type === 'dir') {
      loadPath(entry.path);
      return;
    }
    try {
      openApp('browser', {
        title: entry.name,
        props: { startUrl: agent.rawUrl(entry.path) },
        allowMultiple: true,
      });
    } catch (err) {
      setError(`Could not open file: ${err.message}`);
    }
  };

  const pickPhoneFolder = () => phoneInputRef.current?.click();

  const loadPhoneHandle = async (rootHandle) => {
    const readDir = async (handle) => {
      const children = [];
      for await (const item of handle.values()) {
        if (item.kind === 'directory') {
          children.push({ name: item.name, kind: 'directory', handle: item, children: await readDir(item) });
        } else {
          children.push({ name: item.name, kind: 'file', handle: item, file: await item.getFile() });
        }
      }
      return children.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    };

    setPhoneHandles({ name: rootHandle.name, kind: 'directory', handle: rootHandle, children: await readDir(rootHandle) });
    setPhoneFiles([]);
    setMode('phone');
    setCurrentPath('Phone Files');
    setSelected(null);
    setError('');
  };

  const grantPhoneFolder = async () => {
    if (!window.showDirectoryPicker) {
      setError('Phone write access not supported here. Use Pick Phone Folder for read/download.');
      pickPhoneFolder();
      return;
    }

    try {
      const rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await loadPhoneHandle(rootHandle);
      setPhonePath('');
    } catch (err) {
      if (err.name !== 'AbortError') setError(`Phone permission failed: ${err.message}`);
    }
  };

  const handlePhoneFiles = (event) => {
    const files = [...(event.target.files || [])];
    setPhoneFiles(files);
    setPhoneHandles(null);
    setPhonePath('');
    setMode('phone');
    setCurrentPath('Phone Files');
    setParent('');
    setSelected(null);
    setError(files.length ? '' : 'Pick a folder first');
  };

  const goPhoneBack = () => {
    const parts = phonePath.split('/').filter(Boolean);
    parts.pop();
    setPhonePath(parts.join('/'));
    setSelected(null);
  };

  const createFolder = async () => {
    const base = mode === 'phone' ? 'Phone Files' : currentPath;
    if (mode === 'phone') {
      if (!phoneHandles) {
        setError('Need Grant Phone Access for write. Pick Phone Folder is read-only.');
        return;
      }
      const name = window.prompt(`New phone folder in ${base}`, 'New Folder');
      if (!name) return;
      try {
        const parts = phonePath.split('/').filter(Boolean);
        let dir = phoneHandles.handle;
        for (const part of parts) dir = await dir.getDirectoryHandle(part);
        await dir.getDirectoryHandle(name, { create: true });
        await loadPhoneHandle(phoneHandles.handle);
      } catch (err) {
        setError(`Could not create phone folder: ${err.message}`);
      }
      return;
    }

    const name = window.prompt(`New folder in ${base}`, 'New Folder');
    if (!name) return;
    try {
      await agent.mkdir(`${currentPath}/${name}`);
      await loadPath(currentPath);
    } catch (err) {
      setError(`Could not create folder: ${err.message}`);
    }
  };

  const createPhoneTextFile = async () => {
    if (mode !== 'phone' || !phoneHandles) {
      setError('Need Grant Phone Access for write. Pick Phone Folder is read-only.');
      return;
    }
    const name = window.prompt('New phone text file', 'note.txt');
    if (!name) return;
    const content = window.prompt('File text', '');
    try {
      const parts = phonePath.split('/').filter(Boolean);
      let dir = phoneHandles.handle;
      for (const part of parts) dir = await dir.getDirectoryHandle(part);
      const fileHandle = await dir.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content || '');
      await writable.close();
      await loadPhoneHandle(phoneHandles.handle);
    } catch (err) {
      setError(`Could not write phone file: ${err.message}`);
    }
  };

  const downloadEntry = (entry = selectedEntry) => {
    if (!entry || entry.type === 'dir') return;
    const link = document.createElement('a');
    link.download = entry.name;
    link.href = mode === 'phone' ? URL.createObjectURL(entry.file) : agent.rawUrl(entry.path);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const sidebar = [
    ['Home', '~', '🏠'],
    ['Desktop', '~/Desktop', '🖥️'],
    ['Documents', '~/Documents', '📄'],
    ['Downloads', '~/Downloads', '⬇️'],
    ['Pictures', '~/Pictures', '🖼️'],
    ['Pick Phone', 'phone', '📱'],
    ['Project', '/home/trakshan/temporary/os-copy', '📂'],
  ];

  const visibleEntries = mode === 'phone' ? phoneEntries : entries;
  const visiblePath = mode === 'phone' ? `Phone Files${phonePath ? `/${phonePath}` : ''}` : currentPath;
  const canGoBack = mode === 'phone' ? Boolean(phonePath) : Boolean(parent && currentPath !== parent);

  return (
    <div className="finder">
      <input
        ref={phoneInputRef}
        className="finder-file-input"
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        onChange={handlePhoneFiles}
      />
      <div className="finder-sidebar">
        <div className="finder-sidebar-section">Real Files</div>
        {sidebar.map(([name, target, icon]) => (
          <button
            key={name}
            className="finder-sidebar-item"
            onClick={() => target === 'phone' ? pickPhoneFolder() : loadPath(target)}
          >
            <span className="finder-sidebar-icon">{icon}</span>
            {name}
          </button>
        ))}
        <button className="finder-sidebar-item" onClick={grantPhoneFolder}>
          <span className="finder-sidebar-icon">✍️</span>
          Grant Phone
        </button>
      </div>
      <div className="finder-main">
        {isRemote && (
          <div className="remote-banner">
            📡 Accessing Remote Device: <strong>{activeDeviceName}</strong>
          </div>
        )}
        <div className="finder-toolbar">
          <button
            className="finder-nav-btn"
            onClick={() => mode === 'phone' ? goPhoneBack() : loadPath(parent)}
            disabled={!canGoBack}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div className="finder-breadcrumb">
            <button className="finder-crumb" onClick={() => mode === 'phone' ? pickPhoneFolder() : loadPath(currentPath)}>{visiblePath}</button>
          </div>
          <button className="finder-toolbar-btn" onClick={createFolder}>New Folder</button>
          {mode === 'phone' && <button className="finder-toolbar-btn" onClick={createPhoneTextFile}>New Text</button>}
          <button className="finder-toolbar-btn" onClick={() => openEntry(selectedEntry)} disabled={!selectedEntry}>Open</button>
          <button className="finder-toolbar-btn" onClick={() => downloadEntry()} disabled={!selectedEntry || selectedEntry.type === 'dir'}>Download</button>
        </div>
        <div className="finder-content">
          {loading && <div className="finder-empty">Loading real files...</div>}
          {error && <div className="finder-empty">{error}</div>}
          {!loading && !error && visibleEntries.map((entry) => (
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
          {!loading && !error && visibleEntries.length === 0 && (
            <div className="finder-empty">{mode === 'phone' ? 'Pick a phone folder from sidebar' : 'This folder is empty'}</div>
          )}
        </div>
      </div>
    </div>
  );
}
