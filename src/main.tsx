import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './App.css';

// Apply dark mode class to document by default
document.documentElement.classList.add('dark');

/**
 * Standalone SW recovery: runs OUTSIDE React so it works even when
 * the app crashes on startup (e.g. missing Firebase config from a
 * broken CI build). If a new service worker is waiting, we tell it
 * to activate immediately and reload the page.
 */
async function recoverViaServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;

    // If there's already a waiting SW, activate it immediately
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      return; // controllerchange listener below will reload
    }

    // Otherwise check for updates now
    await reg.update();

    // After update(), the waiting SW may have changed (cast to reset TS narrowing)
    const updatedReg = reg as ServiceWorkerRegistration;
    if (updatedReg.waiting) {
      updatedReg.waiting.postMessage({ type: 'SKIP_WAITING' });
      return;
    }

    // If the update is still installing, wait for it
    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      if (!newSW) return;
      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
          // New SW installed while we have an old controller → activate it
          newSW.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
  } catch (e) {
    console.warn('SW recovery check failed:', e);
  }
}

// Listen for controller change (new SW took over) → reload to get fresh assets
if ('serviceWorker' in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Root element not found');

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  console.error('Fatal Initialization Error:', error);

  // App crashed — try to recover by updating the service worker
  recoverViaServiceWorker();

  // Show error directly on screen if React fails to mount
  // Use safe DOM APIs to avoid XSS via innerHTML
  const container = document.createElement('div');
  container.style.cssText = 'background: #1a1a1a; color: #ff5555; padding: 20px; font-family: sans-serif; height: 100vh;';

  const heading = document.createElement('h1');
  heading.textContent = 'App Error';

  const pre = document.createElement('pre');
  pre.textContent = error instanceof Error ? error.message : String(error);

  const hint = document.createElement('p');
  hint.style.color = '#888';
  hint.textContent = 'Checking for updates... The page will reload automatically if an update is found.';

  container.append(heading, pre, hint);
  document.body.replaceChildren(container);
}
