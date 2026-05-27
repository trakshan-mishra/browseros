import { useState, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { APP_REGISTRY } from '../utils/appRegistry';
import './Dock.css';

export default function Dock() {
  const { dockApps, runningApps, openApp, windows, focusWindow } = useOS();
  const [hoveredIdx, setHoveredIdx] = useState(-1);
  const dockRef = useRef(null);

  const handleClick = (appId) => {
    const existing = windows.find(w => w.appId === appId && !w.minimized);
    if (existing) {
      focusWindow(existing.id);
    } else {
      const app = APP_REGISTRY[appId];
      openApp(appId, { title: app?.name || appId, width: app?.width, height: app?.height });
    }
  };

  const getScale = (idx) => {
    if (hoveredIdx === -1) return 1;
    const dist = Math.abs(idx - hoveredIdx);
    if (dist === 0) return 1.45;
    if (dist === 1) return 1.25;
    if (dist === 2) return 1.1;
    return 1;
  };

  const getTranslateY = (idx) => {
    if (hoveredIdx === -1) return 0;
    const dist = Math.abs(idx - hoveredIdx);
    if (dist === 0) return -14;
    if (dist === 1) return -8;
    if (dist === 2) return -3;
    return 0;
  };

  return (
    <div className="dock-container">
      <div className="dock" ref={dockRef} onMouseLeave={() => setHoveredIdx(-1)}>
        {dockApps.map((appId, i) => {
          const app = APP_REGISTRY[appId];
          if (!app) return null;
          const isRunning = runningApps.includes(appId);
          const scale = getScale(i);
          const ty = getTranslateY(i);
          return (
            <button
              key={appId}
              className="dock-item"
              onMouseEnter={() => setHoveredIdx(i)}
              onClick={() => handleClick(appId)}
              style={{
                transform: `translateY(${ty}px) scale(${scale})`,
                transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
              title={app.name}
            >
              <div className="dock-icon">
                <span className="dock-icon-emoji">{app.icon}</span>
              </div>
              {isRunning && <span className="dock-indicator" />}
              <span className="dock-tooltip">{app.name}</span>
            </button>
          );
        })}
        <div className="dock-separator" />
        <button
          className="dock-item"
          onMouseEnter={() => setHoveredIdx(dockApps.length)}
          onClick={() => {}}
          style={{
            transform: `translateY(${getTranslateY(dockApps.length)}px) scale(${getScale(dockApps.length)})`,
            transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
          title="Trash"
        >
          <div className="dock-icon">
            <span className="dock-icon-emoji">🗑️</span>
          </div>
          <span className="dock-tooltip">Trash</span>
        </button>
      </div>
    </div>
  );
}
