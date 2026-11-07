// 승급 화면: tier emblem with the exercise icon in the middle, confetti, and a 확인 button.
import { useEffect, useRef } from 'react';
import TierEmblem from './TierEmblem.jsx';
import { Pill } from './ui.jsx';
import { describeRank, formatLiftValue, getTierLift, topPercentText } from '../shared/tiers.js';

const COLORS = ['#86efac', '#ffffff', '#f5d061', '#6c9cff', '#ef5350', '#b46be0'];

function Confetti({ color }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !canvas.getContext) return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    const W = () => canvas.width;
    const H = () => canvas.height;
    const palette = [color, ...COLORS];
    const pieces = [];
    const burst = (count, originX) => {
      for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        const speed = (8 + Math.random() * 10) * dpr;
        pieces.push({
          x: originX * W(),
          y: H() * 0.42,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          w: (5 + Math.random() * 6) * dpr,
          h: (8 + Math.random() * 8) * dpr,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.35,
          color: palette[Math.floor(Math.random() * palette.length)],
          life: 0,
        });
      }
    };
    burst(reduce ? 40 : 140, 0.5);
    const timers = reduce ? [] : [setTimeout(() => burst(70, 0.2), 350), setTimeout(() => burst(70, 0.8), 650)];
    let raf;
    const start = performance.now();
    const tick = (now) => {
      ctx.clearRect(0, 0, W(), H());
      for (const p of pieces) {
        p.vy += 0.32 * dpr;
        p.vx *= 0.99;
        p.vy *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life += 1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - p.life / 260);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot)));
        ctx.restore();
      }
      if (now - start < 4500) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W(), H());
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', resize);
    };
  }, [color]);
  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}

export default function PromotionModal({ promotion, onClose }) {
  const lift = getTierLift(promotion.lift);
  const to = describeRank(promotion.toRank);
  const from = promotion.fromRank === null || promotion.fromRank === undefined ? null : describeRank(promotion.fromRank);
  return (
    <div className="promo-backdrop" role="dialog" aria-modal="true" aria-labelledby="promo-title">
      <Confetti color={to.tier.color} />
      <div className="promo-body">
        <p className="promo-kicker">{from ? '승급!' : '티어 배치 완료'}</p>
        <TierEmblem tierId={to.tier.id} icon={lift?.icon} size={176} label={`${to.label} 엠블럼`} />
        <h2 id="promo-title" className="promo-tier" style={{ color: to.tier.color }}>
          {to.label}
        </h2>
        <p className="promo-lift">
          {lift?.name} · {formatLiftValue(promotion.lift, promotion.value)}
        </p>
        <p className="muted small">
          {topPercentText(promotion.percentile)}
          {from && ` · ${from.label} → ${to.label}`}
        </p>
      </div>
      <div className="promo-actions">
        <Pill autoFocus variant="primary" className="block" onClick={onClose}>
          확인
        </Pill>
      </div>
    </div>
  );
}
