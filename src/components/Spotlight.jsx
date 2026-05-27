import { useState, useEffect, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { APP_REGISTRY } from '../utils/appRegistry';
import { Search } from 'lucide-react';
import './Spotlight.css';

export default function Spotlight() {
  const { spotlightOpen, closeSpotlight, toggleSpotlight, openApp } = useOS();
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (spotlightOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [spotlightOpen]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (spotlightOpen) closeSpotlight(); else toggleSpotlight();
      }
      if (e.key === 'Escape' && spotlightOpen) closeSpotlight();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [spotlightOpen, closeSpotlight, toggleSpotlight]);

  if (!spotlightOpen) return null;

  const results = Object.values(APP_REGISTRY).filter(app =>
    app.name.toLowerCase().includes(query.toLowerCase()) ||
    app.id.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (appId) => {
    const app = APP_REGISTRY[appId];
    openApp(appId, { title: app.name, width: app.width, height: app.height });
    closeSpotlight();
  };

  const askAI = () => {
    if (!query.trim()) return;
    const app = APP_REGISTRY['ai-assistant'];
    openApp('ai-assistant', { title: app.name, width: app.width, height: app.height, props: { initialPrompt: query } });
    closeSpotlight();
  };

  return (
    <div className="spotlight-overlay" onClick={closeSpotlight}>
      <div className="spotlight" onClick={e => e.stopPropagation()}>
        <div className="spotlight-input-row">
          <Search size={20} className="spotlight-search-icon" />
          <input
            ref={inputRef}
            className="spotlight-input"
            placeholder="Search apps, files, or ask AI..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && results.length > 0) handleSelect(results[0].id);
              else if (e.key === 'Enter') askAI();
            }}
          />
        </div>
        {query && (
          <div className="spotlight-results">
            {results.length === 0 ? (
              <button className="spotlight-result" onClick={askAI}>
                <span className="spotlight-result-icon">🤖</span>
                <div className="spotlight-result-info">
                  <span className="spotlight-result-name">Ask AuraAI</span>
                  <span className="spotlight-result-type">{query}</span>
                </div>
              </button>
            ) : (
              results.map(app => (
                <button key={app.id} className="spotlight-result" onClick={() => handleSelect(app.id)}>
                  <span className="spotlight-result-icon">{app.icon}</span>
                  <div className="spotlight-result-info">
                    <span className="spotlight-result-name">{app.name}</span>
                    <span className="spotlight-result-type">Application</span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
