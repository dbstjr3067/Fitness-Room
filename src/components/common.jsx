import { useEffect, useId, useRef } from 'react';
import {
  CalendarDays,
  Crown,
  Droplets,
  Dumbbell,
  Flame,
  Layers,
  Puzzle,
  Scale,
  Search,
  TrendingUp,
  Trophy,
  UserRound,
  Utensils,
  X,
} from 'lucide-react';
import { IconButton } from './ui.jsx';

export function Avatar({ user, size = 44 }) {
  return (
    <span className="avatar" style={{ width: size, height: size }} aria-hidden="true">
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" />
      ) : (
        <UserRound size={size * 0.56} strokeWidth={1.6} />
      )}
    </span>
  );
}

const EXT_ICONS = { CalendarDays, Crown, Droplets, Dumbbell, Flame, Layers, Scale, TrendingUp, Utensils };

// Square tile with the extension's icon, tinted with its own color when it has one.
export function ExtensionIcon({ ext, size = 44 }) {
  const Icon = EXT_ICONS[ext.icon] || Puzzle;
  return (
    <span
      className={`ext-icon ${ext.color ? 'has-color' : ''}`}
      style={{ width: size, height: size, ...(ext.color ? { '--ext-color': ext.color } : {}) }}
      aria-hidden="true"
    >
      <Icon size={size * 0.5} strokeWidth={1.8} />
    </span>
  );
}

export function SearchBox({ value, onChange, placeholder, label, onFocus, readOnly, autoFocus }) {
  return (
    <label className="search-box">
      <Search size={18} aria-hidden="true" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label || placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={onFocus}
        readOnly={readOnly}
        autoFocus={autoFocus}
      />
    </label>
  );
}

export function Switch({ on, onChange, label, color }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`switch ${on ? 'is-on' : ''}`}
      style={color ? { '--ext-color': color } : undefined}
      onClick={() => onChange(!on)}
    >
      <span />
    </button>
  );
}

// Bottom sheet dialog
export function Sheet({ open, onClose, title, children }) {
  const titleId = useId();
  const ref = useRef(null);
  // Keep the latest onClose without re-running the effect: callers pass a new function on every
  // render, and re-running it used to pull focus out of the search box after each keystroke.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <IconButton icon={X} label="닫기" onClick={onClose} />
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Toast({ toast }) {
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.key}>
          <Trophy size={18} aria-hidden="true" />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

export function timeAgo(sqlDate, now = Date.now()) {
  const t = new Date(`${sqlDate.replace(' ', 'T')}Z`).getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
  return new Date(t).toLocaleDateString('ko-KR');
}
