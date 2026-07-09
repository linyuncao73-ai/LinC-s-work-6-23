
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// A page opened before a deploy may reference lazy chunks that no longer
// exist on the server. Reload once to pick up the new version instead of
// surfacing "Failed to fetch dynamically imported module".
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  const KEY = 'yow_chunk_reload_at';
  const last = Number(sessionStorage.getItem(KEY) || 0);
  if (Date.now() - last > 60000) {
    sessionStorage.setItem(KEY, String(Date.now()));
    window.location.reload();
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
