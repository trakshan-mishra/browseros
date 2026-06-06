import { useRef } from 'react';
import { useOS } from '../context/OSContext';
import { WALLPAPERS } from '../utils/appRegistry';
import { agent } from '../services/agent';
import './Desktop.css';

export default function Desktop() {
  const {
    wallpaper,
    brightness,
    toggleSpotlight,
    setContextMenu,
    closeContextMenu,
    contextMenu,
    widgets,
    openApp,
    setWallpaper,
    notify,
  } = useOS();
  const touchTimer = useRef(null);

  const handleContextMenu = (e) => {
    const target = e.target;
    if (target.classList?.contains('desktop') || target.classList?.contains('desktop-widgets')) {
      e.preventDefault();
      setContextMenu({
        x: Math.min(e.clientX, window.innerWidth - 230),
        y: Math.min(e.clientY, window.innerHeight - 230),
      });
    }
  };

  const handleTouchStart = (e) => {
    if (e.touches.length > 1) return;
    const touch = e.touches[0];
    clearTimeout(touchTimer.current);
    touchTimer.current = setTimeout(() => {
      setContextMenu({
        x: Math.min(touch.clientX, window.innerWidth - 230),
        y: Math.min(touch.clientY, window.innerHeight - 230),
      });
    }, 600); // 600ms long press
  };
  const cancelTouch = () => clearTimeout(touchTimer.current);

  const createDesktopFolder = async () => {
    const name = window.prompt('New folder name', 'New Folder');
    if (!name) return;
    try {
      await agent.mkdir(`~/Desktop/${name}`);
      notify('Folder created', name, '📁');
    } catch (err) {
      notify('Folder failed', err.message, '⚠️');
    }
    closeContextMenu();
  };

  const nextWallpaper = () => {
    setWallpaper((wallpaper + 1) % WALLPAPERS.length);
    closeContextMenu();
  };

  const bg = typeof wallpaper === 'number' ? WALLPAPERS[wallpaper] : wallpaper;

  return (
    <>
      <div
        className="desktop"
        style={{
          background: bg,
          filter: `brightness(${brightness / 100})`,
        }}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={cancelTouch}
        onTouchMove={cancelTouch}
        onClick={closeContextMenu}
      >
        <div className="desktop-widgets">
          <DesktopClock />
        </div>
        {widgets && widgets.map(w => (
          <div key={w.id} className="dynamic-widget" style={{ position: 'absolute', left: w.x || 100, top: w.y || 100, zIndex: 10 }}>
            {w.type === 'weather' && <WeatherWidget data={w.data} />}
          </div>
        ))}
      </div>
      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e => e.stopPropagation()}>
          <button className="context-item" onClick={() => { toggleSpotlight(); closeContextMenu(); }}>
            🔍 Spotlight Search
          </button>
          <button className="context-item" onClick={() => { openApp('finder', { title: 'Finder' }); closeContextMenu(); }}>
            📂 Open Files
          </button>
          <button className="context-item" onClick={() => { openApp('ai-assistant', { title: 'AI Assistant' }); closeContextMenu(); }}>
            🤖 Open Agent
          </button>
          <button className="context-item" onClick={createDesktopFolder}>
            📁 New Folder
          </button>
          <div className="context-divider" />
          <button className="context-item" onClick={nextWallpaper}>
            🖼️ Change Wallpaper
          </button>
          <button className="context-item" onClick={() => { openApp('settings', { title: 'Settings' }); closeContextMenu(); }}>
            ⚙️ Display Settings
          </button>
          <div className="context-divider" />
          <button className="context-item" onClick={() => { openApp('settings', { title: 'Settings' }); closeContextMenu(); }}>
            ℹ️ About NexusOS
          </button>
        </div>
      )}
    </>
  );
}

function DesktopClock() {
  const { wallpaper } = useOS();
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="desktop-clock">
      <div className="desktop-clock-time">{timeStr}</div>
      <div className="desktop-clock-date">{dateStr}</div>
    </div>
  );
}

function WeatherWidget({ data }) {
  return (
    <div className="weather-widget">
      <div className="weather-icon">🌤️</div>
      <div className="weather-temp">{data?.temp || '72'}°</div>
      <div className="weather-desc">{data?.desc || 'Sunny'}</div>
      <div className="weather-loc">{data?.location || 'New Delhi'}</div>
    </div>
  );
}
