import { useRef, useState, useCallback, useEffect } from 'react';
import { useOS } from '../context/OSContext';
import './Window.css';

export default function Window({ id, appId, title, x, y, width, height, minimized, maximized, zIndex, children }) {
  const { closeWindow, focusWindow, minimizeWindow, maximizeWindow, updateWindow, activeWindowId } = useOS();
  const windowRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const isActive = activeWindowId === id;

  const handleDragStart = useCallback((e) => {
    if (e.target.closest('.window-traffic')) return;
    e.preventDefault();
    focusWindow(id);
    setDragging(true);
    dragOffset.current = { x: e.clientX - x, y: e.clientY - y };
  }, [id, x, y, focusWindow]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e) => {
      updateWindow(id, {
        x: Math.max(0, e.clientX - dragOffset.current.x),
        y: Math.max(28, e.clientY - dragOffset.current.y),
      });
    };
    const up = () => setDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [dragging, id, updateWindow]);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    focusWindow(id);
    setResizing(true);
    resizeStart.current = { x: e.clientX, y: e.clientY, w: width, h: height };
  }, [id, width, height, focusWindow]);

  useEffect(() => {
    if (!resizing) return;
    const move = (e) => {
      const dw = e.clientX - resizeStart.current.x;
      const dh = e.clientY - resizeStart.current.y;
      updateWindow(id, {
        width: Math.max(320, resizeStart.current.w + dw),
        height: Math.max(200, resizeStart.current.h + dh),
      });
    };
    const up = () => setResizing(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [resizing, id, updateWindow]);

  if (minimized) return null;

  const style = maximized
    ? { left: 0, top: 28, width: '100vw', height: 'calc(100vh - 28px)', zIndex, borderRadius: 0 }
    : { left: x, top: y, width, height, zIndex };

  return (
    <div
      ref={windowRef}
      className={`window ${isActive ? 'window-active' : 'window-inactive'} ${maximized ? 'window-maximized' : ''}`}
      style={style}
      onMouseDown={() => focusWindow(id)}
    >
      <div className="window-titlebar" onMouseDown={handleDragStart} onDoubleClick={() => maximizeWindow(id)}>
        <div className="window-traffic">
          <button className="traffic-btn traffic-close" onClick={() => closeWindow(id)} title="Close">
            <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          <button className="traffic-btn traffic-minimize" onClick={() => minimizeWindow(id)} title="Minimize">
            <svg width="8" height="2" viewBox="0 0 8 2"><path d="M1 1h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          <button className="traffic-btn traffic-maximize" onClick={() => maximizeWindow(id)} title="Maximize">
            <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 2.5V7h4.5M3 1h4v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
          </button>
        </div>
        <span className="window-title">{title}</span>
        <div className="window-titlebar-spacer" />
      </div>
      <div className="window-content">
        {children}
      </div>
      {!maximized && <div className="window-resize-handle" onMouseDown={handleResizeStart} />}
    </div>
  );
}
