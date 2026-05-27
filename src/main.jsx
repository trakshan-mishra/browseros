import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { OSProvider } from './context/OSContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <OSProvider>
      <App />
    </OSProvider>
  </React.StrictMode>,
);
