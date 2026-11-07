import { useEffect, useRef } from 'react';
import { Activity, CircleUserRound, Heart, Search, Settings, SquarePlus } from 'lucide-react';
import { IconButton } from './components/ui.jsx';
import { Toast } from './components/common.jsx';
import { NavProvider, ScreenContext, TabStack, useNavState } from './nav/Navigator.jsx';
import { AppProvider, useApp } from './state/AppContext.jsx';
import StatusHome from './screens/status/StatusHome.jsx';
import ProgressScreen from './screens/status/ProgressScreen.jsx';
import { BodyweightScreen, ExerciseDetailScreen, ExerciseListScreen } from './screens/status/ExerciseScreens.jsx';
import SearchHome from './screens/search/SearchHome.jsx';
import UserProfileScreen from './screens/search/UserProfileScreen.jsx';
import ExerciseInfoScreen from './screens/search/ExerciseInfoScreen.jsx';
import { ExtensionDetailScreen, ExtensionSearchScreen } from './screens/search/ExtensionScreens.jsx';
import AddHome from './screens/add/AddHome.jsx';
import { LogListScreen, LogScreen } from './screens/add/LogScreens.jsx';
import { RoutineEditScreen, RoutineListScreen } from './screens/add/RoutineScreens.jsx';
import { CalProfileScreen } from './screens/add/CalTrackCard.jsx';
import NotificationsScreen from './screens/notifications/NotificationsScreen.jsx';
import AccountHome, { AccountSettingsScreen, DeleteAccountScreen, ProfileEditScreen } from './screens/account/AccountScreens.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';

// Screens any tab can open (e.g. a notification opening a profile).
const SHARED = {
  user: UserProfileScreen,
  exerciseInfo: ExerciseInfoScreen,
  extension: ExtensionDetailScreen,
  extensionSearch: ExtensionSearchScreen,
  exercise: ExerciseDetailScreen,
  progress: ProgressScreen,
  bodyweight: BodyweightScreen,
};

const TABS = [
  {
    id: 'status',
    label: '현황',
    icon: Activity,
    screens: { ...SHARED, home: StatusHome, exercises: ExerciseListScreen },
  },
  { id: 'search', label: '검색', icon: Search, screens: { ...SHARED, home: SearchHome } },
  {
    id: 'add',
    label: '추가',
    icon: SquarePlus,
    screens: {
      ...SHARED,
      home: AddHome,
      logList: LogListScreen,
      log: LogScreen,
      routines: RoutineListScreen,
      routineEdit: RoutineEditScreen,
      calProfile: CalProfileScreen,
    },
  },
  { id: 'notifications', label: '알림', icon: Heart, screens: { ...SHARED, home: NotificationsScreen } },
  {
    id: 'account',
    label: '내 계정',
    icon: CircleUserRound,
    screens: {
      ...SHARED,
      home: AccountHome,
      profileEdit: ProfileEditScreen,
      accountSettings: AccountSettingsScreen,
      deleteAccount: DeleteAccountScreen,
    },
  },
];

function Shell() {
  const { state, dispatch } = useNavState();
  const { loginError, unread, toast, user } = useApp();

  // Android app: hardware back button follows the in-app navigation.
  const navRef = useRef(state);
  navRef.current = state;
  useEffect(() => {
    if (import.meta.env.VITE_LOCAL_BACKEND !== 'true') return undefined;
    let handle;
    let cancelled = false;
    import('./nav/androidBack.js').then(async ({ listenBackButton }) => {
      const h = await listenBackButton(() => navRef.current, dispatch);
      if (cancelled) h.remove();
      else handle = h;
    });
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [dispatch]);

  // OAuth errors land on "/": show them on the account tab.
  useEffect(() => {
    if (loginError && state.active !== 'account') dispatch({ type: 'selectTab', tab: 'account' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginError]);

  // Signing out or deleting the account: drop every tab back to its first screen.
  useEffect(() => {
    if (!user) dispatch({ type: 'resetAll' });
  }, [user, dispatch]);

  return (
    <div className="app">
      <header className="app-header">
        <span aria-hidden="true" />
        <h1>체단실</h1>
        <IconButton icon={Settings} label="설정" onClick={() => dispatch({ type: 'openSettings' })} />
      </header>

      <main className="app-main">
        {TABS.map((t) => (
          <TabStack key={t.id} tab={t.id} screens={t.screens} hidden={state.settingsOpen || state.active !== t.id} />
        ))}
        {state.settingsOpen && (
          <ScreenContext tab={null}>
            <div className="tab-panel">
              <div className="screen" data-screen="settings">
                <SettingsScreen onClose={() => dispatch({ type: 'closeSettings' })} />
              </div>
            </div>
          </ScreenContext>
        )}
      </main>

      <Toast toast={toast} />

      <nav className="tab-bar" aria-label="메인 메뉴">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = !state.settingsOpen && state.active === t.id;
          const dot = t.id === 'notifications' && unread > 0;
          return (
            <button
              key={t.id}
              type="button"
              className={`tab ${active ? 'is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              aria-label={dot ? `${t.label} (읽지 않은 알림 ${unread}개)` : t.label}
              title={t.label}
              onClick={() => dispatch({ type: 'selectTab', tab: t.id })}
            >
              <span className="tab-icon">
                <Icon
                  size={26}
                  strokeWidth={active ? 2.3 : 1.7}
                  fill={active && t.id === 'notifications' ? 'currentColor' : 'none'}
                  aria-hidden="true"
                />
                {dot && <span className="red-dot tab-dot" data-testid="unread-dot" aria-hidden="true" />}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <NavProvider>
        <Shell />
      </NavProvider>
    </AppProvider>
  );
}
