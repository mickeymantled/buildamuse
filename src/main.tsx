/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/index.css';
import { App } from './ui/App.js';
import { copy } from './ui/copy.js';

// The tab title comes from copy; the one in index.html is only the no-JS fallback.
document.title = copy.appName;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
