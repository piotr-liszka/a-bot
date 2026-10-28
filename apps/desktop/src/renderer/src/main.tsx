import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

import './lib/desktopApi';

if (window.abot?.platform === 'darwin') document.documentElement.classList.add('is-mac');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
