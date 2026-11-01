import { ChevronLeft } from 'lucide-react';
import { useNav } from '../nav/Navigator.jsx';

export function IconButton({ icon: Icon, label, onClick, size = 22, className = '', ...rest }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} onClick={onClick} {...rest}>
      <Icon size={size} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}

// Rounded-rectangle widget
export function Card({ children, onClick, className = '', label, ...rest }) {
  if (onClick) {
    return (
      <button type="button" className={`card card-button ${className}`} onClick={onClick} aria-label={label} {...rest}>
        {children}
      </button>
    );
  }
  return (
    <section className={`card ${className}`} aria-label={label} {...rest}>
      {children}
    </section>
  );
}

// Horizontal capsule button
export function Pill({ children, active, onClick, icon: Icon, variant = 'default', className = '', ...rest }) {
  return (
    <button
      type="button"
      className={`pill pill-${variant} ${active ? 'is-active' : ''} ${className}`}
      aria-pressed={active === undefined ? undefined : active}
      onClick={onClick}
      {...rest}
    >
      {Icon && <Icon size={18} strokeWidth={1.8} aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

export function PillGroup({ options, value, onChange, label }) {
  return (
    <div className="pill-group" role="group" aria-label={label}>
      {options.map((o) => (
        <Pill key={String(o.id)} active={value === o.id} onClick={() => onChange(o.id)} variant="small">
          {o.label}
        </Pill>
      ))}
    </div>
  );
}

// Sub-screen header with a back button in the top-left
export function ScreenHeader({ title, onBack }) {
  const nav = useNav();
  return (
    <div className="screen-header">
      <IconButton icon={ChevronLeft} label="뒤로가기" onClick={onBack || nav.back} size={26} />
      <h2>{title}</h2>
    </div>
  );
}

export function SectionTitle({ children, aside }) {
  return (
    <div className="section-title">
      <h3>{children}</h3>
      {aside}
    </div>
  );
}

// Circle whose border fills clockwise from 12 o'clock
export function Ring({ value, size = 92, stroke = 8, label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const empty = value === null || value === undefined;
  const pct = empty ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={label || (empty ? '기록 없음' : `${pct}%`)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="ring-fill"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="ring-value" style={{ fontSize: Math.round(size * (pct === 100 ? 0.18 : 0.21)) }}>
        {empty ? '–' : `${pct}%`}
      </span>
    </div>
  );
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}

// Change label like "+5kg (10%)": green when up, red when down (grey when neutral).
export function Delta({ diff, pct, unit = 'kg', format, neutral = false }) {
  const dir = neutral ? 'flat' : diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : '±';
  const value = format ? format(Math.abs(diff)) : `${Math.abs(diff)}${unit}`;
  return (
    <span className={`delta delta-${dir}`}>
      {sign}
      {value} ({Math.abs(pct)}%)
    </span>
  );
}
