import { useEffect, useState } from 'react';
import { LogIn, LogOut, UserPlus, Eye } from 'lucide-react';
import { api } from '../api.js';
import { Card, Pill, PillGroup } from '../components/ui.jsx';
import { useApp } from '../state/AppContext.jsx';

const PROVIDER_MARK = { google: 'G', naver: 'N', kakao: 'K', github: 'GH' };

export default function AccountScreen() {
  const { user, authReady } = useApp();
  if (!authReady) return null;
  return user ? <Profile /> : <LoginScreen />;
}

function Profile() {
  const { user, logout } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const onLogout = async () => {
    setBusy(true);
    setError(null);
    try {
      await logout();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <div className="screen-body">
      <Card className="profile">
        <div className="avatar" aria-hidden="true">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.displayName.slice(0, 1)}
        </div>
        <div className="grow">
          <h2>{user.displayName}</h2>
          <p className="muted small">
            {user.username ? `@${user.username}` : user.isDemo ? '체험 계정' : '소셜 로그인 계정'}
            {user.email ? ` · ${user.email}` : ''}
          </p>
        </div>
      </Card>
      {user.isDemo && (
        <p className="muted small notice">체험 계정은 로그아웃하면 기록이 모두 삭제됩니다.</p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <Pill icon={LogOut} onClick={onLogout} disabled={busy} className="block">
        로그아웃
      </Pill>
    </div>
  );
}

function LoginScreen() {
  const { login, register, demoLogin, loginError, setLoginError } = useApp();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', displayName: '' });
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
        : register(form.username.trim(), form.password, form.displayName.trim()),
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
          {mode === 'register' && <p className="muted small">아이디: 영문 소문자·숫자·_ 4~20자 / 비밀번호: 8자 이상</p>}
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
