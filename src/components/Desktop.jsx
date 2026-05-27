import { useOS } from '../context/OSContext';
import { WALLPAPERS } from '../utils/appRegistry';
import './Desktop.css';

export default function Desktop() {
  const { wallpaper, brightness, toggleSpotlight, setContextMenu, closeContextMenu, contextMenu, widgets } = useOS();

  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      className="desktop"
      style={{
        background: WALLPAPERS[wallpaper],
        filter: `brightness(${brightness / 100})`,
      }}
      onContextMenu={handleContextMenu}
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

      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e => e.stopPropagation()}>
          <button className="context-item" onClick={() => { toggleSpotlight(); closeContextMenu(); }}>
            🔍 Spotlight Search
          </button>
          <button className="context-item" onClick={closeContextMenu}>
            📁 New Folder
          </button>
          <div className="context-divider" />
          <button className="context-item" onClick={closeContextMenu}>
            🖼️ Change Wallpaper
          </button>
          <button className="context-item" onClick={closeContextMenu}>
            ⚙️ Display Settings
          </button>
          <div className="context-divider" />
          <button className="context-item" onClick={closeContextMenu}>
            ℹ️ About NexusOS
          </button>
        </div>
      )}
    </div>
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
