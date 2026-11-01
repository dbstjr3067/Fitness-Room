import { useEffect, useState } from 'react';
import { LogIn, UserPlus, Eye } from 'lucide-react';
import { api } from '../../api.js';
import { Card, Pill, PillGroup } from '../../components/ui.jsx';
import { useApp } from '../../state/AppContext.jsx';

const PROVIDER_MARK = { google: 'G', naver: 'N', kakao: 'K', github: 'GH' };

export default function LoginScreen() {
  const { login, register, demoLogin, loginError, setLoginError } = useApp();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', displayName: '', promoOptIn: false });
  const [providers, setProviders] = useState([]);
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/auth/providers')
      .then((r) => {
        setProviders(r.providers);
        setDemo(r.demo);
      })
      .catch(() => {});
  }, []);

  const run = async (fn) => {
    setBusy(true);
    setLoginError(null);
    try {
      await fn();
    } catch (e) {
      setLoginError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    run(() =>
      mode === 'login'
        ? login(form.username.trim(), form.password)
        : register(form.username.trim(), form.password, form.displayName.trim(), form.promoOptIn),
    );
  };

  const onSocial = (p) => {
    if (!p.enabled) {
      setLoginError(`${p.label} 로그인이 아직 설정되지 않았습니다 (서버에 앱 키 필요)`);
      return;
    }
    window.location.href = `/api/auth/oauth/${p.id}`;
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="screen-body login">
      <div className="login-head">
        <h2>체단실 시작하기</h2>
        <p className="muted">운동 기록은 서버에 안전하게 저장됩니다</p>
      </div>

      <div className="social-list">
        {providers.map((p) => (
          <Pill key={p.id} onClick={() => onSocial(p)} className={`block social ${p.enabled ? '' : 'is-off'}`}>
            <span className="social-mark" aria-hidden="true">{PROVIDER_MARK[p.id]}</span>
            {p.label}로 계속하기
          </Pill>
        ))}
      </div>

      <div className="divider"><span>또는</span></div>

      <Card>
        <PillGroup
          options={[
            { id: 'login', label: '로그인' },
            { id: 'register', label: '회원가입' },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setLoginError(null);
          }}
          label="로그인 방식"
        />
        <form className="form" onSubmit={onSubmit}>
          {mode === 'register' && (
            <label>
              <span>사용자명</span>
              <input value={form.displayName} onChange={set('displayName')} maxLength={30} autoComplete="nickname" />
            </label>
          )}
          <label>
            <span>아이디</span>
            <input value={form.username} onChange={set('username')} autoComplete="username" required autoCapitalize="none" />
          </label>
          <label>
            <span>비밀번호</span>
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </label>
          {mode === 'register' && (
            <>
              <p className="muted small">아이디: 영문 소문자·숫자·_ 4~20자 / 비밀번호: 8자 이상</p>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={form.promoOptIn}
                  onChange={(e) => setForm((f) => ({ ...f, promoOptIn: e.target.checked }))}
                />
                <span className="small">(선택) 이벤트·새 익스텐션 등 홍보성 알림 수신에 동의합니다</span>
              </label>
            </>
          )}
          {loginError && <p className="error" role="alert">{loginError}</p>}
          <Pill type="submit" variant="primary" icon={mode === 'login' ? LogIn : UserPlus} disabled={busy} className="block">
            {mode === 'login' ? '로그인' : '가입하기'}
          </Pill>
        </form>
      </Card>

      {demo && (
        <Pill icon={Eye} onClick={() => run(demoLogin)} disabled={busy} className="block ghost">
          체험 계정으로 둘러보기
        </Pill>
      )}
    </div>
  );
}
