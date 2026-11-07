// 사용자 검색, 프로필 엿보기, 팔로우, 알림, 목표 달성 공유.
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import {
  activeRoutine,
  avatarUrl,
  getUser,
  loadWorkouts,
  notify,
  publicUser,
  readSettings,
} from '../data.js';
import { addDays, todayStr } from '../../src/shared/date.js';

const NOTIFICATION_LIMIT = 50;

function counts(db, id) {
  return {
    followers: db.prepare('SELECT COUNT(*) AS n FROM follows WHERE followee_id = ?').get(id).n,
    following: db.prepare('SELECT COUNT(*) AS n FROM follows WHERE follower_id = ?').get(id).n,
  };
}

function isFollowing(db, me, id) {
  return Boolean(db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?').get(me, id));
}

function isPublicUser(db, id) {
  const s = db.prepare('SELECT is_public FROM user_settings WHERE user_id = ?').get(id);
  return s ? Boolean(s.is_public) : true;
}

function visibleUser(db, viewer, id) {
  const u = getUser(db, id);
  if (!u) return null;
  if (u.is_demo && u.id !== viewer?.id) return null; // throwaway demo accounts are private
  return u;
}

export function broadcastPromo(db, { title, body = '', extensionId = null }) {
  const users = db.prepare('SELECT user_id FROM user_settings WHERE promo_opt_in = 1').all();
  for (const { user_id: uid } of users) notify(db, uid, { type: 'promo', title, body, data: extensionId ? { extensionId } : {} });
  return users.length;
}

export function socialRoutes(ctx) {
  const { db, uploadDir } = ctx;
  const r = express.Router();
  const requireUser = ctx.requireUser;

  // Avatars are public so other users' profile pictures can load.
  r.get('/users/:id/avatar', (req, res) => {
    const u = getUser(db, Number(req.params.id));
    if (!u?.avatar_path) return res.status(404).json({ error: '프로필 사진이 없습니다' });
    const dir = join(uploadDir, 'avatars');
    if (!existsSync(join(dir, u.avatar_path))) return res.status(404).json({ error: '프로필 사진이 없습니다' });
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(u.avatar_path, { root: dir, dotfiles: 'deny' });
  });

  r.get('/users/search', requireUser, (req, res) => {
    const raw = String(req.query.q || '').trim();
    if (!raw) return res.json({ users: [] });
    const byId = raw.startsWith('@');
    const q = (byId ? raw.slice(1) : raw).replace(/[%_\\]/g, (c) => `\\${c}`).toLowerCase();
    if (!q) return res.json({ users: [] });
    const like = `%${q}%`;
    const rows = db
      .prepare(
        `SELECT users.*, COALESCE(s.is_public, 1) AS is_public FROM users LEFT JOIN user_settings s ON s.user_id = users.id
         WHERE is_demo = 0 AND id != ?
           AND (lower(username) LIKE ? ESCAPE '\\' ${byId ? '' : "OR lower(display_name) LIKE ? ESCAPE '\\'"})
         ORDER BY (lower(username) = ?) DESC, (lower(display_name) = ?) DESC, id LIMIT 20`,
      )
      .all(...(byId ? [req.user.id, like, q, q] : [req.user.id, like, like, q, q]));
    res.json({
      users: rows.map((u) => ({ ...publicUser(u), ...(u.is_public ? {} : { bio: '' }), isFollowing: isFollowing(db, req.user.id, u.id) })),
    });
  });

  r.get('/users/:id', requireUser, (req, res) => {
    const u = visibleUser(db, req.user, Number(req.params.id));
    if (!u) return res.status(404).json({ error: '사용자를 찾을 수 없습니다' });
    const isSelf = u.id === req.user.id;
    const settings = readSettings(db, u.id);
    if (!isSelf && !settings.isPublic) {
      // Private profile: who it is, nothing more.
      const { id, username, displayName, avatarUrl: avatar } = publicUser(u);
      return res.json({
        user: { id, username, displayName, avatarUrl: avatar },
        isSelf: false,
        isFollowing: isFollowing(db, req.user.id, u.id),
        isPublic: false,
        routine: null,
        routineName: null,
        routineSince: null,
        workouts: null,
      });
    }
    const routine = activeRoutine(db, u.id);
    res.json({
      user: publicUser(u),
      ...counts(db, u.id),
      isSelf,
      isFollowing: isFollowing(db, req.user.id, u.id),
      isPublic: settings.isPublic,
      routine: routine ? routine.days : null,
      routineName: routine?.name || null,
      routineSince: routine?.activatedAt || null,
      workouts: loadWorkouts(db, u.id, { from: addDays(todayStr(), -400) }),
      weeklyGoal: settings.weeklyGoal,
    });
  });

  r.post('/users/:id/follow', requireUser, (req, res) => {
    const u = visibleUser(db, req.user, Number(req.params.id));
    if (!u) return res.status(404).json({ error: '사용자를 찾을 수 없습니다' });
    if (u.id === req.user.id) return res.status(400).json({ error: '자기 자신은 팔로우할 수 없습니다' });
    // Throwaway demo accounts only reach the sample users, never real people.
    if (req.user.is_demo && !u.is_sample) return res.status(403).json({ error: '체험 계정은 예시 사용자만 팔로우할 수 있습니다' });
    const { changes } = db.prepare('INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)').run(req.user.id, u.id);
    // Unfollow + follow again does not notify twice within a day.
    const recent = db
      .prepare("SELECT 1 FROM notifications WHERE user_id = ? AND actor_id = ? AND type = 'follow' AND created_at > datetime('now', '-1 day')")
      .get(u.id, req.user.id);
    if (changes && !recent) {
      notify(db, u.id, {
        type: 'follow',
        title: `${req.user.display_name}님이 회원님을 팔로우하기 시작했어요`,
        actorId: req.user.id,
      });
    }
    res.json({ isFollowing: true, ...(isPublicUser(db, u.id) ? counts(db, u.id) : {}) });
  });

  r.delete('/users/:id/follow', requireUser, (req, res) => {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(req.user.id, id);
    res.json({ isFollowing: false, ...(isPublicUser(db, id) ? counts(db, id) : {}) });
  });

  // ---- notifications ----
  r.get('/notifications', requireUser, (req, res) => {
    const rows = db
      .prepare(
        `SELECT n.*, a.shared AS ach_shared, u.id AS a_id, u.username AS a_username, u.display_name AS a_name,
                u.avatar_path AS a_avatar_path, u.avatar_url AS a_avatar_url
         FROM notifications n
         LEFT JOIN achievements a ON a.id = n.achievement_id
         LEFT JOIN users u ON u.id = n.actor_id
         WHERE n.user_id = ? ORDER BY n.id DESC LIMIT ?`,
      )
      .all(req.user.id, NOTIFICATION_LIMIT);
    res.json({
      notifications: rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        data: JSON.parse(n.data || '{}'),
        read: Boolean(n.is_read),
        createdAt: n.created_at,
        achievementId: n.achievement_id,
        shared: n.achievement_id ? Boolean(n.ach_shared) : undefined,
        actor: n.a_id
          ? {
              id: n.a_id,
              username: n.a_username,
              displayName: n.a_name,
              avatarUrl: avatarUrl({ id: n.a_id, avatar_path: n.a_avatar_path, avatar_url: n.a_avatar_url }),
            }
          : null,
      })),
    });
  });

  r.get('/notifications/unread-count', requireUser, (req, res) => {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id);
    res.json({ count: n });
  });

  r.post('/notifications/read-all', requireUser, (req, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
    res.json({ ok: true });
  });

  r.post('/notifications/:id/read', requireUser, (req, res) => {
    const { changes } = db
      .prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
      .run(Number(req.params.id), req.user.id);
    if (!changes) return res.status(404).json({ error: '알림을 찾을 수 없습니다' });
    res.json({ ok: true });
  });

  r.post('/achievements/:id/share', requireUser, (req, res) => {
    const a = db.prepare('SELECT * FROM achievements WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
    if (!a) return res.status(404).json({ error: '달성 기록을 찾을 수 없습니다' });
    if (a.shared) return res.status(409).json({ error: '이미 공유했습니다' });
    db.prepare('UPDATE achievements SET shared = 1 WHERE id = ?').run(a.id);
    // A private account shares only with people it follows back (no approval system for followers).
    const followers = isPublicUser(db, req.user.id)
      ? db.prepare('SELECT follower_id FROM follows WHERE followee_id = ?').all(req.user.id)
      : db
          .prepare(
            `SELECT f.follower_id FROM follows f
             JOIN follows back ON back.follower_id = f.followee_id AND back.followee_id = f.follower_id
             WHERE f.followee_id = ?`,
          )
          .all(req.user.id);
    for (const { follower_id: fid } of followers) {
      notify(db, fid, {
        type: 'post',
        title: `${req.user.display_name}님이 목표를 달성했어요`,
        body: a.title,
        data: JSON.parse(a.data || '{}'),
        actorId: req.user.id,
      });
    }
    res.json({ shared: true, followers: followers.length });
  });

  return r;
}
