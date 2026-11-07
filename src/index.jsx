import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

async function boot() {
  // Android build: start the in-app API server before the first request.
  if (import.meta.env.VITE_LOCAL_BACKEND === 'true') {
    const { startLocalServer } = await import('./local/localServer.js');
    await startLocalServer();
  }
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('root').textContent = `앱을 시작하지 못했습니다: ${e.message}`;
});
