import { useEffect } from 'react';
import { useOS } from './context/OSContext';
import Desktop from './components/Desktop';
import MenuBar from './components/MenuBar';
import Dock from './components/Dock';
import Window from './components/Window';
import Spotlight from './components/Spotlight';

// Apps
import FinderApp from './apps/Finder';
import TerminalApp from './apps/Terminal';
import NotesApp from './apps/Notes';
import BrowserApp from './apps/Browser';
import CalculatorApp from './apps/Calculator';
import AIAssistant from './apps/AIAssistant';
import SettingsApp from './apps/Settings';
import SensorsApp from './apps/Sensors';
import DebuggerApp from './apps/Debugger';
import FocusTimer from './apps/FocusTimer';
/*import Kanban from './apps/Kanban';
import Calendar from './apps/Calendar';
import Dashboard from './apps/Dashboard';
*/
import CloudDriveApp from './apps/CloudDrive';

import WebApp from './apps/WebApp';                            // ← ADD
 
 
// STEP 2: Add these two lines to the APP_COMPONENTS object:
const APP_COMPONENTS = {
  'finder': FinderApp,
  'terminal': TerminalApp,
  'notes': NotesApp,
  'browser': BrowserApp,
  'calculator': CalculatorApp,
  'ai-assistant': AIAssistant,
  'settings': SettingsApp,
  'sensors': SensorsApp,
  'debugger': DebuggerApp,
  'cloud-drive': CloudDriveApp,
  'focus-timer': FocusTimer,                                   // ← ADD (if not already)
  'moviemx':    (props) => <WebApp {...props} url="https://moviemx.netlify.app" title="MovieMX" />,       // ← ADD
  'tradetrack': (props) => <WebApp {...props} url="https://tradetrack-ai.netlify.app" title="TradeTrack AI" />, // ← ADD
};
 


export default function App() {
  const { windows, currentWorkspace, setContextMenu } = useOS();

  useEffect(() => {
    // Context menu is now allowed globally so right-click works in apps.
    // The Desktop component still intercepts right-clicks for the OS menu.
  }, []);

  return (
    <div
      className="nexusos"
      onContextMenu={(e) => {
        if (e.target.closest('input, textarea')) return;
        e.preventDefault();
        setContextMenu({
          x: Math.min(e.clientX, window.innerWidth - 230),
          y: Math.min(e.clientY, window.innerHeight - 300),
        });
      }}
    >
      <Desktop />
      <MenuBar />
      {windows
  .filter(
    win => win.workspaceId === currentWorkspace
  )
  .map(win => {
        const AppComponent = APP_COMPONENTS[win.appId];
        if (!AppComponent) return null;
        return (
          <Window key={win.id} {...win}>
            <AppComponent {...win.props} />
          </Window>
        );
      })}
      <Spotlight />
      <Dock />
    </div>
  );
}
