import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { lang } from './lib/i18n';
import './styles.css';

import './lib/desktopApi';

if (window.abot?.platform === 'darwin') document.documentElement.classList.add('is-mac');

document.documentElement.lang = lang;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
