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
    if (!target.trim()) return;
    let finalUrl = target;
    if (!target.startsWith('http://') && !target.startsWith('https://') && !target.startsWith('blob:')) {
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

  const reload = () => {
    setLoading(true);
    setUrl((current) => {
      if (current.startsWith('blob:')) return current;
      return `${current}${current.includes('?') ? '&' : '?'}_=${Date.now()}`;
    });
  };

  const openExternal = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const downloadCurrent = () => {
    const link = document.createElement('a');
    link.href = url;
    link.download = inputUrl.split('/').pop()?.split('?')[0] || 'download';
    document.body.appendChild(link);
    link.click();
    link.remove();
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
          <button className="browser-nav-btn" onClick={reload} title="Reload">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          </button>
        </div>
        <form className="browser-url-bar" onSubmit={(e) => { e.preventDefault(); navigate(inputUrl); }}>
          <span className="browser-lock">🔒</span>
          <input
            className="browser-url-input"
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            placeholder="Search or enter URL..."
          />
        </form>
        <button className="browser-open-btn" onClick={openExternal} title="Open in device browser">Open</button>
        <button className="browser-open-btn" onClick={downloadCurrent} title="Download file">Save</button>
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
