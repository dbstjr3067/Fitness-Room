import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, setUnauthorizedHandler } from '../api.js';
import { todayStr } from '../shared/date.js';
import { setCustomExercises } from '../shared/exercises.js';
import { clearAllPending } from './pendingDrafts.js';

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
export const SESSION_EXPIRED = '로그인이 만료되었습니다. 다시 로그인해 주세요';

// Today's local date, kept current across midnight, sleep and app resume (window 'fr:resume').
function useLiveToday() {
  const [today, setToday] = useState(() => todayStr());
  useEffect(() => {
    let timer;
    const check = () => {
      setToday(todayStr());
      clearTimeout(timer);
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      timer = setTimeout(check, Math.max(1000, next - now));
    };
    check();
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    window.addEventListener('fr:resume', check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
      window.removeEventListener('fr:resume', check);
    };
  }, []);
  return today;
}

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
  const today = useLiveToday();
  const todayRef = useRef(today);
  todayRef.current = today;

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

  // 세척했나요?: { last: date|null, washedToday }; shakerError when it could not be loaded
  const [shaker, setShaker] = useState(null);
  const [shakerError, setShakerError] = useState(null);
  // bumped by every change, so an older refresh answering late cannot undo it
  const shakerGen = useRef(0);
  const refreshShaker = useCallback(async () => {
    const gen = shakerGen.current;
    setShakerError(null);
    try {
      const s = await api(`/shaker?today=${todayRef.current}`);
      if (gen === shakerGen.current) setShaker(s);
    } catch (e) {
      if (gen === shakerGen.current) setShakerError(e.message);
    }
  }, []);
  // Taps are sent in order, one after another; only the answer to the latest tap is shown.
  const shakerQueue = useRef(Promise.resolve());
  const setShakerWashed = useCallback((washed) => {
    const gen = ++shakerGen.current;
    const day = todayRef.current;
    setShaker((s) => ({ ...(s || {}), washedToday: washed, last: washed ? day : s?.last }));
    shakerQueue.current = shakerQueue.current.then(async () => {
      try {
        const s = await api(`/shaker/${day}`, { method: washed ? 'PUT' : 'DELETE' });
        if (gen === shakerGen.current) setShaker(s);
      } catch (e) {
        if (gen !== shakerGen.current) return;
        showToast(e.message);
        refreshShaker();
      }
    });
    return shakerQueue.current;
  }, [showToast, refreshShaker]);

  const checkTierPromotions = useCallback(() => {
    // 티어: logs from days that have ended update tiers automatically; show any promotions.
    api(`/tiers?today=${todayRef.current}`)
      .then((t) => queuePromotions(t.promotions))
      .catch(() => {});
  }, [queuePromotions]);

  // Each load gets a number; responses from an older load (e.g. the previous account) are dropped.
  const loadGen = useRef(0);
  const loadUserData = useCallback(async () => {
    const gen = ++loadGen.current;
    setStatus((s) => ({ ...s, loading: true, error: null }));
    try {
      const [s, data, custom] = await Promise.all([api('/me/settings'), api('/status'), api('/me/exercises')]);
      if (gen !== loadGen.current) return;
      applyCustomExercises(custom.exercises);
      setSettings(s);
      setStatus({ loading: false, error: null, data });
      if (s.extensions.shaker) refreshShaker();
      if (s.extensions.tier) checkTierPromotions();
    } catch (e) {
      if (gen !== loadGen.current) return;
      setStatus({ loading: false, error: e.message, data: null });
    }
  }, [applyCustomExercises, checkTierPromotions, refreshShaker]);

  useEffect(() => {
    api('/auth/me')
      .then(({ user: u }) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true));
  }, []);

  const userId = user?.id;
  useEffect(() => {
    if (userId) loadUserData();
    else {
      loadGen.current++;
      setStatus({ loading: false, error: null, data: null });
      setShaker(null);
      setShakerError(null);
    }
  }, [userId, loadUserData]);

  // A new day: refresh what depends on the date.
  const seenToday = useRef(today);
  const extRef = useRef(settings.extensions);
  extRef.current = settings.extensions;
  useEffect(() => {
    if (seenToday.current === today) return;
    seenToday.current = today;
    if (!userId) return;
    if (extRef.current?.shaker) refreshShaker();
    if (extRef.current?.tier) checkTierPromotions();
  }, [today, userId, refreshShaker, checkTierPromotions]);

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

  // A 401 on an authenticated call: if the session is really gone, sign out and send the user to login.
  // Unsaved 운동일지 drafts stay in pendingDrafts and are saved after logging in again.
  const userRef = useRef(user);
  userRef.current = user;
  const checkingSession = useRef(false);
  useEffect(() => {
    setUnauthorizedHandler(async () => {
      if (!userRef.current || checkingSession.current) return;
      checkingSession.current = true;
      try {
        const { user: u } = await api('/auth/me');
        if (!u && userRef.current) {
          clearSession();
          setLoginError(SESSION_EXPIRED);
        }
      } catch {
        // offline: keep the session
      } finally {
        checkingSession.current = false;
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    // a demo account is deleted on logout, so its unsaved drafts can never be saved
    if (userRef.current?.isDemo) clearAllPending(userRef.current.id);
    clearSession();
  }, [clearSession]);

  const deleteAccount = useCallback(
    async (body) => {
      await api('/me', { method: 'DELETE', body });
      if (userRef.current) clearAllPending(userRef.current.id);
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

  // Returns true when the server saved it (callers that navigate away check this).
  const updateSettings = useCallback(
    async (patch) => {
      setSettings((s) => ({ ...s, ...patch })); // optimistic
      if (!user) return true;
      try {
        const { achievements, ...next } = await api('/me/settings', { method: 'PUT', body: patch });
        setSettings(next);
        announce(achievements);
        return true;
      } catch (e) {
        showToast(e.message);
        loadUserData();
        return false;
      }
    },
    [user, announce, showToast, loadUserData],
  );

  const setExtension = useCallback(
    async (id, enabled) => {
      setSettings((s) => ({ ...s, extensions: { ...s.extensions, [id]: enabled } })); // optimistic
      if (!user) return true;
      try {
        setSettings(await api(`/me/extensions/${id}`, { method: 'PUT', body: { enabled } }));
        if (enabled && id === 'shaker') refreshShaker();
        return true;
      } catch (e) {
        setSettings((s) => ({ ...s, extensions: { ...s.extensions, [id]: !enabled } })); // roll back
        showToast(e.message);
        return false;
      }
    },
    [user, refreshShaker, showToast],
  );

  // Keep the 현황 data in sync after edits elsewhere. The server keeps memo/운동명-only days,
  // so only a null workout (deleted) removes the day.
  const upsertWorkout = useCallback((date, workout) => {
    setStatus((s) => {
      if (!s.data) return s;
      const rest = s.data.workouts.filter((w) => w.date !== date);
      const workouts = workout ? sortByDate([...rest, workout]) : rest;
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
      today,
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
      signedIn,
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
      shakerError,
      refreshShaker,
      setShakerWashed,
    }),
    [
      user, authReady, today, settings, status, loginError, unread, refreshUnread, toast, showToast, announce, login, register,
      demoLogin, signedIn, logout, deleteAccount, updateSettings, setExtension, upsertWorkout, setBodyWeights, loadUserData,
      customVersion, applyCustomExercises, promotions, queuePromotions, dismissPromotion, shaker, shakerError, refreshShaker,
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
