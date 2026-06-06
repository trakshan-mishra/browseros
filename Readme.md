# NexusOS

A browser-based operating system inspired by macOS, built with React, Vite, AI agents, cloud synchronization, workspaces, desktop applications, and a modern glassmorphism interface.

![NexusOS](https://img.shields.io/badge/NexusOS-Experimental-blue)
![React](https://img.shields.io/badge/React-19-blue)
![Vite](https://img.shields.io/badge/Vite-Latest-purple)

---

## Features

### Desktop Environment

* Desktop UI
* Draggable windows
* Window focus management
* Minimize / maximize
* Context menus
* Spotlight search
* Dynamic wallpapers
* Widgets
* Auto-hiding dock
* Multiple workspaces

### Built-in Apps

* Finder
* Browser
* Terminal
* Notes
* Calculator
* AI Assistant
* Cloud Drive
* Focus Timer
* MovieMX
* TradeTrack AI
* Settings
* Sensors
* Debugger

### AI Features

* Local AI Agent
* Tool execution
* File operations
* Multi-device awareness

### Cloud Features

* Cloud synchronization
* Device management
* Shared state system

---

# Requirements

* Node.js 20+
* npm 10+

Check versions:

```bash
node -v
npm -v
```

---

# Installation

Clone the NexusOS branch:

```bash
git clone -b nexusos-v2 https://github.com/trakshan-mishra/browseros.git

cd browseros
```

Install dependencies:

```bash
npm install
```

---

# Environment Setup

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Bring Your Own API Keys

GROQ_API_KEY=YOUR_KEY_HERE

OPENAI_API_KEY=YOUR_KEY_HERE

CLOUD_PORT=3001
AGENT_PORT=3002
```

No API keys are included in this repository.

Users must supply their own keys.

---

# Running NexusOS

Open three terminals.

### Terminal 1

Start Cloud Server:

```bash
node cloud-server.js
```

### Terminal 2

Start Agent Server:

```bash
node agent-server.js
```

### Terminal 3

Start Frontend:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

---

# Quick Start (Copy & Paste)

```bash
git clone -b nexusos-v2 https://github.com/trakshan-mishra/browseros.git && \
cd browseros && \
npm install && \
npm run dev
```

In another terminal:

```bash
node agent-server.js
```

In another terminal:

```bash
npm run dev
```

---

# Project Structure

```text
browseros/
│
├── src/
│   ├── apps/
│   ├── components/
│   ├── context/
│   ├── services/
│   └── utils/
│
├── cloud-server.js
├── agent-server.js
├── package.json
└── vite.config.js
```

---

# Development

Run frontend only:

```bash
npm run dev
```

Build production:

```bash
npm run build
```

Preview build:

```bash
npm run preview
```

---

# Branches

## main

Original BrowserOS codebase.

## nexusos-v2

Experimental NexusOS desktop operating system.

---

# Troubleshooting

Clean dependencies:

```bash
rm -rf node_modules package-lock.json

npm install
```

Clear Vite cache:

```bash
rm -rf node_modules/.vite
```

Restart:

```bash
npm run dev
```

---

# Security

Never commit:

```text
.env
.env.local
API keys
Tokens
Secrets
```

All users should provide their own API keys.

---

# License

MIT

---

# Author

Trakshan Mishra

NexusOS is an experimental browser-based operating system combining desktop computing, cloud synchronization, AI agents, and web technologies.
