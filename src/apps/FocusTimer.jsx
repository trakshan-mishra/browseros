import { useState, useEffect, useRef } from 'react';
import { useOS } from '../context/OSContext';
import './FocusTimer.css';

const MODES = {
  focus: { label: 'Focus', duration: 25 * 60, color: '#FF453A', glow: 'rgba(255,69,58,0.4)' },
  short: { label: 'Short Break', duration: 5 * 60, color: '#30D158', glow: 'rgba(48,209,88,0.4)' },
  long:  { label: 'Long Break', duration: 15 * 60, color: '#64D2FF', glow: 'rgba(100,210,255,0.4)' },
};

const STORAGE_KEY = 'nexusos-focus-sessions';

function loadSessions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveSessions(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 50)));
}

export default function FocusTimer() {
  const [mode, setMode] = useState('focus');
  const [timeLeft, setTimeLeft] = useState(MODES.focus.duration);
  const [running, setRunning] = useState(false);
  const [task, setTask] = useState('');
  const [sessions, setSessions] = useState(loadSessions);
  const [justFinished, setJustFinished] = useState(false);
  const intervalRef = useRef(null);
  const sessionStartRef = useRef(null);

  // Try to get notify from context, fall back to no-op
  let notify;
  try {
    ({ notify } = useOS());
  } catch {
    notify = () => {};
  }

  // Switch mode → reset timer
  const switchMode = (m) => {
    if (running) clearInterval(intervalRef.current);
    setMode(m);
    setTimeLeft(MODES[m].duration);
    setRunning(false);
    setJustFinished(false);
  };

  useEffect(() => {
    if (!running) return;
    sessionStartRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(intervalRef.current);
          setRunning(false);
          setJustFinished(true);
          const session = {
            type: mode,
            task: task || 'Untitled',
            startedAt: sessionStartRef.current,
            endedAt: Date.now(),
            duration: MODES[mode].duration,
          };
          const updated = [session, ...loadSessions()];
          saveSessions(updated);
          setSessions(updated.slice(0, 10));
          try { notify(`${MODES[mode].label} complete! 🎉`, task || 'Session finished'); } catch {}
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const toggle = () => {
    setJustFinished(false);
    setRunning(r => !r);
  };

  const reset = () => {
    clearInterval(intervalRef.current);
    setRunning(false);
    setTimeLeft(MODES[mode].duration);
    setJustFinished(false);
  };

  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const seconds = String(timeLeft % 60).padStart(2, '0');
  const progress = 1 - timeLeft / MODES[mode].duration;
  const circumference = 2 * Math.PI * 88;
  const { color, glow } = MODES[mode];

  const todayCount = sessions.filter(s =>
    s.type === 'focus' && new Date(s.startedAt).toDateString() === new Date().toDateString()
  ).length;

  return (
    <div className="focus-timer">
      {/* Mode Tabs */}
      <div className="ft-modes">
        {Object.entries(MODES).map(([key, m]) => (
          <button key={key}
            className={`ft-mode-btn ${mode === key ? 'ft-mode-active' : ''}`}
            style={mode === key ? { color: m.color, borderColor: m.color } : {}}
            onClick={() => switchMode(key)}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Ring Timer */}
      <div className="ft-ring-wrap">
        <svg className="ft-ring" viewBox="0 0 200 200">
          {/* Background track */}
          <circle cx="100" cy="100" r="88"
            fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7"/>
          {/* Progress arc */}
          <circle cx="100" cy="100" r="88"
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            transform="rotate(-90 100 100)"
            style={{
              transition: running ? 'stroke-dashoffset 1s linear' : 'none',
              filter: `drop-shadow(0 0 8px ${glow})`,
            }}
          />
        </svg>

        {/* Center display */}
        <div className="ft-center" style={{ '--mode-color': color, '--mode-glow': glow }}>
          <div className={`ft-time ${justFinished ? 'ft-time-done' : ''}`}>
            {justFinished ? '✓' : `${minutes}:${seconds}`}
          </div>
          <div className="ft-mode-label">{MODES[mode].label}</div>
        </div>
      </div>

      {/* Task input */}
      <input
        className="ft-task"
        placeholder="What are you working on?"
        value={task}
        onChange={e => setTask(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !running && toggle()}
      />

      {/* Controls */}
      <div className="ft-controls">
        <button
          className="ft-btn-main"
          style={{ '--mode-color': color, '--mode-glow': glow }}
          onClick={toggle}>
          {running ? '⏸ Pause' : justFinished ? '↺ Again' : '▶ Start'}
        </button>
        <button className="ft-btn-reset" onClick={reset}>↺</button>
      </div>

      {/* Today stats */}
      <div className="ft-stats">
        <div className="ft-stat">
          <span className="ft-stat-num" style={{ color }}>{todayCount}</span>
          <span className="ft-stat-label">sessions today</span>
        </div>
        <div className="ft-stat">
          <span className="ft-stat-num" style={{ color }}>{todayCount * 25}m</span>
          <span className="ft-stat-label">focused</span>
        </div>
        <div className="ft-stat">
          <span className="ft-stat-num" style={{ color }}>{sessions.length}</span>
          <span className="ft-stat-label">total sessions</span>
        </div>
      </div>

      {/* Session history */}
      {sessions.length > 0 && (
        <div className="ft-history">
          <div className="ft-history-header">Recent Sessions</div>
          <div className="ft-history-list">
            {sessions.slice(0, 8).map((s, i) => (
              <div key={i} className="ft-session">
                <span className="ft-session-dot" style={{ background: MODES[s.type]?.color }}/>
                <span className="ft-session-task">{s.task}</span>
                <span className="ft-session-dur">{Math.round(s.duration / 60)}m</span>
                <span className="ft-session-time">
                  {new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}