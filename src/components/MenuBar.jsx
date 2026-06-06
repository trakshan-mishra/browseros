import { useState, useEffect, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { APP_REGISTRY } from '../utils/appRegistry';
import { Wifi, WifiOff, Volume2, VolumeX, Battery, BatteryCharging, Search, Bluetooth, BluetoothOff } from 'lucide-react';
import './MenuBar.css';

export default function MenuBar() {
  const { focusedAppId, toggleSpotlight, wifi, volume, notifications } = useOS();
  const [time, setTime] = useState(new Date());
  const [controlCenter, setControlCenter] = useState(false);
  const ccRef = useRef(null);
  const app = focusedAppId ? APP_REGISTRY[focusedAppId] : null;

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (ccRef.current && !ccRef.current.contains(e.target)) setControlCenter(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const dateStr = time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="menubar">
      <div className="menubar-left">
        <button className="menubar-apple" onClick={toggleSpotlight}>
          <svg width="14" height="17" viewBox="0 0 14 17" fill="currentColor">
            <path d="M13.1 12.4c-.3.7-.6 1.2-1 1.8-.6.8-1.1 1.3-1.7 1.3-.3 0-.8-.1-1.4-.4-.6-.2-1.1-.4-1.5-.4s-.9.1-1.5.4c-.6.2-1.1.4-1.4.4-.7 0-1.3-.6-1.9-1.4C1.5 12.8.7 11.1.7 9.3c0-1.5.5-2.7 1.4-3.5.7-.7 1.6-1 2.6-1 .5 0 1.1.2 1.8.5.5.2.9.4 1 .4.2 0 .6-.1 1.2-.4.8-.4 1.4-.5 1.9-.5 1.4.1 2.5.8 3.2 2.1-1.2.7-1.8 1.7-1.8 3 0 1.5.8 2.6 2 3.1zM9.8.3c0 .8-.3 1.6-.9 2.3-.7.9-1.6 1.4-2.5 1.3 0-.1 0-.2 0-.4 0-.8.3-1.6.9-2.2C7.9.6 8.8.1 9.7 0c0 .1.1.2.1.3z"/>
          </svg>
        </button>
        <span className="menubar-appname">{app?.name || 'Finder'}</span>
        <span className="menubar-item">File</span>
        <span className="menubar-item">Edit</span>
        <span className="menubar-item">View</span>
        <span className="menubar-item">Window</span>
        <span className="menubar-item">Help</span>
      </div>
      <div className="menubar-right">
        <button className="menubar-icon" onClick={toggleSpotlight} title="Spotlight">
          <Search size={14} />
        </button>
        <span className="menubar-icon">
          {wifi ? <Wifi size={14} /> : <WifiOff size={14} />}
        </span>
        <span className="menubar-icon">
          {volume > 0 ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </span>
        <span className="menubar-icon">
          <Battery size={14} />
        </span>
        <button className="menubar-icon menubar-cc-trigger" onClick={() => setControlCenter(!controlCenter)}>
          <span className="cc-dots">
            <span/><span/><span/><span/>
          </span>
        </button>
        <span className="menubar-datetime">
          <span>{dateStr}</span>
          <span>{timeStr}</span>
        </span>
      </div>
      {controlCenter && (
        <div className="control-center" ref={ccRef}>
          <ControlCenter onClose={() => setControlCenter(false)} />
        </div>
      )}
    </div>
  );
}

function ControlCenter({ onClose }) {
  const { wifi, toggleWifi, volume, setVolume, brightness, setBrightness } = useOS();
  return (
    <div className="cc-grid">
      <div className="cc-tile cc-wifi" onClick={toggleWifi}>
        {wifi ? <Wifi size={20} /> : <WifiOff size={20} />}
        <span>Wi-Fi</span>
        <small>{wifi ? 'Connected' : 'Off'}</small>
      </div>
      <div className="cc-tile cc-bt">
        <Bluetooth size={20} />
        <span>Bluetooth</span>
        <small>Off</small>
      </div>
      <div className="cc-tile cc-airdrop">
        <span className="cc-airdrop-icon">📡</span>
        <span>AirDrop</span>
        <small>Everyone</small>
      </div>
      <div className="cc-slider-group">
        <label><Volume2 size={14} /> Volume</label>
        <input type="range" min="0" max="100" value={volume} onChange={e => setVolume(+e.target.value)} />
      </div>
      <div className="cc-slider-group">
        <label>☀️ Brightness</label>
        <input type="range" min="20" max="100" value={brightness} onChange={e => setBrightness(+e.target.value)} />
      </div>
    </div>
  );
}
