// Mobile app only: what the user sees when the in-app server can't start (instead of a blank error line),
// and a warning banner while saving to the device keeps failing. Plain DOM, so it works without the app.

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children.filter(Boolean));
  return node;
}

function pill(label, onClick, primary = false) {
  return el('button', { type: 'button', className: `pill block ${primary ? 'pill-primary' : 'pill-default'}`, textContent: label, onclick: onClick });
}

const TEXT = {
  read: {
    title: '저장된 기록을 불러오지 못했습니다',
    body: '기록은 지워지지 않았습니다. 잠시 후 다시 시도해 주세요. 계속 안 되면 앱을 완전히 종료한 뒤 다시 열어 주세요.',
  },
  open: {
    title: '저장된 기록을 열지 못했습니다',
    body: '기록 파일이 손상되었거나 업데이트 중 문제가 생겼습니다. 원래 파일은 휴대폰 안에 따로 보관해 두었습니다. 먼저 데이터를 내보내 두는 것을 권장합니다.',
  },
  other: {
    title: '앱을 시작하지 못했습니다',
    body: '잠시 후 다시 시도해 주세요.',
  },
};

function backupName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `cheodansil-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.db`;
}

/** Hand the raw database file to the user: the share sheet when the WebView has one, else a download. */
export async function exportDatabaseFile(bytes, name = backupName()) {
  const file = new File([bytes], name, { type: 'application/vnd.sqlite3' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '체단실 기록 백업' });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}

/**
 * Show the startup failure screen in `root`.
 * actions: retry() — start again; reset() — move the data aside and start empty (asked twice first).
 */
export function renderStartupError(root, error, { retry, reset, confirm = (m) => window.confirm(m) }) {
  const kind = TEXT[error?.kind] ? error.kind : 'other';
  const status = el('p', { className: 'muted small', role: 'status' });
  const busy = (fn) => async () => {
    for (const b of root.querySelectorAll('button')) b.disabled = true;
    try {
      await fn();
    } catch (e) {
      status.textContent = `실패했습니다: ${e.message}`;
    } finally {
      for (const b of root.querySelectorAll('button')) b.disabled = false;
    }
  };

  const buttons = [pill('다시 시도', busy(retry), true)];
  if (kind === 'open' && error.bytes) {
    buttons.push(
      pill(
        '데이터 내보내기',
        busy(async () => {
          const how = await exportDatabaseFile(error.bytes);
          if (how !== 'cancelled') status.textContent = '기록 파일(.db)을 내보냈습니다. 안전한 곳에 보관해 주세요.';
        }),
      ),
    );
  }
  if (kind === 'open' && reset) {
    buttons.push(
      pill(
        '초기화하고 새로 시작',
        busy(async () => {
          if (!confirm('저장된 기록을 비우고 새로 시작할까요?\n지금 파일은 휴대폰 안에 백업으로 남겨 둡니다.')) return;
          if (!confirm('정말 초기화할까요? 앱에서는 이전 기록을 더 이상 볼 수 없습니다.')) return;
          await reset();
        }),
      ),
    );
  }

  const card = el(
    'section',
    { className: 'card startup-error' },
    el('h2', { textContent: TEXT[kind].title }),
    el('p', { className: 'muted', textContent: TEXT[kind].body }),
    el('p', { className: 'muted small', textContent: `오류: ${error?.message || error}` }),
    ...buttons,
    status,
  );
  card.style.cssText = 'display:flex;flex-direction:column;gap:12px;max-width:420px;margin:15vh auto 0;padding:24px;';
  root.textContent = '';
  root.append(el('div', { className: 'screen-body' }, card));
}

const BANNER_ID = 'fr-save-warning';

/** Show a banner while saves fail ('fr:save-error'), hide it once a save works again ('fr:save-ok'). */
export function listenSaveWarnings(target = window) {
  const show = () => {
    if (document.getElementById(BANNER_ID)) return;
    const banner = el('div', {
      id: BANNER_ID,
      role: 'alert',
      textContent: '기록을 휴대폰에 저장하지 못하고 있습니다. 저장 공간을 확인해 주세요. 자동으로 다시 시도합니다.',
    });
    banner.style.cssText =
      'position:fixed;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom, 0px) + 84px);z-index:1000;' +
      'padding:12px 16px;border-radius:14px;background:var(--down, #ff453a);color:#fff;font-size:14px;line-height:1.4;';
    document.body.append(banner);
  };
  const hide = () => document.getElementById(BANNER_ID)?.remove();
  target.addEventListener('fr:save-error', show);
  target.addEventListener('fr:save-ok', hide);
  return () => {
    target.removeEventListener('fr:save-error', show);
    target.removeEventListener('fr:save-ok', hide);
  };
}
