/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/index.css';
import { Shell } from './ui/Shell.js';
import { copy } from './ui/copy.js';

// The tab title comes from copy; the one in index.html is only the no-JS fallback.
document.title = copy.appName;

// The shell paints first and loads App on demand (docs/M4-PLAN.md section 8).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
);
