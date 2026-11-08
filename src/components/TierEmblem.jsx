// Tier emblem: an original crest in the tier's color with the exercise icon inside.
// Higher tiers get wings, a gem and finally a crown. (Not Riot's artwork — our own design.)
import { useId } from 'react';
import ExerciseIcon from './ExerciseIcon.jsx';
import { TIERS } from '../shared/tiers.js';

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v + (amount > 0 ? (255 - v) * amount : v * amount))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export default function TierEmblem({ tierId, icon, size = 120, label }) {
  const gid = useId();
  const index = Math.max(0, TIERS.findIndex((t) => t.id === tierId));
  const tier = TIERS[index] || TIERS[0];
  const c = tier.color;
  const wings = index >= 3;
  const gem = index >= 6;
  const crown = tier.id === 'challenger';
  return (
    <div className="tier-emblem" style={{ width: size, height: size, '--tier': c }} role={label ? 'img' : undefined} aria-label={label}>
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id={`${gid}-g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={shade(c, 0.45)} />
            <stop offset="55%" stopColor={c} />
            <stop offset="100%" stopColor={shade(c, -0.45)} />
          </linearGradient>
        </defs>
        {wings && (
          <g fill={shade(c, -0.2)} stroke={shade(c, 0.4)} strokeWidth="1.5">
            <path d="M22 40 L4 34 L10 52 L2 60 L14 66 L10 80 L26 76 Z" />
            <path d="M98 40 L116 34 L110 52 L118 60 L106 66 L110 80 L94 76 Z" />
          </g>
        )}
        {crown && (
          <path d="M38 22 L44 4 L54 16 L60 0 L66 16 L76 4 L82 22 Z" fill={shade(c, 0.2)} stroke={shade(c, -0.4)} strokeWidth="1.5" />
        )}
        <path
          d="M60 10 L98 24 L98 60 C98 86 82 104 60 114 C38 104 22 86 22 60 L22 24 Z"
          fill={`url(#${gid}-g)`}
          stroke={shade(c, 0.55)}
          strokeWidth="2.5"
        />
        <path d="M60 18 L90 29 L90 60 C90 81 77 96 60 105 C43 96 30 81 30 60 L30 29 Z" fill="none" stroke={shade(c, -0.35)} strokeWidth="1.5" opacity="0.7" />
        {gem && <path d="M60 12 L66 20 L60 28 L54 20 Z" fill="#fff" opacity="0.9" />}
        <circle cx="60" cy="62" r="25" fill="#0d0d0d" stroke={shade(c, 0.5)} strokeWidth="2" />
      </svg>
      {icon && (
        <span className="tier-emblem-icon" style={{ color: shade(c, 0.35) }}>
          <ExerciseIcon icon={icon} size={size * 0.3} />
        </span>
      )}
    </div>
  );
}
