import { useId } from 'react';

const W = 320;
const H = 180;
const PAD = { top: 16, right: 16, bottom: 26, left: 40 };

function shortDate(d) {
  return `${Number(d.slice(5, 7))}.${Number(d.slice(8))}`;
}

/** Simple SVG line chart. points: [{ date, value }] sorted by date. */
export default function LineChart({ points, from, to, format = (v) => v, label }) {
  const gradId = useId();
  if (!points.length) return <p className="empty">이 기간에 기록이 없습니다</p>;

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min -= span * 0.1;
  max += span * 0.1;

  const t0 = new Date(from).getTime();
  const t1 = Math.max(new Date(to).getTime(), t0 + 1);
  const x = (d) => PAD.left + ((new Date(d).getTime() - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (v) => PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom);

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.at(-1).date).toFixed(1)},${H - PAD.bottom} L${x(points[0].date).toFixed(1)},${H - PAD.bottom} Z`;
  const ticks = [max - span * 0.1, (max + min) / 2, min + span * 0.1];
  const last = points.at(-1);

  return (
    <svg className="line-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((v) => (
        <g key={v}>
          <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
          <text className="axis" x={PAD.left - 6} y={y(v) + 4} textAnchor="end">
            {format(Math.round(v * 10) / 10)}
          </text>
        </g>
      ))}
      <text className="axis" x={PAD.left} y={H - 6} textAnchor="start">
        {shortDate(from)}
      </text>
      <text className="axis" x={W - PAD.right} y={H - 6} textAnchor="end">
        {shortDate(to)}
      </text>
      <path d={area} fill={`url(#${gradId})`} stroke="none" />
      <path d={line} className="line" fill="none" />
      {points.length <= 40 &&
        points.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r="2.5" className="dot" />)}
      <circle cx={x(last.date)} cy={y(last.value)} r="4.5" className="dot-last" />
    </svg>
  );
}
