import './local/polyfills.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const rootEl = () => document.getElementById('root');

function renderApp() {
  ReactDOM.createRoot(rootEl()).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

// Android build: start the in-app API server before the first request. If it can't start, show a
// recovery screen (retry / export the data / start over) instead of the app.
async function bootMobile() {
  const local = await import('./local/localServer.js');
  const screens = await import('./local/startupScreens.js');
  const start = async () => {
    try {
      await local.startLocalServer();
    } catch (e) {
      console.error(e);
      screens.renderStartupError(rootEl(), e, {
        retry: start,
        reset: async () => {
          await local.resetDatabase();
          await start();
        },
      });
      return;
    }
    screens.listenSaveWarnings();
    rootEl().textContent = '';
    renderApp();
  };
  await start();
}

async function boot() {
  if (import.meta.env.VITE_LOCAL_BACKEND === 'true') return bootMobile();
  renderApp();
}

boot().catch((e) => {
  console.error(e);
  rootEl().textContent = `앱을 시작하지 못했습니다: ${e.message}`;
});
