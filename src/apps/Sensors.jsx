import { useEffect, useRef, useState } from 'react';
import { agent } from '../services/agent';
import './Sensors.css';

export default function SensorsApp() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const [metrics, setMetrics] = useState(null);
  const [gaze, setGaze] = useState({ x: 50, y: 50, label: 'off' });
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const tick = () => agent.metrics().then(setMetrics).catch(() => setMetrics(null));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setRunning(true);
      scan();
    } catch {
      setGaze({ x: 50, y: 50, label: 'camera blocked' });
    }
  };

  const stop = () => {
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setRunning(false);
    setGaze({ x: 50, y: 50, label: 'off' });
  };

  const scan = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      frameRef.current = requestAnimationFrame(scan);
      return;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = 220;
    canvas.height = 140;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let sx = 0, sy = 0, count = 0;
    for (let y = 35; y < 88; y += 2) {
      for (let x = 35; x < 185; x += 2) {
        const i = (y * canvas.width + x) * 4;
        if (pixels[i] + pixels[i + 1] + pixels[i + 2] < 165) {
          sx += x; sy += y; count += 1;
        }
      }
    }
    if (count > 12) {
      const x = Math.max(0, Math.min(100, 100 - (sx / count / canvas.width) * 100));
      const y = Math.max(0, Math.min(100, (sy / count / canvas.height) * 100));
      setGaze({ x, y, label: x < 42 ? 'left' : x > 58 ? 'right' : y < 38 ? 'up' : y > 58 ? 'down' : 'center' });
    }
    frameRef.current = requestAnimationFrame(scan);
  };

  useEffect(() => stop, []);

  return (
    <div className="sensors">
      <section className="sensor-camera">
        <div className="sensor-video">
          <video ref={videoRef} muted playsInline />
          <canvas ref={canvasRef} />
          <span className="gaze-dot" style={{ left: `${gaze.x}%`, top: `${gaze.y}%` }} />
        </div>
        <div className="sensor-controls">
          <button onClick={running ? stop : start}>{running ? 'Stop eye tracking' : 'Start eye tracking'}</button>
          <strong>{gaze.label}</strong>
        </div>
      </section>
      <section className="sensor-metrics">
        <h2>Hardware Live</h2>
        <p><b>Platform</b>{metrics?.platform || 'bridge off'}</p>
        <p><b>CPU</b>{metrics?.cpu || '-'}</p>
        <p><b>Cores</b>{metrics?.cores || '-'}</p>
        <p><b>Load</b>{metrics ? metrics.load.toFixed(2) : '-'}</p>
        <p><b>RAM</b>{metrics ? `${metrics.ramFreeMb}/${metrics.ramTotalMb} MB free` : '-'}</p>
      </section>
    </div>
  );
}
