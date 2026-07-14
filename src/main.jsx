import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';

if (import.meta.env.VITE_STANDALONE) {
  // Service worker registration (standalone/PWA build only)
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
