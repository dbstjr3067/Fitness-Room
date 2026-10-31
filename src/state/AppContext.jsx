import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { todayStr } from '../shared/date.js';

const AppContext = createContext(null);

const DEFAULT_SETTINGS = { weeklyGoal: 3, unit: 'kg', theme: 'dark', extensions: {} };
const THEME_KEY = 'fr-theme';

function storedTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || 'dark';
  } catch {
    return 'dark';
  }
}

function rememberTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // storage unavailable
  }
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, theme: storedTheme() }));
  const [status, setStatus] = useState({ loading: false, error: null, data: null });
  const [loginError, setLoginError] = useState(null);

  // Theme on <html>
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    rememberTheme(settings.theme);
  }, [settings.theme]);

  // OAuth callback errors arrive as ?login_error=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('login_error');
    if (err) {
      setLoginError(err);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const loadUserData = useCallback(async () => {
    setStatus((s) => ({ ...s, loading: true, error: null }));
    try {
      const [s, data] = await Promise.all([api('/settings'), api('/status')]);
      setSettings(s);
      setStatus({ loading: false, error: null, data });
    } catch (e) {
      setStatus({ loading: false, error: e.message, data: null });
    }
  }, []);

  useEffect(() => {
    api('/auth/me')
      .then(({ user: u }) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (user) loadUserData();
    else setStatus({ loading: false, error: null, data: null });
  }, [user, loadUserData]);

  const login = useCallback(async (username, password) => {
    const { user: u } = await api('/auth/login', { method: 'POST', body: { username, password } });
    setLoginError(null);
    setUser(u);
  }, []);

  const register = useCallback(async (username, password, displayName) => {
    const { user: u } = await api('/auth/register', {
      method: 'POST',
      body: { username, password, displayName },
    });
    setLoginError(null);
    setUser(u);
  }, []);

  const demoLogin = useCallback(async () => {
    const { user: u } = await api('/auth/demo', { method: 'POST', body: { today: todayStr() } });
    setLoginError(null);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
    setSettings((s) => ({ ...DEFAULT_SETTINGS, theme: s.theme }));
  }, []);

  const updateSettings = useCallback(
    async (patch) => {
      setSettings((s) => ({ ...s, ...patch })); // optimistic
      if (!user) return;
      try {
        setSettings(await api('/settings', { method: 'PUT', body: patch }));
      } catch (e) {
        setStatus((s) => ({ ...s, error: e.message }));
      }
    },
    [user],
  );

  const setExtension = useCallback(
    async (id, enabled) => {
      setSettings((s) => ({ ...s, extensions: { ...s.extensions, [id]: enabled } }));
      if (!user) return;
      setSettings(await api(`/extensions/${id}`, { method: 'PUT', body: { enabled } }));
    },
    [user],
  );

  const value = useMemo(
    () => ({
      user,
      authReady,
      settings,
      status,
      loginError,
      setLoginError,
      login,
      register,
      demoLogin,
      logout,
      updateSettings,
      setExtension,
      reload: loadUserData,
    }),
    [user, authReady, settings, status, loginError, login, register, demoLogin, logout, updateSettings, setExtension, loadUserData],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
