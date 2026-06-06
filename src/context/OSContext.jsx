import { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { cloud } from '../services/cloud';
import { agent } from '../services/agent';

const OSContext = createContext();

const initialState = {
  account: 'default',
  devices: [],
  activeDeviceId: 'local',
   windows: [],
  workspaces: [
  { id: 1, windows: [] },
  { id: 2, windows: [] },
  { id: 3, windows: [] }
],

currentWorkspace: 1,

activeWindowId: null,
focusedAppId: null,
dockApps: [
  'finder',
  'cloud-drive',
  'focus-timer',
  'moviemx',
  'tradetrack',
  'terminal',
  'notes',
  'browser',
  'calculator',
  'settings',
  'ai-assistant',
  'sensors',
  'debugger'
],
system: {
  wifi: true,
  bluetooth: false,
  airplaneMode: false,

  brightness: 85,
  volume: 70,

  batteryLevel: 87,
  batteryCharging: true,

  batteryTimeRemaining: '1h 24m',
  chargeTimeRemaining: '32m',

  focusMode: false,
  darkMode: true
},
  runningApps: [],
  notifications: [],
  spotlightOpen: false,
  wallpaper: 0,
  volume: 75,
  brightness: 100,
  wifi: true,
  bluetooth: false,
  darkMode: true,
  username: 'User',
  contextMenu: null,
  maximizedWindowId: null,
  widgets: [],
};

function osReducer(state, action) {
  switch (action.type) {
    case 'SYNC_CLOUD_STATE':
      return { ...state, ...action.payload };
    case 'SET_ACCOUNT':
      return { ...state, account: action.payload };
    case 'SET_DEVICES':
      return { ...state, devices: action.payload };
    case 'SET_ACTIVE_DEVICE':
      agent.activeDeviceId = action.payload;
      return { ...state, activeDeviceId: action.payload };

    case 'SWITCH_WORKSPACE':
  return {
    ...state,
    currentWorkspace: action.payload,
    activeWindowId: null,
    focusedAppId: null
  };
    case 'OPEN_WINDOW': {
      const existing = state.windows.find(w => w.appId === action.payload.appId && !action.payload.allowMultiple);
      if (existing) {
        return { ...state, activeWindowId: existing.id, focusedAppId: existing.appId,
          windows: state.windows.map(w => ({ ...w, minimized: w.id === existing.id ? false : w.minimized }))
        };
      }
      const id = uuidv4();
      const offset = state.windows.length * 28;
      const newWindow = {
        id, appId: action.payload.appId, workspaceId: state.currentWorkspace, title: action.payload.title || action.payload.appId,
        x: 120 + offset, y: 60 + offset,
        width: action.payload.width || 800, height: action.payload.height || 520,
        minimized: false, maximized: false,
        zIndex: Math.max(100, ...state.windows.map(w => w.zIndex || 100)) + 1,
        props: action.payload.props || {},
      };
      return { ...state, windows: [...state.windows, newWindow], activeWindowId: id, focusedAppId: action.payload.appId,
        runningApps: state.runningApps.includes(action.payload.appId) ? state.runningApps : [...state.runningApps, action.payload.appId],
      };
    }
    case 'UPDATE_SYSTEM':
  return {
    ...state,
    system: {
      ...state.system,
      ...action.payload
    }
  };
    case 'CLOSE_WINDOW': {
      const win = state.windows.find(w => w.id === action.payload);
      const remaining = state.windows.filter(w => w.id !== action.payload);
      const appStillOpen = win && remaining.some(w => w.appId === win.appId);
      return { ...state, windows: remaining,
        activeWindowId: remaining.length > 0 ? remaining[remaining.length - 1].id : null,
        focusedAppId: remaining.length > 0 ? remaining[remaining.length - 1].appId : null,
        runningApps: appStillOpen ? state.runningApps : state.runningApps.filter(a => a !== win?.appId),
        maximizedWindowId: state.maximizedWindowId === action.payload ? null : state.maximizedWindowId,
      };
    }
    case 'FOCUS_WINDOW': {
      const maxZ = Math.max(100, ...state.windows.map(w => w.zIndex || 100));
      const win = state.windows.find(w => w.id === action.payload);
      return { ...state, activeWindowId: action.payload, focusedAppId: win?.appId || null,
        windows: state.windows.map(w => w.id === action.payload ? { ...w, zIndex: maxZ + 1, minimized: false } : w)
      };
    }
    case 'MINIMIZE_WINDOW':
      return { ...state, windows: state.windows.map(w => w.id === action.payload ? { ...w, minimized: true } : w),
        activeWindowId: state.activeWindowId === action.payload ? null : state.activeWindowId,
        maximizedWindowId: state.maximizedWindowId === action.payload ? null : state.maximizedWindowId,
      };
    case 'MAXIMIZE_WINDOW':
      return { ...state,
        maximizedWindowId: state.maximizedWindowId === action.payload ? null : action.payload,
        windows: state.windows.map(w => w.id === action.payload ? { ...w, maximized: !w.maximized } : w),
      };
    case 'UPDATE_WINDOW':
      return { ...state, windows: state.windows.map(w => w.id === action.payload.id ? { ...w, ...action.payload.updates } : w) };
    case 'TOGGLE_SPOTLIGHT':
      return { ...state, spotlightOpen: !state.spotlightOpen };
    case 'CLOSE_SPOTLIGHT':
      return { ...state, spotlightOpen: false };
    case 'ADD_NOTIFICATION': {
      const notif = { id: uuidv4(), ...action.payload, timestamp: Date.now() };
      return { ...state, notifications: [notif, ...state.notifications].slice(0, 20) };
    }
    case 'DISMISS_NOTIFICATION':
      return { ...state, notifications: state.notifications.filter(n => n.id !== action.payload) };
    case 'SET_WALLPAPER':
      return { ...state, wallpaper: action.payload };
    case 'SET_VOLUME':
      return { ...state, volume: action.payload };
    case 'SET_BRIGHTNESS':
      return { ...state, brightness: action.payload };
    case 'TOGGLE_WIFI':
      return { ...state, wifi: !state.wifi };
    case 'TOGGLE_BLUETOOTH':
      return { ...state, bluetooth: !state.bluetooth };
    case 'SET_CONTEXT_MENU':
      return { ...state, contextMenu: action.payload };
    case 'CLOSE_CONTEXT_MENU':
      return { ...state, contextMenu: null };
    case 'SET_USERNAME':
      return { ...state, username: action.payload };
    case 'ADD_WIDGET': {
      const widget = { id: uuidv4(), ...action.payload };
      return { ...state, widgets: [...state.widgets, widget] };
    }
    default:
      return state;
  }
}

export function OSProvider({ children }) {
  const [state, dispatch] = useReducer(osReducer, initialState);
  
  const connectToCloud = useCallback((account) => {
    cloud.connect(
      account,
      (cloudState) => dispatch({ type: 'SYNC_CLOUD_STATE', payload: cloudState }),
      (devices) => dispatch({ type: 'SET_DEVICES', payload: devices })
    );
  }, []);

  useEffect(() => {
    connectToCloud(state.account);
  }, [state.account, connectToCloud]);

  useEffect(() => {
    cloud.updateState({
      wallpaper: state.wallpaper,
      volume: state.volume,
      brightness: state.brightness,
      darkMode: state.darkMode,
      widgets: state.widgets,
      username: state.username,
    });
  }, [state.wallpaper, state.volume, state.brightness, state.darkMode, state.widgets, state.username]);

  const login = useCallback((account) => {
    dispatch({ type: 'SET_ACCOUNT', payload: account });
  }, []);

  const openApp = useCallback((appId, opts = {}) => {
    dispatch({ type: 'OPEN_WINDOW', payload: { appId, ...opts } });
  }, []);

  const closeWindow = useCallback((id) => dispatch({ type: 'CLOSE_WINDOW', payload: id }), []);
  const focusWindow = useCallback((id) => dispatch({ type: 'FOCUS_WINDOW', payload: id }), []);
  const minimizeWindow = useCallback((id) => dispatch({ type: 'MINIMIZE_WINDOW', payload: id }), []);
  const maximizeWindow = useCallback((id) => dispatch({ type: 'MAXIMIZE_WINDOW', payload: id }), []);
  const updateWindow = useCallback((id, updates) => dispatch({ type: 'UPDATE_WINDOW', payload: { id, updates } }), []);
  const toggleSpotlight = useCallback(() => dispatch({ type: 'TOGGLE_SPOTLIGHT' }), []);
  const closeSpotlight = useCallback(() => dispatch({ type: 'CLOSE_SPOTLIGHT' }), []);
  const notify = useCallback((title, body, icon) => dispatch({ type: 'ADD_NOTIFICATION', payload: { title, body, icon } }), []);
  const dismissNotification = useCallback((id) => dispatch({ type: 'DISMISS_NOTIFICATION', payload: id }), []);
  const setWallpaper = useCallback((i) => dispatch({ type: 'SET_WALLPAPER', payload: i }), []);
  const setVolume = useCallback((v) => dispatch({ type: 'SET_VOLUME', payload: v }), []);
  const setBrightness = useCallback((b) => dispatch({ type: 'SET_BRIGHTNESS', payload: b }), []);
  const toggleWifi = useCallback(() => dispatch({ type: 'TOGGLE_WIFI' }), []);
  const setContextMenu = useCallback((menu) => dispatch({ type: 'SET_CONTEXT_MENU', payload: menu }), []);
  const closeContextMenu = useCallback(() => dispatch({ type: 'CLOSE_CONTEXT_MENU' }), []);
  const addWidget = useCallback((type, data, x, y) => dispatch({ type: 'ADD_WIDGET', payload: { type, data, x, y } }), []);
  const setActiveDevice = useCallback((id) => dispatch({ type: 'SET_ACTIVE_DEVICE', payload: id }), []);
  const setUsername = useCallback((name) => dispatch({ type: 'SET_USERNAME', payload: name }), []);

  const value = {
    ...state, dispatch, openApp, closeWindow, focusWindow, minimizeWindow, maximizeWindow,
    updateWindow, toggleSpotlight, closeSpotlight, notify, dismissNotification,
    setWallpaper, setVolume, setBrightness, toggleWifi, setContextMenu, closeContextMenu,
    addWidget, setActiveDevice, login, setUsername
  };

  return <OSContext.Provider value={value}>{children}</OSContext.Provider>;
}

export function useOS() {
  const ctx = useContext(OSContext);
  if (!ctx) throw new Error('useOS must be used within OSProvider');
  return ctx;
}
