import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

declare global {
  interface Window {
    abot?: { platform: string; isDesktop: boolean };
  }
}

if (window.abot?.platform === 'darwin') document.documentElement.classList.add('is-mac');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
