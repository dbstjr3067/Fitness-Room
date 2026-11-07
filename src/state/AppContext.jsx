import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { todayStr } from '../shared/date.js';
import { setCustomExercises } from '../shared/exercises.js';

const AppContext = createContext(null);

const DEFAULT_SETTINGS = {
  weeklyGoal: 3,
  unit: 'kg',
  theme: 'dark',
  isPublic: true,
  promoOptIn: false,
  goalWeight: null,
  calProfile: null,
  extensions: {},
};
const THEME_KEY = 'fr-theme';
const UNREAD_POLL_MS = 60 * 1000;

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

const sortByDate = (list) => [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, theme: storedTheme() }));
  const [status, setStatus] = useState({ loading: false, error: null, data: null });
  const [loginError, setLoginError] = useState(null);
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

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

  const showToast = useCallback((message) => {
    setToast({ message, key: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const refreshUnread = useCallback(async () => {
    try {
      const { count } = await api('/notifications/unread-count');
      setUnread(count);
    } catch {
      // offline or logged out
    }
  }, []);

  // User-added exercises live in the shared exercise registry; the version bump re-renders lists.
  const [customVersion, setCustomVersion] = useState(0);
  const applyCustomExercises = useCallback((list) => {
    setCustomExercises(list);
    setCustomVersion((v) => v + 1);
  }, []);

  // Tier promotions waiting to be shown (승급 screen), oldest first.
  const [promotions, setPromotions] = useState([]);
  const queuePromotions = useCallback((list) => {
    if (list?.length) setPromotions((q) => [...q, ...list.filter((p) => !q.some((x) => x.id === p.id))]);
  }, []);
  const dismissPromotion = useCallback((id) => {
    setPromotions((q) => q.filter((p) => p.id !== id));
    api('/tiers/promotions/seen', { method: 'POST', body: { ids: [id] } }).catch(() => {});
  }, []);

  // 세척했나요?: { last: date|null, washedToday }
  const [shaker, setShaker] = useState(null);
  const refreshShaker = useCallback(async () => {
    try {
      setShaker(await api(`/shaker?today=${todayStr()}`));
    } catch {
      // ignore
    }
  }, []);
  const setShakerWashed = useCallback(async (washed) => {
    const today = todayStr();
    setShaker((s) => ({ ...(s || {}), washedToday: washed, last: washed ? today : s?.last }));
    try {
      setShaker(await api(`/shaker/${today}`, { method: washed ? 'PUT' : 'DELETE' }));
    } catch (e) {
      showToast(e.message);
      refreshShaker();
    }
  }, [showToast, refreshShaker]);

  const loadUserData = useCallback(async () => {
    setStatus((s) => ({ ...s, loading: true, error: null }));
    try {
      const [s, data, custom] = await Promise.all([api('/me/settings'), api('/status'), api('/me/exercises')]);
      applyCustomExercises(custom.exercises);
      setSettings(s);
      setStatus({ loading: false, error: null, data });
      if (s.extensions.shaker) refreshShaker();
      // 티어: logs from days that have ended update tiers automatically; show any promotions.
      if (s.extensions.tier) {
        api(`/tiers?today=${todayStr()}`)
          .then((t) => queuePromotions(t.promotions))
          .catch(() => {});
      }
    } catch (e) {
      setStatus({ loading: false, error: e.message, data: null });
    }
  }, [applyCustomExercises, queuePromotions, refreshShaker]);

  useEffect(() => {
    api('/auth/me')
      .then(({ user: u }) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true));
  }, []);

  const userId = user?.id;
  useEffect(() => {
    if (userId) loadUserData();
    else setStatus({ loading: false, error: null, data: null });
  }, [userId, loadUserData]);

  // Unread badge: poll while visible and refresh when the app comes back.
  useEffect(() => {
    if (!userId) {
      setUnread(0);
      return undefined;
    }
    refreshUnread();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') refreshUnread();
    }, UNREAD_POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && refreshUnread();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, refreshUnread]);

  const signedIn = useCallback((u) => {
    setLoginError(null);
    setUser(u);
  }, []);

  const login = useCallback(
    async (username, password) => signedIn((await api('/auth/login', { method: 'POST', body: { username, password } })).user),
    [signedIn],
  );

  const register = useCallback(
    async (username, password, displayName, promoOptIn = false) =>
      signedIn(
        (await api('/auth/register', { method: 'POST', body: { username, password, displayName, promoOptIn } })).user,
      ),
    [signedIn],
  );

  const demoLogin = useCallback(
    async () => signedIn((await api('/auth/demo', { method: 'POST', body: { today: todayStr() } })).user),
    [signedIn],
  );

  const clearSession = useCallback(() => {
    setUser(null);
    applyCustomExercises([]);
    setPromotions([]);
    setSettings((s) => ({ ...DEFAULT_SETTINGS, theme: s.theme }));
  }, [applyCustomExercises]);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    clearSession();
  }, [clearSession]);

  const deleteAccount = useCallback(
    async (body) => {
      await api('/me', { method: 'DELETE', body });
      clearSession();
    },
    [clearSession],
  );

  const announce = useCallback(
    (achievements) => {
      if (!achievements?.length) return;
      showToast(achievements.length === 1 ? achievements[0].title : `${achievements[0].title} 외 ${achievements.length - 1}개 달성`);
      refreshUnread();
    },
    [showToast, refreshUnread],
  );

  const updateSettings = useCallback(
    async (patch) => {
      setSettings((s) => ({ ...s, ...patch })); // optimistic
      if (!user) return;
      try {
        const { achievements, ...next } = await api('/me/settings', { method: 'PUT', body: patch });
        setSettings(next);
        announce(achievements);
      } catch (e) {
        showToast(e.message);
        loadUserData();
      }
    },
    [user, announce, showToast, loadUserData],
  );

  const setExtension = useCallback(
    async (id, enabled) => {
      setSettings((s) => ({ ...s, extensions: { ...s.extensions, [id]: enabled } }));
      if (!user) return;
      setSettings(await api(`/me/extensions/${id}`, { method: 'PUT', body: { enabled } }));
      if (enabled && id === 'shaker') refreshShaker();
    },
    [user, refreshShaker],
  );

  // Keep the 현황 data in sync after edits elsewhere.
  const upsertWorkout = useCallback((date, workout) => {
    setStatus((s) => {
      if (!s.data) return s;
      const rest = s.data.workouts.filter((w) => w.date !== date);
      const workouts = workout && workout.entries.length ? sortByDate([...rest, workout]) : rest;
      return { ...s, data: { ...s.data, workouts } };
    });
  }, []);

  const setBodyWeights = useCallback((bodyWeights) => {
    setStatus((s) => (s.data ? { ...s, data: { ...s.data, bodyWeights } } : s));
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser,
      authReady,
      settings,
      status,
      loginError,
      setLoginError,
      unread,
      refreshUnread,
      toast,
      showToast,
      announce,
      login,
      register,
      demoLogin,
      logout,
      deleteAccount,
      updateSettings,
      setExtension,
      upsertWorkout,
      setBodyWeights,
      reload: loadUserData,
      customVersion,
      applyCustomExercises,
      promotions,
      queuePromotions,
      dismissPromotion,
      shaker,
      refreshShaker,
      setShakerWashed,
    }),
    [
      user, authReady, settings, status, loginError, unread, refreshUnread, toast, showToast, announce, login, register,
      demoLogin, logout, deleteAccount, updateSettings, setExtension, upsertWorkout, setBodyWeights, loadUserData,
      customVersion, applyCustomExercises, promotions, queuePromotions, dismissPromotion, shaker, refreshShaker,
      setShakerWashed,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
