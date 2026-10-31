import { useEffect } from 'react';
import { Activity, Bell, CircleUserRound, Search, Settings, SquarePlus } from 'lucide-react';
import { IconButton } from './components/ui.jsx';
import { NavProvider, ScreenContext, TabStack, useNavState } from './nav/Navigator.jsx';
import { AppProvider, useApp } from './state/AppContext.jsx';
import StatusHome from './screens/status/StatusHome.jsx';
import ProgressScreen from './screens/status/ProgressScreen.jsx';
import { BodyweightScreen, ExerciseDetailScreen, ExerciseListScreen } from './screens/status/ExerciseScreens.jsx';
import AccountScreen from './screens/AccountScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';
import Placeholder from './screens/Placeholder.jsx';

const TABS = [
  {
    id: 'status',
    label: '현황',
    icon: Activity,
    screens: {
      home: StatusHome,
      progress: ProgressScreen,
      exercises: ExerciseListScreen,
      exercise: ExerciseDetailScreen,
      bodyweight: BodyweightScreen,
    },
  },
  {
    id: 'search',
    label: '검색',
    icon: Search,
    screens: {
      home: () => <Placeholder icon={Search} title="검색" description="사용자, 운동 프로그램, 운동 종목, 익스텐션을 검색합니다" />,
    },
  },
  {
    id: 'add',
    label: '추가',
    icon: SquarePlus,
    screens: {
      home: () => <Placeholder icon={SquarePlus} title="추가" description="운동일지를 작성하거나 익스텐션을 추가합니다" />,
    },
  },
  {
    id: 'notifications',
    label: '알림',
    icon: Bell,
    screens: {
      home: () => <Placeholder icon={Bell} title="알림" description="친구 신청, 목표 달성 소식 등을 모아 봅니다" />,
    },
  },
  { id: 'account', label: '내 계정', icon: CircleUserRound, screens: { home: AccountScreen } },
];

function Shell() {
  const { state, dispatch } = useNavState();
  const { loginError } = useApp();

  // OAuth errors land on "/": show them on the account tab.
  useEffect(() => {
    if (loginError && state.active !== 'account') dispatch({ type: 'selectTab', tab: 'account' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginError]);

  return (
    <div className="app">
      <header className="app-header">
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

      <nav className="tab-bar" aria-label="메인 메뉴">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = !state.settingsOpen && state.active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`tab ${active ? 'is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => dispatch({ type: 'selectTab', tab: t.id })}
            >
              <Icon size={24} strokeWidth={active ? 2.2 : 1.7} aria-hidden="true" />
              <span>{t.label}</span>
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
