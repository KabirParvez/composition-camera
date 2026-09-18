import './style.css';
import { initApp } from './ui';

initApp();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // PWA install just won't be available offline; the app still works normally.
    });
  });
}
