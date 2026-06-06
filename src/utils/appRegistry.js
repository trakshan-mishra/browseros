/**
 * NexusOS — App Registry
 * DROP IN: src/utils/appRegistry.js
 * Replaces existing file — all old apps kept, new ones added.
 */

export const APP_REGISTRY = {
  // ─── Core apps ──────────────────────────────────────────────────────────
  'finder': {
    id: 'finder', name: 'Finder', icon: '📁',
    color: '#1a1a2e', width: 750, height: 480,
  },
  'terminal': {
    id: 'terminal', name: 'Terminal', icon: '⬛',
    color: '#1e1e1e', width: 680, height: 440,
  },
  'notes': {
    id: 'notes', name: 'Notes', icon: '📝',
    color: '#FFD60A', width: 680, height: 500,
  },
  'browser': {
    id: 'browser', name: 'Safari', icon: '🧭',
    color: '#007AFF', width: 950, height: 600,
  },
  'calculator': {
    id: 'calculator', name: 'Calculator', icon: '🧮',
    color: '#333', width: 320, height: 500,
  },
  'settings': {
    id: 'settings', name: 'Settings', icon: '⚙️',
    color: '#8E8E93', width: 780, height: 540,
  },
  'ai-assistant': {
    id: 'ai-assistant', name: 'AI Assistant', icon: '🤖',
    color: '#BF5AF2', width: 500, height: 620,
  },
  'sensors': {
    id: 'sensors', name: 'Sensors', icon: '👁️',
    color: '#30D158', width: 760, height: 520,
  },
  'cloud-drive': {
    id: 'cloud-drive', name: 'Cloud Drive', icon: '☁️',
    color: '#6488ff', width: 1000, height: 620,
  },
  'debugger': {
    id: 'debugger', name: 'Debugger', icon: '🐞',
    color: '#007acc', width: 700, height: 500,
  },

  // ─── NEW Productivity apps ───────────────────────────────────────────────
  'focus-timer': {
    id: 'focus-timer', name: 'Focus', icon: '🎯',
    color: '#FF453A', width: 380, height: 620,
  },
  'kanban': {
    id: 'kanban', name: 'Projects', icon: '📋',
    color: '#5E5CE6', width: 1100, height: 640,
  },
  'calendar': {
    id: 'calendar', name: 'Calendar', icon: '📅',
    color: '#FF375F', width: 920, height: 640,
  },
  'dashboard': {
    id: 'dashboard', name: 'Today', icon: '📊',
    color: '#0A84FF', width: 1000, height: 640,
  },

  // ─── Your apps ──────────────────────────────────────────────────────────
  'moviemx': {
    id: 'moviemx', name: 'MovieMX', icon: '🎬',
    color: '#E50914', width: 1100, height: 680,
    url: 'https://moviemx.netlify.app',
  },
  'tradetrack': {
    id: 'tradetrack', name: 'TradeTrack AI', icon: '📈',
    color: '#00C853', width: 1100, height: 680,
    url: 'https://tradetrack-ai.netlify.app',
  },
};

export const WALLPAPERS = [
  'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
  'linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)',
  'linear-gradient(135deg, #0c0c1d 0%, #1a0533 50%, #2d1b69 100%)',
  'linear-gradient(135deg, #141e30 0%, #243b55 100%)',
  'linear-gradient(135deg, #232526 0%, #414345 100%)',
  'linear-gradient(135deg, #000428 0%, #004e92 100%)',
  'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  'linear-gradient(135deg, #1e0533 0%, #3d0066 50%, #1a0533 100%)',
  // New productivity-themed wallpapers
  'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',             // Pure dark
  'linear-gradient(160deg, #020818 0%, #0d1117 50%, #020818 100%)', // GitHub dark
  'radial-gradient(ellipse at top, #1a0a2e 0%, #0d0d14 70%)',       // Purple nebula
  'linear-gradient(135deg, #071330 0%, #0a1628 50%, #0d1f3c 100%)', // Deep ocean
];

// Dock default layout
export const DEFAULT_DOCK = [
  'finder',
  'dashboard',
  'focus-timer',
  'kanban',
  'notes',
  'moviemx',
  'tradetrack',
  'ai-assistant',
  'terminal',
  'browser',
  'settings',
];