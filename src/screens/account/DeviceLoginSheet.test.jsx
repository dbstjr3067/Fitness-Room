import { afterEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import DeviceLoginSheet from './DeviceLoginSheet.jsx';

const api = vi.fn();
const signedIn = vi.fn();
vi.mock('../../api.js', () => ({ api: (...a) => api(...a) }));
vi.mock('../../state/AppContext.jsx', () => ({ useApp: () => ({ signedIn }) }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  api.mockReset();
  signedIn.mockReset();
});

const provider = { id: 'github', label: 'GitHub', enabled: true, mode: 'device' };
const flush = () => act(async () => {});

describe('Google/GitHub login with a code', () => {
  test('shows the code and the provider page, waits, then signs in', async () => {
    vi.useFakeTimers();
    api.mockImplementation(async (path) => {
      if (path.endsWith('/start')) return { flowId: 'f1', userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device', interval: 5 };
      return api.pollAnswers.shift();
    });
    api.pollAnswers = [{ status: 'pending', interval: 5 }, { status: 'ok', user: { id: 1, displayName: 'octo' } }];
    const onClose = vi.fn();
    render(<DeviceLoginSheet provider={provider} onClose={onClose} />);
    await flush();
    expect(screen.getByLabelText('로그인 코드')).toHaveTextContent('ABCD-1234');
    const link = screen.getByRole('link', { name: /GitHub에서 코드 입력/ });
    expect(link).toHaveAttribute('href', 'https://github.com/login/device');
    expect(link).toHaveAttribute('target', '_blank');

    await act(async () => vi.advanceTimersByTime(5000));
    expect(api).toHaveBeenLastCalledWith('/auth/device/github/poll', { method: 'POST', body: { flowId: 'f1' } });
    expect(signedIn).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(5000));
    expect(signedIn).toHaveBeenCalledWith({ id: 1, displayName: 'octo' });
    expect(onClose).toHaveBeenCalled();
  });

  test('cancelled or expired logins offer a new code; start errors offer 다시 시도', async () => {
    vi.useFakeTimers();
    api.mockImplementation(async (path) =>
      path.endsWith('/start') ? { flowId: 'f2', userCode: 'X', verificationUri: 'https://github.com/login/device', interval: 5 } : { status: 'denied' },
    );
    render(<DeviceLoginSheet provider={provider} onClose={() => {}} />);
    await flush();
    await act(async () => vi.advanceTimersByTime(5000));
    expect(screen.getByRole('status')).toHaveTextContent('로그인을 취소했습니다');
    expect(screen.getByRole('button', { name: '새 코드 받기' })).toBeInTheDocument();
    cleanup();

    api.mockReset();
    api.mockRejectedValue(new Error('서버에 연결할 수 없습니다. 네트워크를 확인해 주세요'));
    render(<DeviceLoginSheet provider={provider} onClose={() => {}} />);
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent('서버에 연결할 수 없습니다');
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  test('coming back from the browser checks right away', async () => {
    vi.useFakeTimers();
    api.mockImplementation(async (path) =>
      path.endsWith('/start')
        ? { flowId: 'f3', userCode: 'Y', verificationUri: 'https://www.google.com/device', interval: 5 }
        : { status: 'ok', user: { id: 2 } },
    );
    render(<DeviceLoginSheet provider={{ id: 'google', label: 'Google', enabled: true, mode: 'device' }} onClose={() => {}} />);
    await flush();
    await act(async () => window.dispatchEvent(new Event('fr:resume')));
    expect(signedIn).toHaveBeenCalledWith({ id: 2 });
  });
});
