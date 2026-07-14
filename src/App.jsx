import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { BASE, IS_STANDALONE, rpc } from './lib/api.js';
import Today from './screens/Today.jsx';
import History from './screens/History.jsx';
import Dishes from './screens/Dishes.jsx';
import DishDetail from './screens/DishDetail.jsx';
import Insights from './screens/Insights.jsx';
import ImportScreen from './screens/Import.jsx';
import Settings from './screens/Settings.jsx';
import FirstLaunch from './screens/FirstLaunch.jsx';

const AppContext = createContext(null);
export function useApp() { return useContext(AppContext); }

function CenterScreen({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-sm w-full text-center">{children}</div>
    </div>
  );
}

function ServerUnreachable({ onRetry }) {
  return (
    <CenterScreen>
      <div className="text-5xl mb-4">📡</div>
      <h1 className="text-xl font-semibold text-slate-800 mb-2">Can't reach the Vitals server</h1>
      <p className="text-slate-600 mb-6">
        Make sure the laptop running Vitals is on and on the same Wi-Fi, then try again.
      </p>
      <button onClick={onRetry} className="px-6 py-3 rounded-xl bg-teal-700 text-white font-medium text-lg">
        Retry
      </button>
    </CenterScreen>
  );
}

function BootError({ message, onRetry }) {
  return (
    <CenterScreen>
      <div className="text-5xl mb-4">😔</div>
      <h1 className="text-xl font-semibold text-slate-800 mb-2">Something went wrong</h1>
      <p className="text-slate-600 mb-6 break-words">{message}</p>
      <button onClick={onRetry} className="px-6 py-3 rounded-xl bg-teal-700 text-white font-medium text-lg">
        Try again
      </button>
    </CenterScreen>
  );
}

const NAV = [
  { to: '/', label: 'Today', icon: '☀️', end: true },
  { to: '/history', label: 'History', icon: '📅' },
  { to: '/dishes', label: 'Dishes', icon: '🍲' },
  { to: '/insights', label: 'Insights', icon: '📈' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="max-w-lg mx-auto px-4 pt-4">{children}</div>
      <nav aria-label="Primary" className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 shadow-[0_-1px_8px_rgba(0,0,0,0.04)] pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-lg mx-auto grid grid-cols-5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium min-h-[56px] justify-center ${isActive ? 'text-teal-700' : 'text-slate-500'}`}
            >
              {({ isActive }) => (
                <>
                  <span className="text-xl leading-none" aria-hidden="true">{n.icon}</span>
                  <span aria-current={isActive ? 'page' : undefined}>{n.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const s = await rpc('getState');
      setState(s);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh, attempt]);

  if (error) {
    const retry = () => { setError(null); setState(null); setAttempt((a) => a + 1); };
    return error.unreachable
      ? <ServerUnreachable onRetry={retry} />
      : <BootError message={error.message} onRetry={retry} />;
  }
  if (!state) {
    return (
      <CenterScreen>
        <div className="text-4xl mb-3 animate-pulse">🌿</div>
        <p className="text-slate-500">Starting Vitals…</p>
      </CenterScreen>
    );
  }

  const basename = BASE.replace(/\/$/, '') || '/';
  const ctx = { state, refresh, standalone: IS_STANDALONE };

  return (
    <AppContext.Provider value={ctx}>
      <BrowserRouter basename={basename}>
        {!state.initialized ? (
          <Routes>
            <Route path="*" element={<FirstLaunch onDone={refresh} />} />
          </Routes>
        ) : (
          <Layout>
            <Routes>
              <Route path="/" element={<Today />} />
              <Route path="/history" element={<History />} />
              <Route path="/dishes" element={<Dishes />} />
              <Route path="/dishes/:dishId" element={<DishDetail />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/import" element={<ImportScreen />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Today />} />
            </Routes>
          </Layout>
        )}
      </BrowserRouter>
    </AppContext.Provider>
  );
}
