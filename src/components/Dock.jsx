import { useState, useRef, useEffect } from 'react';
import { useOS } from '../context/OSContext';
import { APP_REGISTRY } from '../utils/appRegistry';
import './Dock.css';

export default function Dock() {
  const {
    dockApps,
    runningApps,
    openApp,
    windows,
    focusWindow
  } = useOS();

  const [hoveredIdx, setHoveredIdx] = useState(-1);
  const [visible, setVisible] = useState(false);

  const dockRef = useRef(null);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    const handleMouseMove = (e) => {
      const nearBottom =
        e.clientY >= window.innerHeight - 40;

      if (nearBottom) {
        clearTimeout(hideTimerRef.current);
        setVisible(true);
        return;
      }

      clearTimeout(hideTimerRef.current);

      hideTimerRef.current = setTimeout(() => {
        if (
          dockRef.current &&
          !dockRef.current.matches(':hover')
        ) {
          setVisible(false);
        }
      }, 1200);
    };

    window.addEventListener(
      'mousemove',
      handleMouseMove
    );

    return () => {
      clearTimeout(hideTimerRef.current);

      window.removeEventListener(
        'mousemove',
        handleMouseMove
      );
    };
  }, []);

  const handleClick = (appId) => {
    const existing = windows.find(
      w =>
        w.appId === appId &&
        !w.minimized
    );

    if (existing) {
      focusWindow(existing.id);
      return;
    }

    const app =
      APP_REGISTRY[appId];

    openApp(appId, {
      title:
        app?.name || appId,
      width:
        app?.width,
      height:
        app?.height
    });
  };

  const getScale = (idx) => {
    if (hoveredIdx === -1)
      return 1;

    const dist =
      Math.abs(
        idx - hoveredIdx
      );

    if (dist === 0)
      return 1.45;

    if (dist === 1)
      return 1.25;

    if (dist === 2)
      return 1.1;

    return 1;
  };

  const getTranslateY = (
    idx
  ) => {
    if (hoveredIdx === -1)
      return 0;

    const dist =
      Math.abs(
        idx - hoveredIdx
      );

    if (dist === 0)
      return -14;

    if (dist === 1)
      return -8;

    if (dist === 2)
      return -3;

    return 0;
  };

  return (
    <div
      className={`dock-container ${
        visible
          ? 'dock-visible'
          : ''
      }`}
    >
      <div
        className="dock"
        ref={dockRef}
        onMouseEnter={() => {
          clearTimeout(
            hideTimerRef.current
          );

          setVisible(true);
        }}
        onMouseLeave={() => {
          setHoveredIdx(-1);

          clearTimeout(
            hideTimerRef.current
          );

          hideTimerRef.current =
            setTimeout(() => {
              if (
                dockRef.current &&
                !dockRef.current.matches(
                  ':hover'
                )
              ) {
                setVisible(false);
              }
            }, 1000);
        }}
      >
        {dockApps.map(
          (appId, i) => {
            const app =
              APP_REGISTRY[
                appId
              ];

            if (!app)
              return null;

            const isRunning =
              runningApps.includes(
                appId
              );

            const scale =
              getScale(i);

            const ty =
              getTranslateY(i);

            return (
              <button
                key={appId}
                className="dock-item"
                onMouseEnter={() =>
                  setHoveredIdx(i)
                }
                onClick={() =>
                  handleClick(
                    appId
                  )
                }
                style={{
                  transform:
                    `translateY(${ty}px) scale(${scale})`,
                  transition:
                    'transform 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                }}
                title={
                  app.name
                }
              >
                <div className="dock-icon">
                  <span className="dock-icon-emoji">
                    {app.icon}
                  </span>
                </div>

                {isRunning && (
                  <span className="dock-indicator" />
                )}

                <span className="dock-tooltip">
                  {app.name}
                </span>
              </button>
            );
          }
        )}

        <div className="dock-separator" />

        <button
          className="dock-item"
          onMouseEnter={() =>
            setHoveredIdx(
              dockApps.length
            )
          }
          title="Trash"
        >
          <div className="dock-icon">
            <span className="dock-icon-emoji">
              🗑️
            </span>
          </div>

          <span className="dock-tooltip">
            Trash
          </span>
        </button>
      </div>
    </div>
  );
}