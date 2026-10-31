// Monochrome line glyphs for exercises (48x48 grid, drawn with currentColor).
const Bar = ({ y, x1 = 6, x2 = 42 }) => (
  <>
    <line x1={x1} y1={y} x2={x2} y2={y} />
    <rect x={x1 + 1} y={y - 5} width="3" height="10" rx="1" />
    <rect x={x2 - 4} y={y - 5} width="3" height="10" rx="1" />
  </>
);

const GLYPHS = {
  bench: (
    <>
      <Bar y={13} />
      <circle cx="11" cy="30" r="3" />
      <line x1="15" y1="31" x2="35" y2="31" />
      <line x1="20" y1="31" x2="20" y2="14" />
      <line x1="28" y1="31" x2="28" y2="14" />
      <line x1="8" y1="35" x2="40" y2="35" />
      <line x1="12" y1="35" x2="12" y2="42" />
      <line x1="36" y1="35" x2="36" y2="42" />
    </>
  ),
  incline: (
    <>
      <Bar y={10} />
      <circle cx="13" cy="24" r="3" />
      <line x1="16" y1="27" x2="32" y2="34" />
      <line x1="19" y1="28" x2="19" y2="11" />
      <line x1="27" y1="31" x2="27" y2="11" />
      <line x1="10" y1="30" x2="36" y2="40" />
      <line x1="34" y1="39" x2="34" y2="44" />
    </>
  ),
  squat: (
    <>
      <Bar y={14} />
      <circle cx="24" cy="8" r="3" />
      <line x1="24" y1="14" x2="22" y2="28" />
      <polyline points="22,28 31,32 27,42" />
      <line x1="24" y1="42" x2="31" y2="42" />
    </>
  ),
  deadlift: (
    <>
      <Bar y={38} />
      <circle cx="17" cy="11" r="3" />
      <line x1="19" y1="15" x2="31" y2="24" />
      <line x1="31" y1="24" x2="30" y2="42" />
      <line x1="21" y1="17" x2="22" y2="38" />
    </>
  ),
  press: (
    <>
      <Bar y={7} />
      <circle cx="24" cy="17" r="3" />
      <polyline points="17,7 19,21 29,21 31,7" />
      <line x1="24" y1="21" x2="24" y2="33" />
      <polyline points="19,43 24,33 29,43" />
    </>
  ),
  row: (
    <>
      <Bar y={33} />
      <circle cx="14" cy="13" r="3" />
      <line x1="17" y1="16" x2="32" y2="22" />
      <polyline points="32,22 34,32 31,42" />
      <polyline points="21,18 25,26 23,33" />
    </>
  ),
  pullup: (
    <>
      <line x1="6" y1="6" x2="42" y2="6" />
      <polyline points="17,6 20,18 28,18 31,6" />
      <circle cx="24" cy="13" r="3" />
      <line x1="24" y1="18" x2="24" y2="32" />
      <polyline points="21,43 24,32 27,43" />
    </>
  ),
  pulldown: (
    <>
      <line x1="24" y1="3" x2="24" y2="9" />
      <line x1="12" y1="9" x2="36" y2="9" />
      <polyline points="15,9 19,22 29,22 33,9" />
      <circle cx="24" cy="18" r="3" />
      <line x1="24" y1="22" x2="24" y2="34" />
      <line x1="14" y1="36" x2="34" y2="36" />
      <polyline points="24,34 32,34 32,44" />
    </>
  ),
  curl: (
    <>
      <line x1="15" y1="33" x2="33" y2="15" />
      <line x1="9" y1="31" x2="17" y2="39" />
      <line x1="12" y1="28" x2="20" y2="36" />
      <line x1="31" y1="9" x2="39" y2="17" />
      <line x1="28" y1="12" x2="36" y2="20" />
    </>
  ),
  legpress: (
    <>
      <line x1="30" y1="6" x2="44" y2="20" />
      <line x1="6" y1="42" x2="42" y2="42" />
      <line x1="8" y1="30" x2="20" y2="38" />
      <circle cx="9" cy="25" r="3" />
      <polyline points="20,38 26,24 36,15" />
    </>
  ),
  dips: (
    <>
      <line x1="6" y1="22" x2="16" y2="22" />
      <line x1="32" y1="22" x2="42" y2="22" />
      <line x1="10" y1="22" x2="10" y2="44" />
      <line x1="38" y1="22" x2="38" y2="44" />
      <circle cx="24" cy="8" r="3" />
      <polyline points="16,22 19,13 29,13 32,22" />
      <line x1="24" y1="12" x2="24" y2="28" />
      <polyline points="24,28 22,36 28,40" />
    </>
  ),
  generic: (
    <>
      <line x1="12" y1="24" x2="36" y2="24" />
      <rect x="6" y="16" width="6" height="16" rx="2" />
      <rect x="36" y="16" width="6" height="16" rx="2" />
    </>
  ),
};

export default function ExerciseIcon({ icon, size = 40, title }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className="exercise-icon"
    >
      {GLYPHS[icon] || GLYPHS.generic}
    </svg>
  );
}
