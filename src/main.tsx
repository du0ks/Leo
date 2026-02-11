import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './App.css';

// Apply dark mode class to document by default
document.documentElement.classList.add('dark');

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
  // Show error directly on screen if React fails to mount
  // Use safe DOM APIs to avoid XSS via innerHTML
  const container = document.createElement('div');
  container.style.cssText = 'background: #1a1a1a; color: #ff5555; padding: 20px; font-family: sans-serif; height: 100vh;';

  const heading = document.createElement('h1');
  heading.textContent = 'Native App Fatal Error';

  const pre = document.createElement('pre');
  pre.textContent = error instanceof Error ? error.message : String(error);

  const hint = document.createElement('p');
  hint.style.color = '#888';
  hint.textContent = 'This error occurred before the app could start.';

  container.append(heading, pre, hint);
  document.body.replaceChildren(container);
}
