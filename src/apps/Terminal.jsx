import { useState, useRef, useEffect } from 'react';
import { agent } from '../services/agent';
import './Terminal.css';

export default function TerminalApp() {
  const [history, setHistory] = useState([
    { type: 'output', text: 'Welcome to NexusOS Terminal v1.0.0' },
    { type: 'output', text: 'Type "help" for available commands.\n' },
  ]);
  const [input, setInput] = useState('');
  const [cwd, setCwd] = useState('~');
  const [cmdHistory, setCmdHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [history]);

  const processCmd = async (cmd) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    setCmdHistory(prev => [trimmed, ...prev]);
    setHistoryIdx(-1);

    const addLine = (text, type = 'output') => ({ type, text });
    const lines = [addLine(`${cwd} $ ${trimmed}`, 'input')];

    const parts = trimmed.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case 'help':
        lines.push(addLine('Available commands:'));
        lines.push(addLine('  help          - Show this help'));
        lines.push(addLine('  clear         - Clear terminal'));
        lines.push(addLine('  echo <text>   - Print text'));
        lines.push(addLine('  date          - Show current date/time'));
        lines.push(addLine('  whoami        - Show current user'));
        lines.push(addLine('  uname         - Show system info'));
        lines.push(addLine('  ls            - List files'));
        lines.push(addLine('  pwd           - Print working directory'));
        lines.push(addLine('  cd <dir>      - Change directory'));
        lines.push(addLine('  cat <file>    - Read file'));
        lines.push(addLine('  mkdir <name>  - Create directory'));
        lines.push(addLine('  neofetch      - System info'));
        lines.push(addLine('  calc <expr>   - Calculator'));
        lines.push(addLine('  ai <prompt>   - Ask AI (coming soon)'));
        lines.push(addLine('  host <cmd>     - Run safe host command via bridge'));
        lines.push(addLine('  open <path>    - Open real file/folder/app URL'));
        lines.push(addLine('  files [path]   - List real host files'));
        lines.push(addLine('  hardware       - Live host hardware snapshot'));
        lines.push(addLine('  matrix        - Matrix rain effect'));
        break;
      case 'clear':
        setHistory([]);
        setInput('');
        return;
      case 'echo':
        lines.push(addLine(args.join(' ')));
        break;
      case 'date':
        lines.push(addLine(new Date().toString()));
        break;
      case 'whoami':
        lines.push(addLine('user@nexusos'));
        break;
      case 'uname':
        lines.push(addLine('NexusOS 1.0.0 Browser-Based x86_64'));
        break;
      case 'pwd':
        lines.push(addLine(cwd === '~' ? '/home/user' : cwd));
        break;
      case 'ls':
        try {
          const data = await agent.files(cwd);
          lines.push(addLine(data.entries.map(e => `${e.type === 'dir' ? '📁' : '📄'} ${e.name}`).join('\n') || 'empty'));
        } catch (err) {
          lines.push(addLine(`bridge ls failed: ${err.message}`, 'error'));
        }
        break;
      case 'cd':
        if (!args[0] || args[0] === '~') setCwd('~');
        else if (args[0] === '..') setCwd('~');
        else setCwd(`~/${args[0]}`);
        break;
      case 'cat':
        if (!args[0]) lines.push(addLine('cat: missing file operand', 'error'));
        else lines.push(addLine(`cat: ${args[0]}: This is a virtual file system.`));
        break;
      case 'files':
        try {
          const data = await agent.files(args.join(' ') || cwd);
          lines.push(addLine(`Path: ${data.path}`));
          lines.push(addLine(data.entries.map(e => `${e.type.padEnd(4)} ${e.name}`).join('\n') || 'empty'));
        } catch (err) {
          lines.push(addLine(err.message, 'error'));
        }
        break;
      case 'open':
        try {
          const data = await agent.openPath(args.join(' ') || cwd);
          lines.push(addLine(data.message, 'success'));
        } catch (err) {
          lines.push(addLine(err.message, 'error'));
        }
        break;
      case 'hardware':
        try {
          const data = await agent.metrics();
          lines.push(addLine(`CPU: ${data.cpu}`));
          lines.push(addLine(`Cores: ${data.cores}`));
          lines.push(addLine(`Load: ${data.load.toFixed(2)}`));
          lines.push(addLine(`RAM: ${data.ramFreeMb}/${data.ramTotalMb} MB free`));
        } catch (err) {
          lines.push(addLine(err.message, 'error'));
        }
        break;
      case 'host':
        try {
          const data = await agent.shell(args.join(' '));
          lines.push(addLine(data.output || '(no output)', data.ok ? 'output' : 'error'));
        } catch (err) {
          lines.push(addLine(err.message, 'error'));
        }
        break;
      case 'mkdir':
        if (!args[0]) lines.push(addLine('mkdir: missing operand', 'error'));
        else lines.push(addLine(`Created directory: ${args[0]}`));
        break;
      case 'calc': {
        try {
          const expr = args.join(' ');
          const result = Function('"use strict";return (' + expr.replace(/[^0-9+\-*/.()% ]/g, '') + ')')();
          lines.push(addLine(`= ${result}`));
        } catch {
          lines.push(addLine('calc: invalid expression', 'error'));
        }
        break;
      }
      case 'neofetch':
        lines.push(addLine(''));
        lines.push(addLine('  ╭─────────────────────╮'));
        lines.push(addLine('  │   ◉  NexusOS 1.0    │'));
        lines.push(addLine('  ╰─────────────────────╯'));
        lines.push(addLine(`  OS:      NexusOS Browser Edition`));
        lines.push(addLine(`  Host:    ${navigator.userAgent.split(' ').slice(0, 3).join(' ')}`));
        lines.push(addLine(`  Kernel:  JavaScript ES2024`));
        lines.push(addLine(`  Shell:   NexusShell 1.0`));
        lines.push(addLine(`  CPU:     ${navigator.hardwareConcurrency || '?'} cores`));
        lines.push(addLine(`  Memory:  ${navigator.deviceMemory || '?'} GB`));
        lines.push(addLine(`  Display: ${window.screen.width}x${window.screen.height}`));
        lines.push(addLine(`  Theme:   Dark Mode`));
        lines.push(addLine(''));
        break;
      case 'matrix':
        lines.push(addLine('⣿⣿⣿ MATRIX MODE ACTIVATED ⣿⣿⣿', 'success'));
        for (let i = 0; i < 5; i++) {
          let line = '';
          for (let j = 0; j < 50; j++) line += String.fromCharCode(0x30A0 + Math.random() * 96);
          lines.push(addLine(line, 'matrix'));
        }
        break;
      case 'ai':
        try {
          const data = await agent.command(args.join(' '));
          lines.push(addLine(data.message, 'info'));
        } catch (err) {
          lines.push(addLine(`AI bridge failed: ${err.message}`, 'error'));
        }
        break;
      default:
        lines.push(addLine(`nexusos: command not found: ${command}`, 'error'));
        lines.push(addLine(`Type "help" for available commands.`));
    }

    setHistory(prev => [...prev, ...lines]);
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      processCmd(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newIdx = Math.min(historyIdx + 1, cmdHistory.length - 1);
      setHistoryIdx(newIdx);
      if (cmdHistory[newIdx]) setInput(cmdHistory[newIdx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newIdx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(newIdx);
      setInput(newIdx >= 0 ? cmdHistory[newIdx] : '');
    }
  };

  return (
    <div className="terminal" onClick={() => inputRef.current?.focus()}>
      <div className="terminal-scroll" ref={scrollRef}>
        {history.map((line, i) => (
          <div key={i} className={`terminal-line terminal-${line.type}`}>
            {line.text}
          </div>
        ))}
        <div className="terminal-prompt">
          <span className="terminal-prompt-cwd">{cwd}</span>
          <span className="terminal-prompt-symbol"> $ </span>
          <input
            ref={inputRef}
            className="terminal-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
