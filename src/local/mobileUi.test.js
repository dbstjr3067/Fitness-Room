// Mobile-only screens: startup recovery, the save warning banner and the Android back button.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { listenSaveWarnings, renderStartupError } from './startupScreens.js';

const native = vi.hoisted(() => ({ listeners: {}, minimized: 0 }));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (name, fn) => (native.listeners[name] = fn),
    minimizeApp: () => native.minimized++,
  },
}));

const buttons = (root) => [...root.querySelectorAll('button')].map((b) => b.textContent);
const click = async (root, label) => {
  [...root.querySelectorAll('button')].find((b) => b.textContent === label).click();
  await new Promise((r) => setTimeout(r, 0));
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('startup recovery screen', () => {
  test('read failure: only retry (nothing to export or reset)', async () => {
    const root = document.createElement('div');
    const retry = vi.fn(async () => {});
    renderStartupError(root, { kind: 'read', message: 'UnknownError' }, { retry, reset: vi.fn() });
    expect(root.textContent).toContain('저장된 기록을 불러오지 못했습니다');
    expect(buttons(root)).toEqual(['다시 시도']);
    await click(root, '다시 시도');
    expect(retry).toHaveBeenCalledTimes(1);
  });

  test('unreadable data: retry, export the file, or start over after two confirmations', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const reset = vi.fn(async () => {});
    const answers = [true, false, true, true];
    const confirm = vi.fn(() => answers.shift());
    const error = { kind: 'open', message: 'file is not a database', bytes: new Uint8Array([1, 2, 3]) };
    renderStartupError(root, error, { retry: vi.fn(), reset, confirm });
    expect(root.textContent).toContain('저장된 기록을 열지 못했습니다');
    expect(root.textContent).toContain('file is not a database');
    expect(buttons(root)).toEqual(['다시 시도', '데이터 내보내기', '초기화하고 새로 시작']);

    await click(root, '초기화하고 새로 시작'); // second question answered no
    expect(reset).not.toHaveBeenCalled();
    await click(root, '초기화하고 새로 시작');
    expect(confirm).toHaveBeenCalledTimes(4);
    expect(reset).toHaveBeenCalledTimes(1);

    URL.createObjectURL = vi.fn(() => 'blob:backup');
    URL.revokeObjectURL = vi.fn();
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      expect(this.download).toMatch(/^cheodansil-backup-\d{8}-\d{4}\.db$/);
    });
    await click(root, '데이터 내보내기');
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain('기록 파일(.db)을 내보냈습니다');
  });

  test('save warning banner comes and goes', () => {
    const stop = listenSaveWarnings();
    window.dispatchEvent(new CustomEvent('fr:save-error', { detail: { failures: 2 } }));
    expect(document.getElementById('fr-save-warning').textContent).toContain('저장하지 못하고');
    window.dispatchEvent(new Event('fr:save-ok'));
    expect(document.getElementById('fr-save-warning')).toBeNull();
    stop();
  });
});

describe('Android back button', () => {
  test('closes the tier promotion screen before anything underneath', async () => {
    const { listenBackButton } = await import('../nav/androidBack.js');
    const dispatch = vi.fn();
    listenBackButton(() => ({ settingsOpen: false, active: 'log', stacks: { log: [{}, {}] } }), dispatch);
    const promo = document.createElement('div');
    promo.className = 'promo-backdrop';
    promo.innerHTML = '<div class="promo-actions"><button>확인</button></div>';
    const ok = vi.fn(() => promo.remove());
    promo.querySelector('button').addEventListener('click', ok);
    document.body.append(promo);

    native.listeners.backButton();
    expect(ok).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();

    native.listeners.backButton(); // modal gone: back within the tab
    expect(dispatch).toHaveBeenCalledWith({ type: 'back' });
    expect(native.minimized).toBe(0);
  });
});
