// UI tests: the real app components talking to a real API server (in-memory DB, see tests/apiServer.js).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import PromotionModal from './components/PromotionModal.jsx';
import { Sheet } from './components/common.jsx';
import { Delta } from './components/ui.jsx';
import { createBrowserFetch } from '../tests/realFetch.js';
import { formatLogDate, todayStr } from './shared/date.js';

let browser;
beforeEach(() => {
  browser = createBrowserFetch();
  vi.stubGlobal('fetch', browser.fetch);
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

let seq = 0;
const uniq = () => `ui_${Date.now().toString(36)}${++seq}`;

const tabBar = () => screen.getByRole('navigation', { name: '메인 메뉴' });
const tab = (name) => within(tabBar()).getByRole('button', { name: new RegExp(`^${name}`) });
const visible = () => document.querySelector('.tab-panel:not([hidden]) .screen:not([hidden])');
const inScreen = () => within(visible());
const submitButton = (panel) => panel.querySelector('form button[type="submit"]');

async function loginDemo(user) {
  render(<App />);
  await user.click(tab('내 계정'));
  await user.click(await screen.findByRole('button', { name: /체험 계정으로 둘러보기/ }));
  await screen.findByRole('button', { name: /로그아웃/ });
}

async function registerUser(user, { name = '리프터' } = {}) {
  render(<App />);
  await user.click(tab('내 계정'));
  const panel = visible();
  await user.click(await within(panel).findByRole('button', { name: '회원가입' }));
  const username = uniq();
  await user.type(within(panel).getByLabelText('사용자명'), name);
  await user.type(within(panel).getByLabelText('아이디'), username);
  await user.type(within(panel).getByLabelText('비밀번호'), 'password123');
  await user.click(submitButton(panel));
  await screen.findByText(`@${username}`);
  return username;
}

describe('app shell', () => {
  test('header, settings button and five tabs; dark theme by default', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '체단실' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '설정' })).toBeInTheDocument();
    // icon-only tabs, named for screen readers
    const tabs = within(tabBar()).getAllByRole('button');
    expect(tabs.map((b) => b.getAttribute('aria-label').replace(/ \(.*$/, ''))).toEqual(['현황', '검색', '추가', '알림', '내 계정']);
    expect(tabs.every((b) => b.textContent === '')).toBe(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(await inScreen().findByText('로그인하러 가기')).toBeInTheDocument();
  });

  test('logged-out tabs point to login; unconfigured social login explains itself', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await inScreen().findByText('로그인하러 가기'));
    expect(tab('내 계정')).toHaveAttribute('aria-current', 'page');
    await user.click(await screen.findByText('카카오로 계속하기'));
    expect(screen.getByRole('alert')).toHaveTextContent('카카오 로그인이 아직 설정되지 않았습니다');
  });
});

describe('account (내 계정)', () => {
  test('register, wrong password, login, logout', async () => {
    const user = userEvent.setup();
    const username = await registerUser(user);
    await user.click(screen.getByRole('button', { name: /로그아웃/ }));
    const panel = await waitFor(() => {
      const p = visible();
      expect(within(p).getByLabelText('아이디')).toBeInTheDocument();
      return p;
    });
    await user.type(within(panel).getByLabelText('아이디'), username);
    await user.type(within(panel).getByLabelText('비밀번호'), 'wrong-pass');
    await user.click(submitButton(panel));
    expect(await screen.findByRole('alert')).toHaveTextContent('올바르지 않습니다');
    await user.clear(within(panel).getByLabelText('비밀번호'));
    await user.type(within(panel).getByLabelText('비밀번호'), 'password123');
    await user.click(submitButton(panel));
    expect(await screen.findByText(`@${username}`)).toBeInTheDocument();
  });

  test('edit profile name and bio', async () => {
    const user = userEvent.setup();
    await registerUser(user);
    await user.click(screen.getByRole('button', { name: /프로필 편집/ }));
    const s = inScreen();
    await user.clear(s.getByLabelText('사용자명'));
    await user.type(s.getByLabelText('사용자명'), '새 이름');
    await user.type(s.getByLabelText(/소개/), '퇴근 후 운동');
    await user.click(s.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('heading', { name: '새 이름' }, { timeout: 3000 })).toBeInTheDocument();
    expect(inScreen().getByText('퇴근 후 운동')).toBeInTheDocument();
  });

  test('delete account needs the password', async () => {
    const user = userEvent.setup();
    const username = await registerUser(user);
    await user.click(screen.getByRole('button', { name: /계정 탈퇴/ }));
    const s = inScreen();
    const submit = s.getByRole('button', { name: '계정 탈퇴' });
    expect(submit).toBeDisabled();
    await user.type(s.getByLabelText('비밀번호를 입력하세요'), 'wrong-pass');
    await user.click(submit);
    expect(await s.findByRole('alert')).toHaveTextContent('비밀번호가 올바르지 않습니다');
    await user.clear(s.getByLabelText('비밀번호를 입력하세요'));
    await user.type(s.getByLabelText('비밀번호를 입력하세요'), 'password123');
    await user.click(submit);
    expect(await screen.findByText('Google로 계속하기')).toBeInTheDocument();
    const r = await browser.api('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'password123' }) });
    expect(r.error).toBeDefined();
  });
});

describe('status (현황)', () => {
  test('dashboard widgets with demo data', async () => {
    const user = userEvent.setup();
    await loginDemo(user);
    await user.click(tab('현황'));
    const s = await waitFor(() => {
      const el = inScreen();
      el.getByText('월간 진행도');
      return el;
    });
    expect(s.getByRole('img', { name: /^루틴 이행률 (\d+%|아직 없음)$/ })).toBeInTheDocument();
    expect(s.getAllByRole('button', { name: /중량 변화 보기$/ })).toHaveLength(4);
    expect(s.getByRole('button', { name: '모든 종목 보기' })).toBeInTheDocument();
    const changes = s.getByRole('region', { name: '운동 변화' });
    expect(within(changes).getByText('레그 프레스')).toBeInTheDocument();
    expect(within(changes).getByText('딥스')).toBeInTheDocument();
    expect(s.getByText('오늘/내일 할 운동')).toBeInTheDocument();
    expect(s.getByText(/몸무게 \d/)).toBeInTheDocument();
  });

  test('re-tapping the tab resets it; switching tabs preserves it', async () => {
    const user = userEvent.setup();
    await loginDemo(user);
    await user.click(tab('현황'));
    await user.click(await inScreen().findByRole('button', { name: '월간 진행도 자세히 보기' }));
    expect(inScreen().getByRole('heading', { name: '진행도' })).toBeInTheDocument();
    await user.click(tab('검색'));
    await user.click(tab('현황'));
    expect(inScreen().getByRole('heading', { name: '진행도' })).toBeInTheDocument();
    await user.click(tab('현황'));
    expect(inScreen().getByText('월간 진행도')).toBeInTheDocument();
    expect(inScreen().queryByRole('heading', { name: '진행도' })).not.toBeInTheDocument();
  });

  test('exercise detail with period capsules', async () => {
    const user = userEvent.setup();
    await loginDemo(user);
    await user.click(tab('현황'));
    await user.click(await inScreen().findByRole('button', { name: '모든 종목 보기' }));
    const dl = inScreen().getByRole('button', { name: '데드리프트 중량 변화 보기' });
    expect(dl.querySelector('.delta-down')).not.toBeNull();
    await user.click(dl);
    const d = inScreen();
    expect(d.getByRole('button', { name: '3주' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(d.getByRole('button', { name: '1년' }));
    expect(d.getByRole('img', { name: '데드리프트 1년 변화 그래프' })).toBeInTheDocument();
  });
});

describe('search (검색)', () => {
  test('category capsules switch what is searched', async () => {
    const user = userEvent.setup();
    await loginDemo(user);
    await user.click(tab('검색'));
    const s = inScreen();
    expect(s.getByRole('button', { name: '사용자' })).toHaveAttribute('aria-pressed', 'true');
    expect(s.getByLabelText('사용자 검색')).toBeInTheDocument();
    await user.click(s.getByRole('button', { name: '운동 종목' }));
    expect(s.getByLabelText('운동 종목 검색')).toBeInTheDocument();
    await user.click(s.getByRole('button', { name: '익스텐션' }));
    expect(s.getByLabelText('익스텐션 검색')).toBeInTheDocument();
    expect(s.getByRole('region', { name: 'AI 검색' })).toBeInTheDocument();
  });

  test('find a user by @id, follow and peek at their routine', async () => {
    const user = userEvent.setup();
    await loginDemo(user);
    await user.click(tab('검색'));
    await user.type(inScreen().getByLabelText('사용자 검색'), '@routine');
    await user.click(await inScreen().findByRole('button', { name: '최루틴 프로필 보기' }));
    const p = inScreen();
    expect(await p.findByRole('heading', { name: '최루틴' })).toBeInTheDocument();
    expect(p.getByText('월간 진행도')).toBeInTheDocument();
    expect(p.getByRole('region', { name: '루틴' })).toBeInTheDocument();
    await user.click(p.getByRole('button', { name: '팔로우' }));
    expect(await p.findByRole('button', { name: '팔로잉' })).toBeInTheDocument();
    await user.click(p.getByRole('button', { name: '팔로잉' }));
    expect(await p.findByRole('button', { name: '팔로우' })).toBeInTheDocument();
  });

  test('private users show a locked profile', async () => {
    const user = userEvent.setup();
    await loginDemo(user);
    await user.click(tab('검색'));
    await user.type(inScreen().getByLabelText('사용자 검색'), '박데드');
    await user.click(await inScreen().findByRole('button', { name: '박데드 프로필 보기' }));
    expect(await inScreen().findByText('비공개 계정입니다')).toBeInTheDocument();
  });

  test('exercise info shows target muscles and form tips', async () => {
    const user = userEvent.setup();
    await loginDemo(user);
    await user.click(tab('검색'));
    await user.click(inScreen().getByRole('button', { name: '운동 종목' }));
    await user.type(inScreen().getByLabelText('운동 종목 검색'), '벤치');
    await user.click(inScreen().getByRole('button', { name: '벤치프레스 선택' }));
    const d = inScreen();
    expect(await d.findByRole('img', { name: '뒤' })).toBeInTheDocument();
    // primary muscles are drawn in red
    const map = await d.findByRole('img', { name: '앞' });
    expect(map.querySelectorAll('path[fill="#e5484d"]').length).toBeGreaterThan(0);
    expect(within(d.getByRole('region', { name: '자세 팁' })).getAllByRole('listitem').length).toBeGreaterThanOrEqual(3);
  });

  test('AI search answers with a link to the extension, which can be liked and applied', async () => {
    const user = userEvent.setup();
    await loginDemo(user);
    await user.click(tab('검색'));
    await user.click(inScreen().getByRole('button', { name: '익스텐션' }));
    await user.type(inScreen().getByLabelText('AI 검색 질문'), 'GVT 프로그램으로 운동을 하고 싶어');
    await user.click(inScreen().getByRole('button', { name: '질문 보내기' }));
    await user.click(await inScreen().findByRole('link', { name: /GVT 10x10 익스텐션 보기/ }));
    const d = inScreen();
    expect(await d.findByRole('heading', { name: 'GVT 10x10', level: 2 })).toBeInTheDocument();
    expect(d.getByText('사용 방법')).toBeInTheDocument();
    await user.click(d.getByRole('button', { name: /^좋아요/ }));
    await waitFor(() => expect(d.getByRole('button', { name: /^좋아요/ })).toHaveAttribute('aria-pressed', 'true'));
    await user.click(d.getByRole('button', { name: '적용' }));
    expect(await d.findByRole('button', { name: '해제' })).toBeInTheDocument();
    const settings = await browser.api('/me/settings');
    expect(settings.extensions.gvt).toBe(true);
  });

  test('off-topic AI questions are politely refused', async () => {
    const user = userEvent.setup();
    await loginDemo(user);
    await user.click(tab('검색'));
    await user.click(inScreen().getByRole('button', { name: '익스텐션' }));
    await user.type(inScreen().getByLabelText('AI 검색 질문'), '내일 서울 날씨 알려줘');
    await user.click(inScreen().getByRole('button', { name: '질문 보내기' }));
    expect(await inScreen().findByText(/체단실 앱과 익스텐션에 관한 질문에만/)).toBeInTheDocument();
    expect(inScreen().queryByRole('link', { name: /익스텐션 보기/ })).not.toBeInTheDocument();
  });
});

describe('add (추가)', () => {
  test('write today’s log: add an exercise, edit cells, rate, memo; auto-saved', async () => {
    const user = userEvent.setup();
    await registerUser(user);
    await user.click(tab('추가'));
    const log = await inScreen().findByRole('region', { name: /운동일지$/ });
    await user.type(within(log).getByLabelText('운동명'), 'Push Day');
    await user.click(within(log).getByRole('button', { name: '종목 추가' }));
    const sheet = screen.getByRole('dialog', { name: '종목 추가' });
    await user.type(within(sheet).getByRole('searchbox'), '벤치');
    await user.click(within(sheet).getByRole('button', { name: '벤치프레스 선택' }));
    const weight = within(log).getByLabelText('벤치프레스 무게');
    await user.clear(weight);
    // empty cells show what goes in them
    expect(weight).toHaveAttribute('placeholder', '무게');
    expect(within(log).getByLabelText('벤치프레스 세트')).toHaveAttribute('placeholder', '세트');
    expect(within(log).getByLabelText('벤치프레스 반복 횟수')).toHaveAttribute('placeholder', '회');
    await user.type(weight, '62.5');
    await user.clear(within(log).getByLabelText('벤치프레스 세트'));
    await user.type(within(log).getByLabelText('벤치프레스 세트'), '5');
    await user.clear(within(log).getByLabelText('벤치프레스 반복 횟수'));
    await user.type(within(log).getByLabelText('벤치프레스 반복 횟수'), '5');
    await user.click(within(log).getByRole('button', { name: /벤치프레스 수행만족도/ }));
    await user.click(within(log).getByRole('button', { name: '3 적절' }));
    await user.type(within(log).getByLabelText('오늘의 메모'), '어깨 조심');
    await waitFor(() => expect(within(log).getByText('저장됨')).toBeInTheDocument(), { timeout: 4000 });

    const saved = (await browser.api(`/workouts/${todayStr()}`)).workout;
    expect(saved).toMatchObject({ splitName: 'Push Day', memo: '어깨 조심' });
    expect(saved.entries).toEqual([
      expect.objectContaining({ exercise: 'bench_press', weight: 62.5, sets: 5, reps: 5, rating: 3 }),
    ]);

    // the list shows it; opening it allows deletion
    await user.click(within(log).getByRole('button', { name: '운동일지 목록' }));
    await user.click(await inScreen().findByRole('button', { name: /Push Day 열기/ }));
    await user.click(await inScreen().findByRole('button', { name: '운동일지 삭제' }));
    await user.click(inScreen().getByRole('button', { name: '삭제' }));
    await waitFor(async () => expect((await browser.api(`/workouts/${todayStr()}`)).workout).toBeNull());
  });

  test('routine card, switching saved routines, and 5x5 groups in the log', async () => {
    const user = userEvent.setup();
    await loginDemo(user);
    await user.click(tab('추가'));
    const routineCard = await inScreen().findByRole('region', { name: '현재 루틴' });
    expect(within(routineCard).getByText('PPL + 5x5')).toBeInTheDocument();
    const log = inScreen().getByRole('region', { name: /운동일지$/ });
    const fiveByFive = within(log).getByRole('rowgroup', { name: 'StrongLift 5x5' });
    // the 5x5 group repeats the column labels at its top
    expect(fiveByFive.querySelector('.group-cols')).toHaveTextContent(/무게.*세트.*회/);

    // adding to the 5x5 group pre-fills 5 sets x 5 reps
    await user.click(within(log).getByRole('button', { name: 'StrongLift 5x5 종목 추가' }));
    const sheet = screen.getByRole('dialog', { name: '종목 추가' });
    // program groups take free weights and machines only
    const caps = within(sheet).getByRole('group', { name: '운동 카테고리' });
    expect(within(caps).getAllByRole('button').map((b) => b.textContent)).toEqual(['전체', '프리웨이트', '머신']);
    await user.type(within(sheet).getByRole('searchbox'), '스쿼트');
    await user.click(within(sheet).getByRole('button', { name: '스쿼트 선택' }));
    const group = within(log).getByRole('rowgroup', { name: 'StrongLift 5x5' });
    expect(within(group).getByLabelText('스쿼트 세트')).toHaveValue('5');
    expect(within(group).getByLabelText('스쿼트 반복 횟수')).toHaveValue('5');
    const squatRow = within(group).getByLabelText('스쿼트 세트').closest('.log-entry');
    expect(within(squatRow).getByText(/증량 제안/)).toBeInTheDocument();

    await user.click(within(routineCard).getByRole('button', { name: /루틴 변경/ }));
    const list = inScreen();
    const alt = await list.findByRole('region', { name: '루틴 전신 3분할' });
    await user.click(within(alt).getByRole('button', { name: '이 루틴으로 변경' }));
    await waitFor(() => expect(within(list.getByRole('region', { name: '루틴 전신 3분할' })).getByText('현재 루틴')).toBeInTheDocument());
    await user.click(tab('추가'));
    expect(await within(inScreen().getByRole('region', { name: '현재 루틴' })).findByText('전신 3분할')).toBeInTheDocument();
  });

  test('extensions card lists applied extensions and opens the shared extension search', async () => {
    const user = userEvent.setup();
    await loginDemo(user);
    await user.click(tab('추가'));
    const card = await inScreen().findByRole('region', { name: '익스텐션' });
    expect(within(card).getByText('StrongLift 5x5')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'WeightTrack 해제' }));
    await waitFor(() => expect(within(card).queryByText('WeightTrack')).not.toBeInTheDocument());
    await user.click(within(card).getByRole('searchbox'));
    expect(await inScreen().findByRole('heading', { name: '익스텐션 검색' })).toBeInTheDocument();
    expect(inScreen().getByRole('region', { name: 'AI 검색' })).toBeInTheDocument();
  });

  test('CalTrack: food from the list updates calories', async () => {
    const user = userEvent.setup();
    await loginDemo(user);
    await user.click(screen.getByRole('button', { name: '설정' }));
    await user.click(screen.getByRole('switch', { name: 'CalTrack 켜기' }));
    await user.click(screen.getByRole('button', { name: '뒤로가기' }));
    await user.click(tab('추가'));
    const cal = await inScreen().findByRole('region', { name: '오늘의 식단' });
    await user.click(within(cal).getByRole('button', { name: '직접 입력' }));
    const sheet = screen.getByRole('dialog', { name: '음식 추가' });
    await user.type(within(sheet).getByRole('searchbox'), '닭가슴살');
    await user.click(within(sheet).getAllByRole('button', { name: /닭가슴살/ })[0]);
    await waitFor(() => expect(within(cal).getByRole('button', { name: /닭가슴살 삭제/ })).toBeInTheDocument());
    expect(Number(cal.querySelector('.kcal-head .big').textContent.replace(/,/g, ''))).toBeGreaterThan(0);
  });
});

describe('exercise catalog and extensions', () => {
  test('picker: typing keeps focus, category capsules, and adding your own exercise', async () => {
    const user = userEvent.setup();
    await registerUser(user);
    await user.click(tab('추가'));
    const log = await inScreen().findByRole('region', { name: /운동일지$/ });
    await user.click(within(log).getByRole('button', { name: '종목 추가' }));
    const sheet = screen.getByRole('dialog', { name: '종목 추가' });
    const box = within(sheet).getByRole('searchbox');
    // regression: the search box used to lose focus after the first character
    await user.type(box, '케이블');
    expect(box).toHaveValue('케이블');
    expect(box).toHaveFocus();
    await user.clear(box);

    const categories = within(sheet).getByRole('group', { name: '운동 카테고리' });
    await user.click(within(categories).getByRole('button', { name: '머신' }));
    expect(within(sheet).getByText('139개 종목')).toBeInTheDocument();
    await user.click(within(categories).getByRole('button', { name: '맨몸운동' }));
    expect(within(sheet).getByText('111개 종목')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: /더 보기/ })).toBeInTheDocument();

    // "+ 직접 추가" sits at the top of the list
    const first = within(sheet).getByRole('list', { name: /목록$/ }).querySelector('li button');
    expect(first).toHaveTextContent('직접 추가');
    await user.click(first);
    const form = screen.getByRole('dialog', { name: '운동 직접 추가' });
    await user.type(within(form).getByRole('textbox', { name: /운동 이름/ }), '링 머슬업');
    await user.click(within(form).getByRole('button', { name: '추가' }));
    await waitFor(() => expect(within(log).getByLabelText('링 머슬업 세트')).toBeInTheDocument());
    const mine = (await browser.api('/me/exercises')).exercises;
    expect(mine).toEqual([expect.objectContaining({ name: '링 머슬업', category: 'bodyweight' })]);

    // it is listed first next time, marked as the user's own
    await user.click(within(log).getByRole('button', { name: '종목 추가' }));
    const again = screen.getByRole('dialog', { name: '종목 추가' });
    expect(within(again).getByRole('button', { name: '링 머슬업 선택' })).toHaveTextContent('내 운동');
  });

  test('유산소: its own section, fields per exercise, saved with the log', async () => {
    const user = userEvent.setup();
    await registerUser(user);
    await user.click(tab('추가'));
    const log = await inScreen().findByRole('region', { name: /운동일지$/ });
    const cardio = within(log).getByRole('region', { name: '유산소' });

    // the weight picker has no cardio and points to the 유산소 section
    await user.click(within(log).getByRole('button', { name: '종목 추가' }));
    const weights = screen.getByRole('dialog', { name: '종목 추가' });
    expect(within(within(weights).getByRole('group', { name: '운동 카테고리' })).queryByRole('button', { name: '유산소' })).toBeNull();
    await user.type(within(weights).getByRole('searchbox'), '러닝');
    expect(within(weights).getByText(/유산소 추가/)).toBeInTheDocument();
    await user.click(within(weights).getByRole('button', { name: '닫기' }));

    await user.click(within(cardio).getByRole('button', { name: '유산소 추가' }));
    let sheet = screen.getByRole('dialog', { name: '유산소 추가' });
    expect(within(sheet).queryByRole('group', { name: '운동 카테고리' })).toBeNull();
    expect(within(sheet).getByText('27개 종목')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: '트레드밀 러닝 선택' })).toHaveTextContent('속도(km/h) · 경사(%) · 시간(분)');
    await user.click(within(sheet).getByRole('button', { name: '트레드밀 러닝 선택' }));
    await user.type(within(cardio).getByLabelText('트레드밀 러닝 속도'), '9.5');
    await user.type(within(cardio).getByLabelText('트레드밀 러닝 경사'), '1');
    await user.type(within(cardio).getByLabelText('트레드밀 러닝 시간'), '25');
    expect(within(log).queryByLabelText('트레드밀 러닝 무게')).toBeNull();

    await user.click(within(cardio).getByRole('button', { name: '유산소 추가' }));
    sheet = screen.getByRole('dialog', { name: '유산소 추가' });
    await user.type(within(sheet).getByRole('searchbox'), '로잉');
    await user.click(within(sheet).getByRole('button', { name: '로잉 머신 선택' }));
    expect(within(cardio).getByLabelText('로잉 머신 거리')).toBeInTheDocument();
    expect(within(cardio).queryByLabelText('로잉 머신 속도')).toBeNull();
    await user.type(within(cardio).getByLabelText('로잉 머신 거리'), '2000');

    await waitFor(() => expect(within(log).getByText('저장됨')).toBeInTheDocument(), { timeout: 4000 });
    const saved = (await browser.api(`/workouts/${todayStr()}`)).workout;
    expect(saved.entries).toEqual([
      expect.objectContaining({ exercise: 'treadmill_run', metrics: { speed: 9.5, incline: 1, time: 25 } }),
      expect.objectContaining({ exercise: 'rowing_machine', metrics: { distance_m: 2000 } }),
    ]);
  });

  test('세척했나요?: 했어요 turns into a black 취소 button and the status shows the last wash', async () => {
    const user = userEvent.setup();
    await loginDemo(user);
    await user.click(tab('추가'));
    const card = await inScreen().findByRole('region', { name: '세척했나요?' });
    await waitFor(() => expect(within(card).getByRole('button', { name: '했어요' })).toBeEnabled());
    expect(within(card).queryByRole('button', { name: '아직' })).not.toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: '했어요' }));
    const cancel = await within(card).findByRole('button', { name: '취소' });
    expect(cancel).toHaveClass('pill-black');

    await user.click(tab('현황'));
    const status = await inScreen().findByRole('region', { name: '마지막 쉐이커 세척' });
    expect(within(status).getByText(/오늘/)).toBeInTheDocument();

    await user.click(tab('추가'));
    await user.click(within(inScreen().getByRole('region', { name: '세척했나요?' })).getByRole('button', { name: '취소' }));
    await waitFor(async () => expect((await browser.api(`/shaker?today=${todayStr()}`)).washedToday).toBe(false));
  });

  test('티어: a manual update opens the promotion screen, closed with 확인', async () => {
    const user = userEvent.setup();
    await loginDemo(user);
    await user.click(tab('추가'));
    const card = await inScreen().findByRole('region', { name: '티어' });
    await user.click(await within(card).findByRole('button', { name: /^벤치프레스 / }));
    const sheet = screen.getByRole('dialog', { name: '벤치프레스 티어 갱신' });
    await user.type(within(sheet).getByRole('textbox'), '250');
    await user.click(within(sheet).getByRole('button', { name: '갱신 요청' }));

    const promo = await screen.findByRole('dialog', { name: '챌린저' });
    expect(within(promo).getByText('승급!')).toBeInTheDocument();
    expect(within(promo).getByText(/벤치프레스 · 250/)).toBeInTheDocument();
    await user.click(within(promo).getByRole('button', { name: '확인' }));
    // the 3대 합계 went up as well, so its screen follows
    const total = await screen.findByRole('dialog', { name: /^(?!챌린저$)/ });
    expect(within(total).getByText(/3대 합계/)).toBeInTheDocument();
    await user.click(within(total).getByRole('button', { name: '확인' }));
    await waitFor(() => expect(document.querySelector('.promo-backdrop')).toBeNull());
    await waitFor(async () => expect((await browser.api('/tiers')).promotions).toEqual([]));
    expect(within(card).getByRole('button', { name: '벤치프레스 챌린저' })).toBeInTheDocument();
  });
});

describe('notifications (알림)', () => {
  test('red dot, unread style, open, share and read all', async () => {
    const user = userEvent.setup();
    await loginDemo(user);
    await waitFor(() => expect(screen.getByTestId('unread-dot')).toBeInTheDocument());
    await user.click(tab('알림'));
    const s = inScreen();
    await waitFor(() => expect(visible().querySelectorAll('.noti.is-unread').length).toBeGreaterThan(0));
    expect(visible().querySelector('.noti.is-unread .red-dot')).not.toBeNull();
    expect(visible().querySelectorAll('.noti.is-read').length).toBeGreaterThan(0);

    const shareBtn = s.getAllByRole('button', { name: '팔로워에게 공유' })[0];
    await user.click(shareBtn);
    expect(await s.findAllByText('공유됨')).not.toHaveLength(0);

    // opening a friend's post goes to their profile
    await user.click(s.getByRole('button', { name: /김벤치님이 목표를 달성했어요/ }));
    expect(await inScreen().findByRole('heading', { name: '김벤치' })).toBeInTheDocument();
    await user.click(tab('알림'));

    await user.click(await inScreen().findByRole('button', { name: '모두 읽음' }));
    await waitFor(() => expect(visible().querySelectorAll('.noti.is-unread')).toHaveLength(0));
    await waitFor(() => expect(screen.queryByTestId('unread-dot')).not.toBeInTheDocument());
  });
});

describe('settings', () => {
  test('theme switch and lbs conversion', async () => {
    const user = userEvent.setup();
    await loginDemo(user);
    await user.click(screen.getByRole('button', { name: '설정' }));
    await user.click(screen.getByRole('button', { name: /라이트/ }));
    expect(document.documentElement.dataset.theme).toBe('light');
    await user.click(screen.getByRole('button', { name: 'lbs' }));
    await user.click(screen.getByRole('switch', { name: '루틴·진행도 공개' }));
    await user.click(screen.getByRole('button', { name: '뒤로가기' }));
    await user.click(tab('현황'));
    expect(await inScreen().findByText(/몸무게 [\d.]+lbs/)).toBeInTheDocument();
    await waitFor(async () => expect((await browser.api('/me/settings')).isPublic).toBe(false));
  });
});

// ---- regressions from the client audit ----

const json = (body, method = 'POST') => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Sign up through the API (same cookie jar as the app), set up data, then open the app.
async function apiUser(setup) {
  const username = uniq();
  await browser.api('/auth/register', json({ username, password: 'password123', displayName: '리프터' }));
  if (setup) await setup();
  render(<App />);
  return username;
}

// Replace fetch for the app; `handler(url, opts, pass)` decides what each request gets.
function interceptFetch(handler) {
  const base = browser.fetch;
  vi.stubGlobal('fetch', (url, opts = {}) => handler(String(url), opts, () => base(url, opts)));
}

async function openAdd(user) {
  await user.click(tab('추가'));
  return inScreen().findByRole('region', { name: /운동일지$/ });
}

// Settings opens over the tabs; closing it leaves the 추가 screen mounted as it was.
async function setUnit(user, unit) {
  await user.click(screen.getByRole('button', { name: '설정' }));
  await user.click(screen.getByRole('button', { name: unit }));
  await user.click(screen.getByRole('button', { name: '뒤로가기' }));
}

const savedLog = async () => (await browser.api(`/workouts/${todayStr()}`)).workout;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('audit regressions', () => {
  test('body weight follows a switch to lbs and is not re-saved by just tapping it; clearing deletes it', async () => {
    const user = userEvent.setup();
    await apiUser(async () => {
      await browser.api('/me/extensions/weighttrack', json({ enabled: true }, 'PUT'));
      await browser.api(`/bodyweights/${todayStr()}`, json({ kg: 75 }, 'PUT'));
    });
    const log = await openAdd(user);
    expect(await within(log).findByLabelText('오늘의 몸무게')).toHaveValue('75');
    await setUnit(user, 'lbs');
    const field = within(log).getByLabelText('오늘의 몸무게');
    expect(field).toHaveValue('165.3');
    await user.click(field);
    await user.tab();
    await sleep(300);
    expect((await browser.api('/status')).bodyWeights.find((b) => b.date === todayStr()).kg).toBe(75);

    await user.clear(field);
    await user.tab();
    await waitFor(async () => expect((await browser.api('/status')).bodyWeights.find((b) => b.date === todayStr())).toBeUndefined());
  });

  test('weights show in the current unit, switch back without drift, and untouched rows keep their stored value', async () => {
    const user = userEvent.setup();
    await apiUser(() =>
      browser.api(
        `/workouts/${todayStr()}`,
        json({ splitName: '', memo: '', entries: [{ exercise: 'bench_press', weight: 100, unit: 'kg', sets: 5, reps: 5, rating: null, program: null }] }, 'PUT'),
      ),
    );
    const log = await openAdd(user);
    expect(within(log).getByLabelText('벤치프레스 무게')).toHaveValue('100');
    await setUnit(user, 'lbs');
    expect(within(log).getAllByRole('columnheader')[1]).toHaveTextContent('무게(lbs)');
    expect(within(log).getByLabelText('벤치프레스 무게')).toHaveValue('220.5');
    await user.type(within(log).getByLabelText('오늘의 메모'), '파운드');
    await waitFor(() => expect(within(log).getByText('저장됨')).toBeInTheDocument(), { timeout: 4000 });
    expect((await savedLog()).entries[0]).toMatchObject({ weight: 100, unit: 'kg' });
    await setUnit(user, 'kg');
    expect(within(log).getByLabelText('벤치프레스 무게')).toHaveValue('100');
  });

  test('number cells: comma as decimal point, one point, and the limits the log saves', async () => {
    const user = userEvent.setup();
    await apiUser();
    const log = await openAdd(user);
    await user.click(within(log).getByRole('button', { name: '종목 추가' }));
    const sheet = screen.getByRole('dialog', { name: '종목 추가' });
    await user.type(within(sheet).getByRole('searchbox'), '벤치');
    await user.click(within(sheet).getByRole('button', { name: '벤치프레스 선택' }));
    const weight = within(log).getByLabelText('벤치프레스 무게');
    await user.clear(weight);
    await user.type(weight, '1.2.3');
    expect(weight).toHaveValue('1.2');
    await user.clear(weight);
    await user.type(weight, '60,5');
    expect(weight).toHaveValue('60.5');
    const sets = within(log).getByLabelText('벤치프레스 세트');
    await user.clear(sets);
    await user.type(sets, '999');
    expect(sets).toHaveValue('50');
    await waitFor(() => expect(within(log).getByText('저장됨')).toBeInTheDocument(), { timeout: 4000 });
    expect((await savedLog()).entries[0]).toMatchObject({ weight: 60.5, sets: 50 });
  });

  test('a memo-only day survives leaving and coming back', async () => {
    const user = userEvent.setup();
    await apiUser();
    let log = await openAdd(user);
    await user.type(within(log).getByLabelText('오늘의 메모'), '휴식일 스트레칭');
    await waitFor(() => expect(within(log).getByText('저장됨')).toBeInTheDocument(), { timeout: 4000 });
    // tapping the open tab again remounts its first screen
    await user.click(tab('추가'));
    log = await inScreen().findByRole('region', { name: /운동일지$/ });
    expect(within(log).getByLabelText('오늘의 메모')).toHaveValue('휴식일 스트레칭');
    await user.type(within(log).getByLabelText('운동명'), 'Rest');
    await waitFor(async () => expect(await savedLog()).toMatchObject({ splitName: 'Rest', memo: '휴식일 스트레칭' }), { timeout: 4000 });
  });

  test('the home card follows edits made to the same day from the log list', async () => {
    const user = userEvent.setup();
    await apiUser();
    const home = await openAdd(user);
    await user.type(within(home).getByLabelText('운동명'), 'Legs');
    await user.type(within(home).getByLabelText('오늘의 메모'), 'A');
    await waitFor(() => expect(within(home).getByText('저장됨')).toBeInTheDocument(), { timeout: 4000 });

    await user.click(within(home).getByRole('button', { name: '운동일지 목록' }));
    await user.click(await inScreen().findByRole('button', { name: /Legs 열기/ }));
    const other = await inScreen().findByRole('region', { name: /운동일지$/ });
    await user.clear(within(other).getByLabelText('오늘의 메모'));
    await user.type(within(other).getByLabelText('오늘의 메모'), 'B');
    await waitFor(() => expect(within(other).getByText('저장됨')).toBeInTheDocument(), { timeout: 4000 });
    await user.click(inScreen().getByRole('button', { name: '뒤로가기' }));
    await user.click(inScreen().getByRole('button', { name: '뒤로가기' }));

    expect(within(home).getByLabelText('오늘의 메모')).toHaveValue('B');
    await user.type(within(home).getByLabelText('운동명'), '2');
    await waitFor(async () => expect(await savedLog()).toMatchObject({ splitName: 'Legs2', memo: 'B' }), { timeout: 4000 });
  });

  test('saves run one at a time and the last edit wins', async () => {
    const user = userEvent.setup();
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    let held = false;
    let running = 0;
    let most = 0;
    await apiUser();
    interceptFetch(async (url, opts, pass) => {
      if (opts.method !== 'PUT' || !url.includes('/api/workouts/')) return pass();
      running++;
      most = Math.max(most, running);
      try {
        const res = await pass();
        if (!held) {
          held = true;
          await gate; // the first answer is slow
        }
        return res;
      } finally {
        running--;
      }
    });
    const log = await openAdd(user);
    const memo = within(log).getByLabelText('오늘의 메모');
    await user.type(memo, 'first');
    await waitFor(() => expect(held).toBe(true), { timeout: 3000 });
    await user.type(memo, ' second');
    await sleep(1000); // the debounce fired while the first save is still out
    release();
    await waitFor(() => expect(within(log).getByText('저장됨')).toBeInTheDocument(), { timeout: 4000 });
    expect(most).toBe(1);
    expect((await savedLog()).memo).toBe('first second');
    await user.click(tab('추가'));
    expect(within(await inScreen().findByRole('region', { name: /운동일지$/ })).getByLabelText('오늘의 메모')).toHaveValue('first second');
  });

  test('an expired session goes to login, and the unsaved edit is saved after logging in again', async () => {
    const user = userEvent.setup();
    const username = await apiUser();
    const log = await openAdd(user);
    browser.jar.clear(); // the session is gone
    await user.type(within(log).getByLabelText('오늘의 메모'), '만료 전 메모');
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent('로그인이 만료되었습니다');
    expect(tab('내 계정')).toHaveAttribute('aria-current', 'page');

    const panel = visible();
    await user.type(within(panel).getByLabelText('아이디'), username);
    await user.type(within(panel).getByLabelText('비밀번호'), 'password123');
    await user.click(submitButton(panel));
    await screen.findByText(`@${username}`);
    await waitFor(async () => expect((await savedLog())?.memo).toBe('만료 전 메모'), { timeout: 4000 });
  });

  test('a failed first load offers 다시 시도 with a Korean message', async () => {
    const user = userEvent.setup();
    let fail = true;
    await apiUser(async () => {
      interceptFetch((url, opts, pass) => {
        if (fail && url.startsWith('/api/status')) return Promise.reject(new TypeError('Failed to fetch'));
        return pass();
      });
    });
    await user.click(tab('추가'));
    expect(await inScreen().findByText('서버에 연결할 수 없습니다. 네트워크를 확인해 주세요')).toBeInTheDocument();
    await user.click(tab('현황'));
    expect(await inScreen().findByText(/서버에 연결할 수 없습니다/)).toBeInTheDocument();
    await user.click(tab('추가'));
    fail = false;
    await user.click(inScreen().getByRole('button', { name: '다시 시도' }));
    expect(await inScreen().findByRole('region', { name: /운동일지$/ })).toBeInTheDocument();
  });

  test('a failed save keeps the edit and 다시 저장 retries it', async () => {
    const user = userEvent.setup();
    let down = true;
    await apiUser();
    interceptFetch((url, opts, pass) => {
      if (down && opts.method === 'PUT' && url.includes('/api/workouts/')) return Promise.reject(new TypeError('Failed to fetch'));
      return pass();
    });
    const log = await openAdd(user);
    await user.type(within(log).getByLabelText('오늘의 메모'), '오프라인');
    expect(await within(log).findByText('저장 실패', {}, { timeout: 3000 })).toBeInTheDocument();
    down = false;
    await user.click(within(log).getByRole('button', { name: /다시 저장/ }));
    await waitFor(() => expect(within(log).getByText('저장됨')).toBeInTheDocument(), { timeout: 4000 });
    expect((await savedLog()).memo).toBe('오프라인');
  });

  test('an entry of a deleted custom cardio exercise stays in 유산소 and keeps its values', async () => {
    const user = userEvent.setup();
    const sent = [];
    await apiUser(async () => {
      const { exercise } = await browser.api('/me/exercises', json({ name: '내 줄넘기', category: 'cardio', metrics: ['count', 'time'] }));
      const entry = { exercise: `c${exercise.id}`, weight: 0, unit: 'kg', sets: 0, reps: 0, rating: null, program: null, metrics: { count: 300, time: 10 } };
      await browser.api(`/workouts/${todayStr()}`, json({ splitName: '', memo: '', entries: [entry] }, 'PUT'));
      await browser.api(`/me/exercises/${exercise.id}`, { method: 'DELETE' });
      interceptFetch((url, opts, pass) => {
        if (opts.method === 'PUT' && url.includes('/api/workouts/')) sent.push(JSON.parse(opts.body));
        return pass();
      });
    });
    const log = await openAdd(user);
    const cardio = within(log).getByRole('region', { name: '유산소' });
    expect(within(cardio).getByText('삭제된 운동')).toBeInTheDocument();
    expect(within(cardio).getByText(/300회 · 10분/)).toBeInTheDocument();
    expect(within(log).queryByLabelText('삭제된 운동 무게')).toBeNull();
    await user.type(within(log).getByLabelText('오늘의 메모'), '메모');
    await waitFor(() => expect(sent.length).toBeGreaterThan(0), { timeout: 3000 });
    // sent back unchanged (the server keeps entries it already has for that day)
    expect(sent.at(-1).entries[0]).toMatchObject({ metrics: { count: 300, time: 10 } });
  });

  test('세척했나요?: a quick 했어요 → 취소 is sent in order and the last tap wins', async () => {
    const user = userEvent.setup();
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    await apiUser(() => browser.api('/me/extensions/shaker', json({ enabled: true }, 'PUT')));
    interceptFetch(async (url, opts, pass) => {
      if (opts.method === 'PUT' && url.includes('/api/shaker/')) await gate; // the 했어요 request is slow
      return pass();
    });
    await user.click(tab('추가'));
    const card = await inScreen().findByRole('region', { name: '세척했나요?' });
    await waitFor(() => expect(within(card).getByRole('button', { name: '했어요' })).toBeEnabled());
    await user.click(within(card).getByRole('button', { name: '했어요' }));
    await user.click(within(card).getByRole('button', { name: '취소' }));
    release();
    await waitFor(() => expect(within(card).getByRole('button', { name: '했어요' })).toBeInTheDocument());
    await waitFor(async () => expect((await browser.api(`/shaker?today=${todayStr()}`)).washedToday).toBe(false));
  });

  test('after midnight the today card moves to the new day, unless it is being edited', async () => {
    const user = userEvent.setup();
    await apiUser();
    const today = todayStr();
    const log = await openAdd(user);
    expect(log).toHaveAccessibleName(`${formatLogDate(today)} 운동일지`);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(Date.now() + 24 * 3600 * 1000));
      const tomorrow = todayStr();
      // being edited: it stays on its day and offers to move
      act(() => within(log).getByLabelText('오늘의 메모').focus());
      act(() => window.dispatchEvent(new Event('fr:resume')));
      expect(await inScreen().findByText('날짜가 바뀌었어요')).toBeInTheDocument();
      expect(inScreen().getByRole('region', { name: /운동일지$/ })).toHaveAccessibleName(`${formatLogDate(today)} 운동일지`);
      await user.click(inScreen().getByRole('button', { name: /오늘로 이동/ }));
      expect(inScreen().getByRole('region', { name: /운동일지$/ })).toHaveAccessibleName(`${formatLogDate(tomorrow)} 운동일지`);
      expect(inScreen().queryByText('날짜가 바뀌었어요')).toBeNull();

      // not being edited: it just follows
      act(() => document.activeElement?.blur());
      vi.setSystemTime(new Date(Date.now() + 24 * 3600 * 1000));
      const next = todayStr();
      act(() => window.dispatchEvent(new Event('fr:resume')));
      await waitFor(() => expect(inScreen().getByRole('region', { name: /운동일지$/ })).toHaveAccessibleName(`${formatLogDate(next)} 운동일지`));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('dialogs', () => {
  test('Escape closes only the top layer: the promotion screen over a sheet, then the newest sheet', async () => {
    const user = userEvent.setup();
    const closed = [];
    const promo = { id: 1, lift: 'bench_press', toRank: 5, fromRank: 4, value: 100, percentile: 40 };
    const { rerender } = render(
      <>
        <Sheet open onClose={() => closed.push('sheet1')} title="첫 시트">a</Sheet>
        <Sheet open onClose={() => closed.push('sheet2')} title="둘째 시트">b</Sheet>
        <PromotionModal promotion={promo} onClose={() => closed.push('promo')} />
      </>,
    );
    await user.keyboard('{Escape}');
    expect(closed).toEqual(['promo']);
    rerender(
      <>
        <Sheet open onClose={() => closed.push('sheet1')} title="첫 시트">a</Sheet>
        <Sheet open onClose={() => closed.push('sheet2')} title="둘째 시트">b</Sheet>
      </>,
    );
    await user.keyboard('{Escape}');
    expect(closed).toEqual(['promo', 'sheet2']);
  });

  test('Delta leaves out the percentage when there is none', () => {
    render(
      <>
        <Delta diff={5} pct={null} />
        <Delta diff={-2} pct={10} />
      </>,
    );
    expect(screen.getByText('+5kg')).toBeInTheDocument();
    expect(screen.getByText('-2kg (10%)')).toBeInTheDocument();
  });
});
