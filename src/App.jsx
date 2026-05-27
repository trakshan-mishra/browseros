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

const APP_COMPONENTS = {
  'finder': FinderApp,
  'terminal': TerminalApp,
  'notes': NotesApp,
  'browser': BrowserApp,
  'calculator': CalculatorApp,
  'ai-assistant': AIAssistant,
  'settings': SettingsApp,
  'sensors': SensorsApp,
};

export default function App() {
  const { windows } = useOS();

  useEffect(() => {
    // Disable right-click globally by default
    const handleContext = (e) => e.preventDefault();
    document.addEventListener('contextmenu', handleContext);
    return () => document.removeEventListener('contextmenu', handleContext);
  }, []);

  return (
    <div className="nexusos">
      <Desktop />
      <MenuBar />
      {windows.map(win => {
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
