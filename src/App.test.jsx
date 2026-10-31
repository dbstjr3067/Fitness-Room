import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { buildDemoData } from '../server/demoData.js';
import { todayStr } from './shared/date.js';

// Minimal fake of the server API.
function fakeApi() {
  const demo = buildDemoData(todayStr());
  const state = {
    user: null,
    settings: { weeklyGoal: 3, unit: 'kg', theme: 'dark', extensions: {} },
    calls: [],
  };
  const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
  const handler = vi.fn((url, opts = {}) => {
    const method = opts.method || 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    state.calls.push(`${method} ${url}`);
    switch (`${method} ${url}`) {
      case 'GET /api/auth/me':
        return json({ user: state.user });
      case 'GET /api/auth/providers':
        return json({
          providers: [
            { id: 'google', label: 'Google', enabled: false },
            { id: 'naver', label: '네이버', enabled: false },
            { id: 'kakao', label: '카카오', enabled: false },
            { id: 'github', label: 'GitHub', enabled: false },
          ],
          demo: true,
        });
      case 'POST /api/auth/demo':
        state.user = { id: 1, displayName: '체단실 체험', username: null, isDemo: true };
        state.settings.extensions = { bodyweight: true, streak: true, routine: true };
        return json({ user: state.user }, 201);
      case 'POST /api/auth/login':
        if (body.password !== 'password123') return json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' }, 401);
        state.user = { id: 2, displayName: '리프터', username: body.username, isDemo: false };
        return json({ user: state.user });
      case 'POST /api/auth/logout':
        state.user = null;
        return json({ ok: true });
      case 'GET /api/settings':
        return json(state.settings);
      case 'PUT /api/settings':
        Object.assign(state.settings, body);
        return json(state.settings);
      case 'GET /api/status':
        return json(state.user?.isDemo ? demo : { workouts: [], routine: {}, bodyWeights: [] });
      default:
        if (url.startsWith('/api/extensions/')) {
          state.settings.extensions[url.split('/').pop()] = body.enabled;
          return json(state.settings);
        }
        return json({ error: 'not found' }, 404);
    }
  });
  return { handler, state };
}

let api;
beforeEach(() => {
  api = fakeApi();
  vi.stubGlobal('fetch', api.handler);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const tabBar = () => screen.getByRole('navigation', { name: '메인 메뉴' });
const tab = (name) => within(tabBar()).getByRole('button', { name });
const visibleScreen = () => {
  const panel = document.querySelector('.tab-panel:not([hidden])');
  return panel.querySelector('.screen:not([hidden])');
};

const submitButton = (panel) => panel.querySelector('form button[type="submit"]');

async function loginDemo(user) {
  await user.click(tab('내 계정'));
  await user.click(await screen.findByRole('button', { name: /체험 계정으로 둘러보기/ }));
  await screen.findByText('로그아웃');
  await user.click(tab('현황'));
  await within(visibleScreen()).findByText('월간 진행도');
}

describe('app shell', () => {
  test('header, settings button and five tabs; dark theme by default', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '체단실' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '설정' })).toBeInTheDocument();
    expect(within(tabBar()).getAllByRole('button').map((b) => b.textContent)).toEqual([
      '현황',
      '검색',
      '추가',
      '알림',
      '내 계정',
    ]);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(await screen.findByText('로그인하러 가기')).toBeInTheDocument();
  });

  test('logged-out status links to the login screen', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByText('로그인하러 가기'));
    expect(tab('내 계정')).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByText('Google로 계속하기')).toBeInTheDocument();
    expect(screen.getByText('네이버로 계속하기')).toBeInTheDocument();
    expect(screen.getByText('카카오로 계속하기')).toBeInTheDocument();
    expect(screen.getByText('GitHub로 계속하기')).toBeInTheDocument();
  });

  test('unconfigured social login shows a message', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(tab('내 계정'));
    await user.click(await screen.findByText('카카오로 계속하기'));
    expect(screen.getByRole('alert')).toHaveTextContent('카카오 로그인이 아직 설정되지 않았습니다');
  });

  test('settings opens and closes; theme switch applies', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '설정' }));
    expect(screen.getByRole('heading', { name: '설정' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /라이트/ }));
    expect(document.documentElement.dataset.theme).toBe('light');
    await user.click(screen.getByRole('button', { name: '뒤로가기' }));
    expect(screen.queryByRole('heading', { name: '설정' })).not.toBeInTheDocument();
  });
});

describe('login / logout', () => {
  test('password login error and success, then logout', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(tab('내 계정'));
    const panel = visibleScreen();
    await user.type(within(panel).getByLabelText('아이디'), 'lifter_1');
    await user.type(within(panel).getByLabelText('비밀번호'), 'wrong-pass');
    await user.click(submitButton(panel));
    expect(await screen.findByRole('alert')).toHaveTextContent('올바르지 않습니다');

    await user.clear(within(panel).getByLabelText('비밀번호'));
    await user.type(within(panel).getByLabelText('비밀번호'), 'password123');
    await user.click(submitButton(panel));
    expect(await screen.findByText('@lifter_1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '로그아웃' }));
    expect(await screen.findByText('Google로 계속하기')).toBeInTheDocument();
    expect(api.state.calls).toContain('POST /api/auth/logout');
  });

  test('new user sees an empty status with the recommended extensions card', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(tab('내 계정'));
    const panel = visibleScreen();
    await user.type(within(panel).getByLabelText('아이디'), 'lifter_1');
    await user.type(within(panel).getByLabelText('비밀번호'), 'password123');
    await user.click(submitButton(panel));
    await screen.findByText('@lifter_1');
    await user.click(tab('현황'));
    const status = visibleScreen();
    expect(await within(status).findByText('아직 기록된 운동이 없습니다')).toBeInTheDocument();
    await user.click(within(status).getByRole('button', { name: '적용' }));
    await waitFor(() => expect(within(visibleScreen()).getByText('오늘/내일 할 운동')).toBeInTheDocument());
    expect(within(visibleScreen()).getByText(/주 연속 목표 달성/)).toBeInTheDocument();
  });
});

describe('status (현황)', () => {
  test('dashboard widgets with demo data', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loginDemo(user);
    const s = visibleScreen();
    expect(within(s).getByText(/주 평균/)).toBeInTheDocument();
    expect(within(s).getByRole('img', { name: /루틴 이행률 \d+%/ })).toBeInTheDocument();
    // 4 exercise tiles + "더보기"
    const tiles = within(s).getAllByRole('button', { name: /중량 변화 보기$/ });
    expect(tiles).toHaveLength(4);
    expect(within(s).getByRole('button', { name: '모든 종목 보기' })).toBeInTheDocument();
    // dropped / new exercises from the demo data
    const changes = within(s).getByRole('region', { name: '운동 변화' });
    expect(within(changes).getByText('레그 프레스')).toBeInTheDocument();
    expect(within(changes).getByText('딥스')).toBeInTheDocument();
    // deadlift went down -> red delta somewhere on the page after "more"
    expect(within(s).getByText(/몸무게 \d/)).toBeInTheDocument();
  });

  test('re-tapping the tab resets it; switching tabs preserves it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loginDemo(user);

    await user.click(within(visibleScreen()).getByRole('button', { name: '월간 진행도 자세히 보기' }));
    expect(within(visibleScreen()).getByRole('heading', { name: '진행도' })).toBeInTheDocument();
    expect(within(visibleScreen()).getByText('주간 진행도')).toBeInTheDocument();
    expect(within(visibleScreen()).getByText('오늘의 진행도')).toBeInTheDocument();

    await user.click(tab('검색'));
    expect(within(visibleScreen()).getByRole('heading', { name: '검색' })).toBeInTheDocument();
    await user.click(tab('현황'));
    expect(within(visibleScreen()).getByRole('heading', { name: '진행도' })).toBeInTheDocument();

    await user.click(tab('현황'));
    expect(within(visibleScreen()).getByText('월간 진행도')).toBeInTheDocument();
    expect(within(visibleScreen()).queryByRole('heading', { name: '진행도' })).not.toBeInTheDocument();
  });

  test('exercise list, detail and period capsules; back button', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loginDemo(user);

    await user.click(within(visibleScreen()).getByRole('button', { name: '모든 종목 보기' }));
    const list = visibleScreen();
    expect(within(list).getByRole('heading', { name: '종목 별 중량 변화' })).toBeInTheDocument();
    expect(within(list).getAllByRole('button', { name: /중량 변화 보기$/ }).length).toBeGreaterThan(4);
    // deadlift weight dropped recently -> red
    const dl = within(list).getByRole('button', { name: '데드리프트 중량 변화 보기' });
    expect(dl.querySelector('.delta-down')).not.toBeNull();

    await user.click(dl);
    const detail = visibleScreen();
    expect(within(detail).getByRole('heading', { name: '데드리프트' })).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: '3주' })).toHaveAttribute('aria-pressed', 'true');
    for (const label of ['7일', '3주', '3개월', '1년']) {
      expect(within(detail).getByRole('button', { name: label })).toBeInTheDocument();
    }
    await user.click(within(detail).getByRole('button', { name: '1년' }));
    expect(within(detail).getByRole('button', { name: '1년' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(detail).getByRole('img', { name: '데드리프트 1년 변화 그래프' })).toBeInTheDocument();

    await user.click(within(detail).getByRole('button', { name: '뒤로가기' }));
    expect(within(visibleScreen()).getByRole('heading', { name: '종목 별 중량 변화' })).toBeInTheDocument();
  });

  test('lbs setting converts displayed weights', async () => {
    const user = userEvent.setup();
    render(<App />);
    await loginDemo(user);
    await user.click(screen.getByRole('button', { name: '설정' }));
    await user.click(screen.getByRole('button', { name: 'lbs' }));
    await user.click(screen.getByRole('button', { name: '뒤로가기' }));
    expect(within(visibleScreen()).getByText(/몸무게 [\d.]+lbs/)).toBeInTheDocument();
  });
});
