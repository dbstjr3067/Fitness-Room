// 계정 정보: profile, avatar, username/password, recovery contacts, settings, account deletion.
import { mkdirSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { checkPassword } from './auth.js';
import { RESERVED_USERNAMES, SESSION_COOKIE, hashPassword, validateCredentials } from '../auth.js';
import { validateProfile } from '../../src/shared/caltrack.js';
import { getExtension } from '../../src/shared/extensions.js';
import {
  checkWeightAchievement,
  getUser,
  latestBodyWeight,
  readSettings,
  selfUser,
  setExtension,
} from '../data.js';

const THEMES = ['dark', 'light'];
const UNITS = ['kg', 'lbs'];
const MAX_AVATAR_BYTES = 512 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^01[016789]-?\d{3,4}-?\d{4}$/;
const TOO_MANY = '비밀번호를 너무 많이 틀렸습니다. 잠시 후 다시 시도하세요';

// Optional text field: undefined/null keeps `fallback`; anything but a string is an error (undefined result).
function optText(v, fallback) {
  if (v === undefined || v === null) return String(fallback ?? '').trim();
  return typeof v === 'string' ? v.trim() : undefined;
}

const optBool = (v) => v === undefined || typeof v === 'boolean';

/** CalTrack profile: only the known fields, numbers as numbers. */
function cleanCalProfile(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { error: '프로필이 필요합니다' };
  if (typeof p.heightCm !== 'number' || typeof p.age !== 'number') return { error: '키와 나이는 숫자로 입력하세요' };
  const err = validateProfile(p);
  if (err) return { error: err };
  return { value: { heightCm: p.heightCm, age: p.age, sex: p.sex, activity: p.activity, goal: p.goal } };
}

// Detect image type from magic bytes (never trust the Content-Type header alone).
export function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function avatarDir(ctx) {
  return join(ctx.uploadDir, 'avatars');
}

export function removeAvatarFile(ctx, user) {
  if (!user?.avatar_path) return;
  const file = join(avatarDir(ctx), basename(user.avatar_path));
  try {
    if (existsSync(file)) unlinkSync(file);
  } catch {
    // ignore
  }
}

export function accountRoutes(ctx) {
  const { db } = ctx;
  const r = express.Router();

  r.put('/profile', (req, res) => {
    const displayName = optText(req.body?.displayName, req.user.display_name);
    const bio = optText(req.body?.bio, req.user.bio);
    if (displayName === undefined || bio === undefined) return res.status(400).json({ error: '형식이 올바르지 않습니다' });
    if (!displayName || displayName.length > 30) return res.status(400).json({ error: '사용자명은 1~30자여야 합니다' });
    if (bio.length > 150) return res.status(400).json({ error: '소개는 150자 이하여야 합니다' });
    db.prepare('UPDATE users SET display_name = ?, bio = ? WHERE id = ?').run(displayName, bio, req.user.id);
    res.json({ user: selfUser(db, getUser(db, req.user.id)) });
  });

  r.post('/avatar', express.raw({ type: () => true, limit: MAX_AVATAR_BYTES }), (req, res) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const ext = sniffImage(buf);
    if (!ext) return res.status(400).json({ error: 'JPG, PNG, WEBP 이미지만 올릴 수 있습니다' });
    if (ctx.inlineAvatars) {
      const mime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext];
      db.prepare('UPDATE users SET avatar_path = NULL, avatar_url = ? WHERE id = ?').run(
        `data:${mime};base64,${buf.toString('base64')}`,
        req.user.id,
      );
      return res.json({ user: selfUser(db, getUser(db, req.user.id)) });
    }
    mkdirSync(avatarDir(ctx), { recursive: true });
    const name = `${req.user.id}-${randomBytes(6).toString('hex')}.${ext}`;
    writeFileSync(join(avatarDir(ctx), name), buf);
    removeAvatarFile(ctx, req.user);
    db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(name, req.user.id);
    res.json({ user: selfUser(db, getUser(db, req.user.id)) });
  });

  r.delete('/avatar', (req, res) => {
    removeAvatarFile(ctx, req.user);
    // Reset to the default profile image (also drops a social profile picture).
    db.prepare('UPDATE users SET avatar_path = NULL, avatar_url = NULL WHERE id = ?').run(req.user.id);
    res.json({ user: selfUser(db, getUser(db, req.user.id)) });
  });

  r.put('/username', (req, res) => {
    const username = req.body?.username;
    const err = validateCredentials({ username, password: 'placeholder-ok' });
    if (err) return res.status(400).json({ error: err });
    const taken = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if ((taken && taken.id !== req.user.id) || (RESERVED_USERNAMES.includes(username) && req.user.username !== username)) {
      return res.status(409).json({ error: '이미 사용 중인 아이디입니다' });
    }
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, req.user.id);
    res.json({ user: selfUser(db, getUser(db, req.user.id)) });
  });

  r.put('/password', (req, res) => {
    const { current, next } = req.body || {};
    if (req.user.password_hash) {
      const result = checkPassword(ctx, req, { account: `#${req.user.id}`, password: current, hash: req.user.password_hash });
      if (result === 'blocked') return res.status(429).json({ error: TOO_MANY });
      if (result !== 'ok') return res.status(401).json({ error: '현재 비밀번호가 올바르지 않습니다' });
    }
    if (!req.user.username) return res.status(400).json({ error: '먼저 아이디를 정해 주세요' });
    const err = validateCredentials({ username: req.user.username, password: next });
    if (err) return res.status(400).json({ error: err });
    // A demo account with its own id and password is a real account from now on (no longer removed on logout).
    db.prepare('UPDATE users SET password_hash = ?, is_demo = 0 WHERE id = ?').run(hashPassword(next), req.user.id);
    // Sign out other devices.
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, req.cookies[SESSION_COOKIE]);
    res.json({ user: selfUser(db, getUser(db, req.user.id)) });
  });

  r.put('/recovery', (req, res) => {
    const email = optText(req.body?.email || null, '');
    const phone = optText(req.body?.phone || null, '');
    if (email === undefined || phone === undefined) return res.status(400).json({ error: '형식이 올바르지 않습니다' });
    if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: '이메일 형식이 올바르지 않습니다' });
    if (phone && !PHONE_RE.test(phone)) return res.status(400).json({ error: '휴대폰 번호 형식이 올바르지 않습니다 (예: 010-1234-5678)' });
    db.prepare('UPDATE users SET recovery_email = ?, recovery_phone = ? WHERE id = ?').run(email || null, phone || null, req.user.id);
    res.json({ user: selfUser(db, getUser(db, req.user.id)) });
  });

  r.delete('/', (req, res) => {
    const { password, confirm } = req.body || {};
    if (req.user.password_hash) {
      const result = checkPassword(ctx, req, { account: `#${req.user.id}`, password, hash: req.user.password_hash });
      if (result === 'blocked') return res.status(429).json({ error: TOO_MANY });
      if (result !== 'ok') return res.status(401).json({ error: '비밀번호가 올바르지 않습니다' });
    } else if (confirm !== '탈퇴') {
      return res.status(400).json({ error: "확인을 위해 '탈퇴'를 입력하세요" });
    }
    removeAvatarFile(ctx, req.user);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id); // cascades to every table
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  // ---- settings ----
  r.get('/settings', (req, res) => res.json(readSettings(db, req.user.id)));

  r.put('/settings', (req, res) => {
    const cur = readSettings(db, req.user.id);
    const b = req.body || {};
    if (!optBool(b.isPublic) || !optBool(b.promoOptIn)) return res.status(400).json({ error: '설정 값이 올바르지 않습니다' });
    const next = {
      weeklyGoal: b.weeklyGoal ?? cur.weeklyGoal,
      unit: b.unit ?? cur.unit,
      theme: b.theme ?? cur.theme,
      isPublic: b.isPublic ?? cur.isPublic,
      promoOptIn: b.promoOptIn ?? cur.promoOptIn,
      goalWeight: b.goalWeight === undefined ? cur.goalWeight : b.goalWeight,
      calProfile: b.calProfile === undefined ? cur.calProfile : b.calProfile,
    };
    if (!Number.isInteger(next.weeklyGoal) || next.weeklyGoal < 1 || next.weeklyGoal > 7) {
      return res.status(400).json({ error: '주간 목표는 1~7일이어야 합니다' });
    }
    if (!UNITS.includes(next.unit)) return res.status(400).json({ error: '단위가 올바르지 않습니다' });
    if (!THEMES.includes(next.theme)) return res.status(400).json({ error: '테마가 올바르지 않습니다' });
    if (next.goalWeight !== null && !(typeof next.goalWeight === 'number' && next.goalWeight >= 20 && next.goalWeight <= 300)) {
      return res.status(400).json({ error: '목표 몸무게는 20~300kg 사이여야 합니다' });
    }
    if (b.calProfile !== undefined && b.calProfile !== null) {
      const { value, error } = cleanCalProfile(b.calProfile);
      if (error) return res.status(400).json({ error });
      next.calProfile = value;
    }
    // Weight goal direction (lose/gain) is decided from the body weight when the goal was set.
    if (next.goalWeight !== cur.goalWeight) {
      const start = next.goalWeight === null ? null : latestBodyWeight(db, req.user.id);
      db.prepare('UPDATE user_settings SET goal_weight_start = ? WHERE user_id = ?').run(start, req.user.id);
    }
    db.prepare(
      `UPDATE user_settings SET weekly_goal = ?, unit = ?, theme = ?, is_public = ?, promo_opt_in = ?, goal_weight = ?, cal_profile = ?
       WHERE user_id = ?`,
    ).run(
      next.weeklyGoal,
      next.unit,
      next.theme,
      next.isPublic ? 1 : 0,
      next.promoOptIn ? 1 : 0,
      next.goalWeight,
      next.calProfile ? JSON.stringify(next.calProfile) : null,
      req.user.id,
    );
    const achievements = b.goalWeight !== undefined ? checkWeightAchievement(db, req.user.id) : [];
    res.json({ ...readSettings(db, req.user.id), achievements });
  });

  r.put('/extensions/:id', (req, res) => {
    if (!getExtension(req.params.id)) return res.status(404).json({ error: '없는 익스텐션입니다' });
    if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'enabled는 true 또는 false여야 합니다' });
    setExtension(db, req.user.id, req.params.id, req.body.enabled);
    res.json(readSettings(db, req.user.id));
  });

  return r;
}
