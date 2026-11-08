// 계정 정보: profile, edit, account settings, deletion.
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, ImagePlus, KeyRound, LogOut, Pencil, RotateCcw, UserX } from 'lucide-react';
import { api, readJson, request } from '../../api.js';
import { Card, Empty, Pill, ScreenHeader } from '../../components/ui.jsx';
import { Avatar } from '../../components/common.jsx';
import { resizeImage } from '../../components/image.js';
import { useNav } from '../../nav/Navigator.jsx';
import { useApp } from '../../state/AppContext.jsx';
import LoginScreen from './LoginScreen.jsx';

const PROVIDER_LABEL = { google: 'Google', github: 'GitHub' };

export default function AccountHome() {
  const { user, authReady } = useApp();
  if (!authReady) return null;
  return user ? <Profile /> : <LoginScreen />;
}

function Profile() {
  const { user, logout } = useApp();
  const nav = useNav();
  const [counts, setCounts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(`/users/${user.id}`)
      .then((r) => setCounts({ followers: r.followers, following: r.following }))
      .catch(() => {});
  }, [user.id]);

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
      <Card className="profile-card">
        <Avatar user={user} size={72} />
        <div className="grow">
          <h2>{user.displayName}</h2>
          <p className="muted small">
            {user.username ? `@${user.username}` : user.isDemo ? '체험 계정' : '소셜 로그인 계정'}
          </p>
          {counts && (
            <p className="small counts">
              <strong>{counts.followers}</strong> 팔로워 · <strong>{counts.following}</strong> 팔로잉
            </p>
          )}
        </div>
      </Card>
      {user.bio ? <p className="bio">{user.bio}</p> : <p className="muted small bio">소개가 없습니다</p>}
      {user.isDemo && <p className="muted small notice">체험 계정은 로그아웃하면 기록이 모두 삭제됩니다.</p>}

      <ul className="menu-list" aria-label="계정 메뉴">
        <MenuRow icon={Pencil} label="프로필 편집" onClick={() => nav.push('profileEdit')} />
        <MenuRow icon={KeyRound} label="계정 설정" hint="아이디 · 비밀번호 · 복구 정보" onClick={() => nav.push('accountSettings')} />
        <MenuRow icon={LogOut} label="로그아웃" onClick={onLogout} disabled={busy} chevron={false} />
        <MenuRow icon={UserX} label="계정 탈퇴" onClick={() => nav.push('deleteAccount')} danger />
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function MenuRow({ icon: Icon, label, hint, onClick, danger, disabled, chevron = true }) {
  return (
    <li>
      <button type="button" className={`menu-row ${danger ? 'danger' : ''}`} onClick={onClick} disabled={disabled}>
        <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
        <span className="grow">
          {label}
          {hint && <span className="muted tiny block">{hint}</span>}
        </span>
        {chevron && <ChevronRight size={18} className="muted" aria-hidden="true" />}
      </button>
    </li>
  );
}

export function ProfileEditScreen() {
  const { user, setUser, showToast } = useApp();
  const nav = useNav();
  const [form, setForm] = useState({ displayName: user.displayName, bio: user.bio || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const upload = async (file) => {
    setBusy(true);
    setError(null);
    try {
      // center-cropped 256px JPEG
      const blob = await resizeImage(file);
      const res = await request('/api/me/avatar', { method: 'POST', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
      const data = await readJson(res, '/me/avatar');
      setUser(data.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const resetAvatar = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api('/me/avatar', { method: 'DELETE' });
      setUser(r.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api('/me/profile', { method: 'PUT', body: { displayName: form.displayName.trim(), bio: form.bio.trim() } });
      setUser(r.user);
      showToast('프로필을 저장했습니다');
      nav.back();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <>
      <ScreenHeader title="프로필 편집" />
      <div className="screen-body">
        <div className="avatar-edit">
          <Avatar user={user} size={96} />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files[0];
              e.target.value = ''; // picking the same file again fires again
              if (file) upload(file);
            }}
          />
          <div className="row-actions">
            <Pill icon={ImagePlus} onClick={() => fileRef.current?.click()} disabled={busy}>사진 변경</Pill>
            {user.avatarUrl && <Pill icon={RotateCcw} onClick={resetAvatar} disabled={busy}>기본 프로필로</Pill>}
          </div>
        </div>
        <form className="form" onSubmit={save}>
          <label>
            <span>사용자명</span>
            <input value={form.displayName} maxLength={30} required onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </label>
          <label>
            <span>
              소개 <span className="muted tiny">{form.bio.length}/150</span>
            </span>
            <textarea value={form.bio} maxLength={150} rows={3} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="자신을 소개해 보세요" />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <Pill type="submit" variant="primary" className="block" disabled={busy || !form.displayName.trim()}>저장</Pill>
        </form>
      </div>
    </>
  );
}

function FormCard({ title, children, onSubmit, submitLabel = '저장' }) {
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card label={title}>
      <h3 className="small-title">{title}</h3>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setMsg(null);
          try {
            await onSubmit();
            setMsg({ ok: true, text: '저장했습니다' });
          } catch (err) {
            setMsg({ ok: false, text: err.message });
          } finally {
            setBusy(false);
          }
        }}
      >
        {children}
        {msg && (
          <p className={msg.ok ? 'small ok' : 'error'} role={msg.ok ? 'status' : 'alert'}>
            {msg.text}
          </p>
        )}
        <Pill type="submit" className="block" disabled={busy}>{submitLabel}</Pill>
      </form>
    </Card>
  );
}

export function AccountSettingsScreen() {
  const { user, setUser } = useApp();
  const [username, setUsername] = useState(user.username || '');
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [rec, setRec] = useState({ email: user.recoveryEmail || '', phone: user.recoveryPhone || '' });

  return (
    <>
      <ScreenHeader title="계정 설정" />
      <div className="screen-body">
        {user.providers?.length > 0 && (
          <p className="muted small">연결된 소셜 계정: {user.providers.map((p) => PROVIDER_LABEL[p] || p).join(', ')}</p>
        )}
        <FormCard
          title="아이디"
          onSubmit={async () => setUser((await api('/me/username', { method: 'PUT', body: { username: username.trim() } })).user)}
        >
          <label>
            <span>아이디 (영문 소문자·숫자·_ 4~20자)</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoComplete="username" />
          </label>
        </FormCard>
        <FormCard
          title={user.hasPassword ? '비밀번호 변경' : '비밀번호 설정'}
          onSubmit={async () => {
            if (pw.next !== pw.confirm) throw new Error('새 비밀번호가 서로 다릅니다');
            setUser((await api('/me/password', { method: 'PUT', body: { current: pw.current, next: pw.next } })).user);
            setPw({ current: '', next: '', confirm: '' });
          }}
        >
          {!user.username && <p className="muted small">비밀번호로 로그인하려면 먼저 아이디를 정하세요.</p>}
          {user.hasPassword && (
            <label>
              <span>현재 비밀번호</span>
              <input type="password" value={pw.current} autoComplete="current-password" onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </label>
          )}
          <label>
            <span>새 비밀번호 (8자 이상)</span>
            <input type="password" value={pw.next} autoComplete="new-password" onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </label>
          <label>
            <span>새 비밀번호 확인</span>
            <input type="password" value={pw.confirm} autoComplete="new-password" onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </label>
        </FormCard>
        <FormCard
          title="복구 정보"
          onSubmit={async () => setUser((await api('/me/recovery', { method: 'PUT', body: rec })).user)}
        >
          <label>
            <span>복구 이메일</span>
            <input type="email" value={rec.email} onChange={(e) => setRec({ ...rec, email: e.target.value })} placeholder="name@example.com" />
          </label>
          <label>
            <span>휴대폰 번호</span>
            <input type="tel" value={rec.phone} onChange={(e) => setRec({ ...rec, phone: e.target.value })} placeholder="010-1234-5678" />
          </label>
          <p className="muted tiny">복구 정보는 계정을 찾을 때 사용합니다. 인증 메일·문자 발송은 아직 지원하지 않습니다.</p>
        </FormCard>
      </div>
    </>
  );
}

export function DeleteAccountScreen() {
  const { user, deleteAccount } = useApp();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!user) return <><ScreenHeader title="계정 탈퇴" /><Empty>로그아웃되었습니다</Empty></>;
  const ready = user.hasPassword ? value.length > 0 : value === '탈퇴';
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(user.hasPassword ? { password: value } : { confirm: value });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <>
      <ScreenHeader title="계정 탈퇴" />
      <div className="screen-body">
        <Card className="danger-card">
          <h3>정말 탈퇴하시겠어요?</h3>
          <p className="small">탈퇴하면 아래 정보가 모두 삭제되고 되돌릴 수 없습니다.</p>
          <ul className="usage-list small">
            <li>운동일지, 루틴, 몸무게·식단 기록</li>
            <li>팔로우·팔로워 관계와 알림</li>
            <li>프로필 사진과 연결된 소셜 계정</li>
          </ul>
        </Card>
        <form className="form" onSubmit={submit}>
          <label>
            <span>{user.hasPassword ? '비밀번호를 입력하세요' : "확인을 위해 '탈퇴'를 입력하세요"}</span>
            <input type={user.hasPassword ? 'password' : 'text'} value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <Pill type="submit" variant="danger" className="block" disabled={!ready || busy}>계정 탈퇴</Pill>
        </form>
      </div>
    </>
  );
}
