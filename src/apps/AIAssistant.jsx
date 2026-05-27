import { useState, useRef, useEffect } from 'react';
import { useOS } from '../context/OSContext';
import { APP_REGISTRY } from '../utils/appRegistry';
import { agent } from '../services/agent';
import './AIAssistant.css';

export default function AIAssistant({ initialPrompt = '' }) {
  const { openApp, setWallpaper, setBrightness, addWidget } = useOS();
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "AuraAI online. I use the local bridge for real files, app opens, hardware status, and Groq replies." }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [bridge, setBridge] = useState({ ok: false, groq: false });
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  useEffect(() => { agent.health().then(setBridge).catch(() => setBridge({ ok: false, groq: false })); }, []);

  useEffect(() => {
    if (initialPrompt) setInput(initialPrompt);
  }, [initialPrompt]);

  const sendMessage = async (override) => {
    const text = (override ?? input).trim();
    if (!text || loading) return;

    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const data = await agent.command(text, {});
      
      if (data.frontendActions && data.frontendActions.length > 0) {
        for (const act of data.frontendActions) {
          if (act.action === 'openApp') {
            const match = Object.values(APP_REGISTRY).find(a => a.id === act.payload);
            if (match) openApp(match.id, { title: match.name, width: match.width, height: match.height, props: { startUrl: act.url } });
          } else if (act.action === 'setWallpaper') {
            setWallpaper(Number(act.payload) || 0);
          } else if (act.action === 'setBrightness') {
            setBrightness(Number(act.payload) || 100);
          } else if (act.action === 'createWidget') {
            addWidget(act.payload, act.data, 100, 100);
          }
        }
      }
      
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Bridge not working: ${err.message}\n\nRun: node agent-server.js`
      }]);
    }
    setLoading(false);
  };

  return (
    <div className="ai-assistant">
      <div className="ai-header">
        <div className="ai-avatar">🤖</div>
        <div>
          <div className="ai-name">AuraAI</div>
          <div className="ai-status">
            {bridge.ok ? `Bridge ON / Groq ${bridge.groq ? 'ON' : 'OFF'}` : 'Bridge OFF'}
          </div>
        </div>
      </div>
      <div className="ai-actions">
        {['open Finder', 'list files', 'hardware status', 'open Google'].map(action => (
          <button key={action} onClick={() => sendMessage(action)}>{action}</button>
        ))}
      </div>
      <div className="ai-messages" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`ai-msg ai-msg-${msg.role}`}>
            <div className="ai-msg-content">{msg.content}</div>
          </div>
        ))}
        {loading && (
          <div className="ai-msg ai-msg-assistant">
            <div className="ai-typing">
              <span /><span /><span />
            </div>
          </div>
        )}
      </div>
      <div className="ai-input-row">
        <input
          ref={inputRef}
          className="ai-input"
          placeholder="Ask AuraAI to open apps, list files, check hardware..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
        />
        <button className="ai-send" onClick={sendMessage} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
        </button>
      </div>
    </div>
  );
}
