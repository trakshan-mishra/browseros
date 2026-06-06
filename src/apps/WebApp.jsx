/**
 * NexusOS — WebApp Wrapper
 * DROP IN: src/apps/WebApp.jsx
 *
 * A generic iframe-based app for opening any URL inside a NexusOS window.
 * Used by MovieMX, TradeTrack AI, and any future web app you own.
 *
 * HOW TO WIRE UP in App.jsx:
 *   1. Import: import WebApp from './apps/WebApp';
 *   2. Add to APP_COMPONENTS:
 *        'moviemx':    (props) => <WebApp {...props} url="https://moviemx.netlify.app" />,
 *        'tradetrack': (props) => <WebApp {...props} url="https://tradetrack-ai.netlify.app" />,
 *
 * That's it. Any app with a `url` field in APP_REGISTRY will render as a full iframe.
 */

import { useState, useRef } from 'react';
import './WebApp.css';

export default function WebApp({ url, title }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(url);
  const iframeRef = useRef(null);

  const reload = () => {
    setLoading(true);
    setError(false);
    if (iframeRef.current) {
      iframeRef.current.src = currentUrl;
    }
  };

  const openExternal = () => {
    window.open(currentUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="webapp">
      {/* Minimal toolbar */}
      <div className="webapp-bar">
        <button className="webapp-btn" onClick={reload} title="Reload">↺</button>
        <div className="webapp-url">{currentUrl}</div>
        <button className="webapp-btn" onClick={openExternal} title="Open in browser">⬡</button>
      </div>

      {/* Loading overlay */}
      {loading && !error && (
        <div className="webapp-loading">
          <div className="webapp-spinner" />
          <span>Loading {title || url}…</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="webapp-error">
          <div className="webapp-error-icon">⚠️</div>
          <div className="webapp-error-title">Could not load</div>
          <div className="webapp-error-url">{currentUrl}</div>
          <div className="webapp-error-hint">
            Some sites block iframes. Try opening externally.
          </div>
          <div className="webapp-error-actions">
            <button className="webapp-action-btn" onClick={reload}>↺ Retry</button>
            <button className="webapp-action-btn webapp-action-primary" onClick={openExternal}>
              Open in Browser ↗
            </button>
          </div>
        </div>
      )}

      {/* The actual iframe */}
      <iframe
        ref={iframeRef}
        className="webapp-iframe"
        src={currentUrl}
        title={title || currentUrl}
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setError(true); }}
        allow="fullscreen; clipboard-read; clipboard-write"
        style={{ display: error ? 'none' : 'block' }}
      />
    </div>
  );
}