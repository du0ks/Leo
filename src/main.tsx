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
  document.body.innerHTML = `
    <div style="background: #1a1a1a; color: #ff5555; padding: 20px; font-family: sans-serif; height: 100vh;">
      <h1>Native App Fatal Error</h1>
      <pre>${error instanceof Error ? error.message : String(error)}</pre>
      <p style="color: #888;">This error occurred before the app could start.</p>
    </div>
  `;
}
