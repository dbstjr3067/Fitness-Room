// Google / GitHub login in the Android app: show a short code, the user enters it on the provider's site
// in the phone's browser, and this sheet keeps asking the in-app server until the login is finished.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink, RotateCw } from 'lucide-react';
import { api } from '../../api.js';
import { Pill } from '../../components/ui.jsx';
import { Sheet } from '../../components/common.jsx';
import { useApp } from '../../state/AppContext.jsx';

const DONE_TEXT = {
  denied: '로그인을 취소했습니다.',
  expired: '코드가 만료되었습니다. 새 코드를 받아 주세요.',
};

export default function DeviceLoginSheet({ provider, onClose }) {
  const { signedIn } = useApp();
  const [flow, setFlow] = useState(null); // { flowId, userCode, verificationUri, interval }
  const [status, setStatus] = useState('starting'); // starting | waiting | denied | expired | error
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  const alive = useRef(true);
  const polling = useRef(false);

  const start = useCallback(async () => {
    clearTimeout(timer.current);
    setStatus('starting');
    setError(null);
    setCopied(false);
    try {
      const f = await api(`/auth/device/${provider.id}/start`, { method: 'POST' });
      if (!alive.current) return;
      setFlow(f);
      setStatus('waiting');
    } catch (e) {
      if (!alive.current) return;
      setError(e.message);
      setStatus('error');
    }
  }, [provider.id]);

  const poll = useCallback(async () => {
    if (!flow || polling.current) return;
    polling.current = true;
    clearTimeout(timer.current);
    try {
      const r = await api(`/auth/device/${provider.id}/poll`, { method: 'POST', body: { flowId: flow.flowId } });
      if (!alive.current) return;
      if (r.status === 'ok') {
        signedIn(r.user);
        onClose();
        return;
      }
      if (r.status === 'pending') {
        timer.current = setTimeout(poll, (r.interval || flow.interval || 5) * 1000);
        return;
      }
      setStatus(r.status === 'denied' || r.status === 'expired' ? r.status : 'error');
    } catch (e) {
      if (!alive.current) return;
      setError(e.message);
      setStatus('error');
    } finally {
      polling.current = false;
    }
  }, [flow, provider.id, signedIn, onClose]);

  useEffect(() => {
    alive.current = true;
    start();
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, [start]);

  // Wait one interval before the first check; check again right away when the user comes back from the browser.
  useEffect(() => {
    if (status !== 'waiting' || !flow) return undefined;
    timer.current = setTimeout(poll, flow.interval * 1000);
    const onBack = () => document.visibilityState === 'visible' && poll();
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('fr:resume', onBack);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('fr:resume', onBack);
    };
  }, [status, flow, poll]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(flow.userCode);
      setCopied(true);
    } catch {
      setCopied(false); // the code stays selectable by hand
    }
  };

  return (
    <Sheet open title={`${provider.label}로 로그인`} onClose={onClose}>
      <div className="device-login">
        {status === 'starting' && <p className="muted">코드를 받는 중…</p>}
        {status === 'error' && (
          <>
            <p className="error" role="alert">{error || '로그인에 실패했습니다. 다시 시도하세요'}</p>
            <Pill icon={RotateCw} onClick={start}>다시 시도</Pill>
          </>
        )}
        {(status === 'denied' || status === 'expired') && (
          <>
            <p className="muted" role="status">{DONE_TEXT[status]}</p>
            <Pill icon={RotateCw} variant="primary" onClick={start}>새 코드 받기</Pill>
          </>
        )}
        {status === 'waiting' && flow && (
          <>
            <ol className="device-steps">
              <li>아래 코드를 복사하세요</li>
              <li>{provider.label} 페이지에서 코드를 입력하고 로그인하세요</li>
              <li>이 화면으로 돌아오면 자동으로 로그인됩니다</li>
            </ol>
            <output className="device-code" aria-label="로그인 코드">{flow.userCode}</output>
            <div className="row-actions">
              <Pill icon={Copy} onClick={copy}>{copied ? '복사했어요' : '코드 복사'}</Pill>
              <a className="pill pill-primary grow" href={flow.verificationUri} target="_blank" rel="noreferrer">
                <ExternalLink size={16} aria-hidden="true" />
                <span>{provider.label}에서 코드 입력</span>
              </a>
            </div>
            <p className="muted small device-wait" aria-live="polite">로그인을 기다리는 중…</p>
          </>
        )}
      </div>
    </Sheet>
  );
}
