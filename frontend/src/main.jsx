import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ToastProvider } from './ui';
import { tg } from './api';
import './style.css';

if (tg) {
  tg.ready();
  tg.expand();
  try { tg.setHeaderColor('#0a1020'); tg.setBackgroundColor('#0a1020'); } catch { /* eski versiyalar */ }
}

createRoot(document.getElementById('root')).render(
  <ToastProvider>
    <App />
  </ToastProvider>
);
