import { useState, useEffect } from 'react';
import { useOS } from '../context/OSContext';
import { WALLPAPERS } from '../utils/appRegistry';
import './Settings.css';

export default function SettingsApp() {
  const { wallpaper, setWallpaper, volume, setVolume, brightness, setBrightness, wifi, toggleWifi } = useOS();
  const [tab, setTab] = useState('general');
  const [aiConfig, setAiConfig] = useState({ provider: 'groq', groqKey: '', geminiKey: '' });

  useEffect(() => {
    const saved = localStorage.getItem('nexusos-ai-config');
    if (saved) {
      const parsed = JSON.parse(saved);
      setAiConfig(prev => ({
        ...prev,
        provider: parsed.provider || 'groq',
        groqKey: parsed.provider === 'groq' ? parsed.apiKey : prev.groqKey,
        geminiKey: parsed.provider === 'gemini' ? parsed.apiKey : prev.geminiKey,
      }));
    }
  }, []);

  const saveAiConfig = () => {
    const config = {
      provider: aiConfig.provider,
      apiKey: aiConfig.provider === 'groq' ? aiConfig.groqKey : aiConfig.geminiKey,
    };
    localStorage.setItem('nexusos-ai-config', JSON.stringify(config));
    alert('AI configuration saved! Restart AI Assistant to apply.');
  };

  const tabs = [
    { id: 'general', name: 'General', icon: '⚙️' },
    { id: 'appearance', name: 'Appearance', icon: '🎨' },
    { id: 'ai', name: 'AI Configuration', icon: '🤖' },
    { id: 'sound', name: 'Sound', icon: '🔊' },
    { id: 'network', name: 'Network', icon: '📡' },
    { id: 'about', name: 'About', icon: 'ℹ️' },
  ];

  return (
    <div className="settings">
      <div className="settings-sidebar">
        {tabs.map(t => (
          <button key={t.id}
            className={`settings-tab ${tab === t.id ? 'settings-tab-active' : ''}`}
            onClick={() => setTab(t.id)}>
            <span className="settings-tab-icon">{t.icon}</span>
            {t.name}
          </button>
        ))}
      </div>
      <div className="settings-content">
        {tab === 'general' && (
          <div className="settings-panel">
            <h2>General</h2>
            <div className="settings-group">
              <label>Username</label>
              <input className="settings-input" defaultValue="User" placeholder="Enter your name" />
            </div>
            <div className="settings-group">
              <label>Language</label>
              <select className="settings-select"><option>English</option></select>
            </div>
          </div>
        )}
        {tab === 'appearance' && (
          <div className="settings-panel">
            <h2>Appearance</h2>
            <div className="settings-group">
              <label>Wallpaper</label>
              <div className="wallpaper-grid">
                {WALLPAPERS.map((wp, i) => (
                  <button key={i} className={`wallpaper-option ${wallpaper === i ? 'wallpaper-active' : ''}`}
                    style={{ background: wp }} onClick={() => setWallpaper(i)} />
                ))}
              </div>
            </div>
            <div className="settings-group">
              <label>Brightness</label>
              <input type="range" min="20" max="100" value={brightness}
                onChange={e => setBrightness(+e.target.value)} className="settings-range" />
              <span className="settings-value">{brightness}%</span>
            </div>
          </div>
        )}
        {tab === 'ai' && (
          <div className="settings-panel">
            <h2>AI Configuration</h2>
            <p className="settings-desc">Configure your AI provider and API keys to enable NexusAI assistant.</p>
            <div className="settings-group">
              <label>AI Provider</label>
              <div className="provider-cards">
                <button className={`provider-card ${aiConfig.provider === 'groq' ? 'provider-active' : ''}`}
                  onClick={() => setAiConfig(p => ({ ...p, provider: 'groq' }))}>
                  <span className="provider-icon">⚡</span>
                  <span className="provider-name">Groq</span>
                  <span className="provider-model">Llama 3.3 70B</span>
                </button>
                <button className={`provider-card ${aiConfig.provider === 'gemini' ? 'provider-active' : ''}`}
                  onClick={() => setAiConfig(p => ({ ...p, provider: 'gemini' }))}>
                  <span className="provider-icon">✨</span>
                  <span className="provider-name">Gemini</span>
                  <span className="provider-model">Gemini 2.0 Flash</span>
                </button>
              </div>
            </div>
            <div className="settings-group">
              <label>Groq API Key</label>
              <input className="settings-input" type="password" placeholder="gsk_..."
                value={aiConfig.groqKey} onChange={e => setAiConfig(p => ({ ...p, groqKey: e.target.value }))} />
              <small className="settings-hint">Get your key at <a href="https://console.groq.com" target="_blank" rel="noreferrer">console.groq.com</a></small>
            </div>
            <div className="settings-group">
              <label>Gemini API Key</label>
              <input className="settings-input" type="password" placeholder="AIza..."
                value={aiConfig.geminiKey} onChange={e => setAiConfig(p => ({ ...p, geminiKey: e.target.value }))} />
              <small className="settings-hint">Get your key at <a href="https://aistudio.google.com" target="_blank" rel="noreferrer">aistudio.google.com</a></small>
            </div>
            <button className="settings-save-btn" onClick={saveAiConfig}>💾 Save Configuration</button>
          </div>
        )}
        {tab === 'sound' && (
          <div className="settings-panel">
            <h2>Sound</h2>
            <div className="settings-group">
              <label>Volume</label>
              <input type="range" min="0" max="100" value={volume}
                onChange={e => setVolume(+e.target.value)} className="settings-range" />
              <span className="settings-value">{volume}%</span>
            </div>
          </div>
        )}
        {tab === 'network' && (
          <div className="settings-panel">
            <h2>Network</h2>
            <div className="settings-group settings-toggle-group">
              <label>Wi-Fi</label>
              <button className={`settings-toggle ${wifi ? 'settings-toggle-on' : ''}`} onClick={toggleWifi}>
                <span className="settings-toggle-knob" />
              </button>
            </div>
          </div>
        )}
        {tab === 'about' && (
          <div className="settings-panel">
            <h2>About NexusOS</h2>
            <div className="about-logo">🖥️</div>
            <div className="about-info">
              <h3>NexusOS</h3>
              <p>Version 1.0.0</p>
              <p>A browser-based operating system with AI integration.</p>
              <p className="about-specs">
                Display: {window.screen.width}×{window.screen.height}<br/>
                Cores: {navigator.hardwareConcurrency || 'N/A'}<br/>
                Memory: {navigator.deviceMemory || 'N/A'} GB<br/>
                Platform: {navigator.platform}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
