import { useState } from 'react';
import './Browser.css';

export default function BrowserApp({ startUrl }) {
  const defaultUrl = startUrl || 'https://www.google.com';
  const [url, setUrl] = useState(defaultUrl);
  const [inputUrl, setInputUrl] = useState(defaultUrl);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([defaultUrl]);
  const [histIdx, setHistIdx] = useState(0);

  const navigate = (target) => {
    let finalUrl = target;
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      if (target.includes('.') && !target.includes(' ')) {
        finalUrl = 'https://' + target;
      } else {
        finalUrl = `https://www.google.com/search?igu=1&q=${encodeURIComponent(target)}`;
      }
    }
    setUrl(finalUrl);
    setInputUrl(finalUrl);
    setLoading(true);
    const newHistory = [...history.slice(0, histIdx + 1), finalUrl];
    setHistory(newHistory);
    setHistIdx(newHistory.length - 1);
  };

  const goBack = () => {
    if (histIdx > 0) {
      const newIdx = histIdx - 1;
      setHistIdx(newIdx);
      setUrl(history[newIdx]);
      setInputUrl(history[newIdx]);
    }
  };

  const goForward = () => {
    if (histIdx < history.length - 1) {
      const newIdx = histIdx + 1;
      setHistIdx(newIdx);
      setUrl(history[newIdx]);
      setInputUrl(history[newIdx]);
    }
  };

  return (
    <div className="browser">
      <div className="browser-toolbar">
        <div className="browser-nav-btns">
          <button className="browser-nav-btn" onClick={goBack} disabled={histIdx <= 0}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button className="browser-nav-btn" onClick={goForward} disabled={histIdx >= history.length - 1}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <button className="browser-nav-btn" onClick={() => setLoading(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          </button>
        </div>
        <div className="browser-url-bar">
          <span className="browser-lock">🔒</span>
          <input
            className="browser-url-input"
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && navigate(inputUrl)}
            placeholder="Search or enter URL..."
          />
        </div>
      </div>
      <div className="browser-content">
        <iframe
          src={url}
          className="browser-iframe"
          onLoad={() => setLoading(false)}
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          title="browser"
        />
        {loading && (
          <div className="browser-loading">
            <div className="browser-loading-bar" />
          </div>
        )}
      </div>
    </div>
  );
}
