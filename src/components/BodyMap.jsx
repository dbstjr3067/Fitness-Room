// Front/back body outline with muscles shaded: primary = bright, secondary = grey.
const E = (cx, cy, rx, ry) => ({ t: 'e', cx, cy, rx, ry });
const R = (x, y, w, h, r = 3) => ({ t: 'r', x, y, w, h, r });
const P = (d) => ({ t: 'p', d });
const mirror = (shape) => {
  if (shape.t === 'e') return { ...shape, cx: 100 - shape.cx };
  if (shape.t === 'r') return { ...shape, x: 100 - shape.x - shape.w };
  return shape;
};
const pair = (shape) => [shape, mirror(shape)];

const FRONT = {
  side_delts: pair(E(26.5, 43, 4, 7)),
  front_delts: pair(E(33, 38, 6, 6)),
  chest: pair(R(36, 34, 13.5, 14, 5)),
  biceps: pair(E(26, 57, 4.2, 9)),
  forearms: pair(E(23.5, 78, 3.6, 10)),
  abs: [R(43.5, 50, 13, 29, 3)],
  obliques: pair(R(37.5, 52, 5, 22, 2)),
  quads: pair(E(42, 113, 6.5, 18)),
  adductors: pair(E(47.6, 106, 1.8, 9)),
  calves: pair(E(42.5, 153, 4.2, 12)),
};

const BACK = {
  traps: [P('M41 29 L59 29 L56 46 L44 46 Z')],
  side_delts: pair(E(26.5, 43, 4, 7)),
  rear_delts: pair(E(33, 39, 6, 6)),
  upper_back: [R(43, 46, 14, 11, 3)],
  lats: [P('M36 46 L42.5 48 L44 71 L38 65 Z'), P('M64 46 L57.5 48 L56 71 L62 65 Z')],
  lower_back: [R(44, 68, 12, 12, 3)],
  triceps: pair(E(26, 57, 4.2, 9)),
  forearms: pair(E(23.5, 78, 3.6, 10)),
  glutes: pair(E(44, 92, 6.5, 8)),
  hamstrings: pair(E(43, 119, 6, 15)),
  calves: pair(E(43, 153, 5, 12)),
};

function Shape({ s, className }) {
  if (s.t === 'e') return <ellipse className={className} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} />;
  if (s.t === 'r') return <rect className={className} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r} />;
  return <path className={className} d={s.d} />;
}

function Figure({ regions, primary, secondary, label }) {
  const cls = (m) => (primary.includes(m) ? 'is-primary' : secondary.includes(m) ? 'is-secondary' : '');
  return (
    <figure className="body-figure">
      <svg viewBox="0 0 100 172" role="img" aria-label={label}>
        <g className="body-base">
          <circle cx="50" cy="13" r="8.5" />
          <rect x="46" y="20" width="8" height="8" rx="2" />
          <rect x="34" y="30" width="32" height="60" rx="12" />
          <rect x="21" y="34" width="10" height="56" rx="5" />
          <rect x="69" y="34" width="10" height="56" rx="5" />
          <rect x="35" y="86" width="14" height="80" rx="6" />
          <rect x="51" y="86" width="14" height="80" rx="6" />
        </g>
        {Object.entries(regions).map(([m, shapes]) =>
          shapes.map((s, i) => <Shape key={`${m}${i}`} s={s} className={`muscle ${cls(m)}`} />),
        )}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export default function BodyMap({ primary = [], secondary = [] }) {
  return (
    <div className="body-map">
      <Figure regions={FRONT} primary={primary} secondary={secondary} label="앞" />
      <Figure regions={BACK} primary={primary} secondary={secondary} label="뒤" />
    </div>
  );
}
