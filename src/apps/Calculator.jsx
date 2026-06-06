import { useState } from 'react';
import './Calculator.css';

export default function CalculatorApp() {
  const [display, setDisplay] = useState('0');
  const [prev, setPrev] = useState(null);
  const [op, setOp] = useState(null);
  const [newNum, setNewNum] = useState(true);

  const handleNum = (n) => {
    if (newNum) {
      setDisplay(n === '.' ? '0.' : n);
      setNewNum(false);
    } else {
      if (n === '.' && display.includes('.')) return;
      setDisplay(display + n);
    }
  };

  const handleOp = (nextOp) => {
    const current = parseFloat(display);
    if (prev !== null && op && !newNum) {
      const result = calc(prev, current, op);
      setDisplay(String(result));
      setPrev(result);
    } else {
      setPrev(current);
    }
    setOp(nextOp);
    setNewNum(true);
  };

  const handleEquals = () => {
    if (prev === null || !op) return;
    const current = parseFloat(display);
    const result = calc(prev, current, op);
    setDisplay(String(result));
    setPrev(null);
    setOp(null);
    setNewNum(true);
  };

  const calc = (a, b, op) => {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b !== 0 ? a / b : 'Error';
      default: return b;
    }
  };

  const handleClear = () => { setDisplay('0'); setPrev(null); setOp(null); setNewNum(true); };
  const handleToggle = () => setDisplay(String(parseFloat(display) * -1));
  const handlePercent = () => setDisplay(String(parseFloat(display) / 100));

  const buttons = [
    ['AC', '±', '%', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '+'],
    ['0', '.', '='],
  ];

  const getClass = (btn) => {
    if (['÷', '×', '-', '+', '='].includes(btn)) return 'calc-btn calc-btn-op';
    if (['AC', '±', '%'].includes(btn)) return 'calc-btn calc-btn-fn';
    if (btn === '0') return 'calc-btn calc-btn-zero';
    return 'calc-btn';
  };

  const handleClick = (btn) => {
    if (btn === 'AC') handleClear();
    else if (btn === '±') handleToggle();
    else if (btn === '%') handlePercent();
    else if (btn === '=') handleEquals();
    else if (['÷', '×', '-', '+'].includes(btn)) handleOp(btn);
    else handleNum(btn);
  };

  return (
    <div className="calculator">
      <div className="calc-display">
        <div className="calc-prev">{prev !== null ? `${prev} ${op}` : ''}</div>
        <div className="calc-value">{display}</div>
      </div>
      <div className="calc-buttons">
        {buttons.map((row, i) => (
          <div key={i} className="calc-row">
            {row.map(btn => (
              <button key={btn} className={getClass(btn)} onClick={() => handleClick(btn)}>
                {btn}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
