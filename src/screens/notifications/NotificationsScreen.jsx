import { useCallback, useEffect, useState } from 'react';
import { Award, CheckCheck, LogIn, Megaphone, Share2, Trophy, UserPlus } from 'lucide-react';
import { api } from '../../api.js';
import { Card, Empty, Pill } from '../../components/ui.jsx';
import { Avatar, timeAgo } from '../../components/common.jsx';
import { useNav } from '../../nav/Navigator.jsx';
import { useApp } from '../../state/AppContext.jsx';

const TYPE_ICON = { achievement: Trophy, post: Award, follow: UserPlus, promo: Megaphone };

export default function NotificationsScreen() {
  const { user, authReady, unread, refreshUnread, showToast } = useApp();
  const nav = useNav();
  const [items, setItems] = useState(null);

  const load = useCallback(() => {
    api('/notifications')
      .then((r) => setItems(r.notifications))
      .catch((e) => showToast(e.message));
  }, [showToast]);

  // Reload whenever the unread count changes (new notifications arrived).
  useEffect(() => {
    if (user) load();
    else setItems(null);
  }, [user, unread, load]);

  if (!authReady) return null;
  if (!user) {
    return (
      <div className="screen-body">
        <Card className="hero">
          <h2>알림</h2>
          <p className="muted">로그인하면 친구 소식과 목표 달성 알림을 받을 수 있습니다.</p>
          <Pill icon={LogIn} variant="primary" onClick={() => nav.selectTab('account')}>로그인하러 가기</Pill>
        </Card>
      </div>
    );
  }

  const markRead = async (n) => {
    if (n.read) return;
    setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
    refreshUnread();
  };

  const open = (n) => {
    markRead(n);
    if ((n.type === 'follow' || n.type === 'post') && n.actor) return nav.push('user', { id: n.actor.id });
    if (n.type === 'promo' && n.data.extensionId) return nav.push('extension', { id: n.data.extensionId });
    if (n.type === 'achievement') {
      if (n.data.exercise) return nav.push('exercise', { id: n.data.exercise });
      if (n.data.goal) return nav.push('bodyweight');
      return nav.push('progress');
    }
    return undefined;
  };

  const share = async (n) => {
    try {
      const r = await api(`/achievements/${n.achievementId}/share`, { method: 'POST' });
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, shared: true, read: true } : x)));
      markRead(n);
      showToast(r.followers ? `팔로워 ${r.followers}명에게 공유했어요` : '공유했어요. 아직 팔로워가 없어요');
    } catch (e) {
      showToast(e.message);
    }
  };

  const readAll = async () => {
    await api('/notifications/read-all', { method: 'POST' });
    setItems((list) => list.map((x) => ({ ...x, read: true })));
    refreshUnread();
  };

  return (
    <div className="screen-body">
      <div className="section-title">
        <h3>알림</h3>
        {items?.some((n) => !n.read) && (
          <Pill icon={CheckCheck} className="small-pill" onClick={readAll}>모두 읽음</Pill>
        )}
      </div>
      {items === null && <Empty>불러오는 중…</Empty>}
      {items?.length === 0 && <Empty>알림이 없습니다</Empty>}
      <ul className="noti-list" aria-label="알림 목록">
        {items?.map((n) => {
          const Icon = TYPE_ICON[n.type] || Megaphone;
          return (
            <li key={n.id} className={`noti ${n.read ? 'is-read' : 'is-unread'}`}>
              <button type="button" className="noti-main" onClick={() => open(n)} aria-label={`${n.read ? '' : '읽지 않음 '}${n.title}`}>
                <span className="noti-icon">
                  {n.actor ? <Avatar user={n.actor} size={40} /> : <Icon size={20} aria-hidden="true" />}
                </span>
                <span className="grow">
                  <span className="noti-title">{n.title}</span>
                  {n.body && <span className="muted small block">{n.body}</span>}
                  <span className="muted tiny block">{timeAgo(n.createdAt)}</span>
                </span>
                {!n.read && <span className="red-dot" aria-hidden="true" />}
              </button>
              {n.type === 'achievement' && n.achievementId && (
                <div className="noti-actions">
                  {n.shared ? (
                    <span className="muted tiny">공유됨</span>
                  ) : (
                    <Pill icon={Share2} className="small-pill" onClick={() => share(n)}>팔로워에게 공유</Pill>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
