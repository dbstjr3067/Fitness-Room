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
  lunge: (
    <>
      <Bar y={14} x1={10} x2={38} />
      <circle cx="24" cy="8" r="3" />
      <line x1="24" y1="14" x2="24" y2="27" />
      <polyline points="24,27 34,29 34,41 37,41" />
      <polyline points="24,27 18,38 9,40" />
    </>
  ),
  hipthrust: (
    <>
      <circle cx="21" cy="16" r="5" />
      <circle cx="8" cy="23" r="3" />
      <polyline points="12,26 21,22 33,24 37,40" />
      <line x1="6" y1="30" x2="16" y2="30" />
      <line x1="11" y1="30" x2="11" y2="42" />
      <line x1="4" y1="42" x2="44" y2="42" />
    </>
  ),
  extension: (
    <>
      <circle cx="14" cy="9" r="3" />
      <polyline points="14,13 15,28 29,28 41,21" />
      <circle cx="42" cy="17" r="2.5" />
      <polyline points="8,10 9,32 31,32" />
      <line x1="20" y1="32" x2="20" y2="43" />
      <line x1="13" y1="43" x2="27" y2="43" />
    </>
  ),
  legcurl: (
    <>
      <circle cx="8" cy="24" r="3" />
      <polyline points="12,26 33,26 27,13" />
      <circle cx="25" cy="10" r="2.5" />
      <line x1="6" y1="30" x2="36" y2="30" />
      <line x1="12" y1="30" x2="12" y2="42" />
      <line x1="30" y1="30" x2="30" y2="42" />
    </>
  ),
  calf: (
    <>
      <Bar y={14} x1={12} x2={36} />
      <circle cx="24" cy="8" r="3" />
      <line x1="24" y1="14" x2="24" y2="35" />
      <polyline points="24,35 26,38 31,38" />
      <polyline points="20,40 34,40 34,44" />
      <line x1="10" y1="22" x2="10" y2="34" />
      <polyline points="6,26 10,22 14,26" />
    </>
  ),
  raise: (
    <>
      <circle cx="24" cy="9" r="3" />
      <line x1="10" y1="16" x2="38" y2="16" />
      <line x1="24" y1="13" x2="24" y2="31" />
      <polyline points="19,43 24,31 29,43" />
      <line x1="7" y1="12" x2="7" y2="20" />
      <line x1="41" y1="12" x2="41" y2="20" />
    </>
  ),
  fly: (
    <>
      <circle cx="24" cy="26" r="3" />
      <polyline points="16,31 32,31" />
      <polyline points="16,31 11,26 8,18" />
      <polyline points="32,31 37,26 40,18" />
      <line x1="4" y1="18" x2="12" y2="18" />
      <line x1="36" y1="18" x2="44" y2="18" />
      <line x1="14" y1="36" x2="34" y2="36" />
      <line x1="24" y1="36" x2="24" y2="43" />
    </>
  ),
  cablerow: (
    <>
      <circle cx="11" cy="10" r="3" />
      <line x1="11" y1="14" x2="12" y2="33" />
      <polyline points="11,18 14,26 22,24" />
      <line x1="22" y1="21" x2="22" y2="27" />
      <line x1="22" y1="24" x2="42" y2="24" />
      <polyline points="12,33 24,29 34,35" />
      <line x1="36" y1="30" x2="36" y2="40" />
      <line x1="42" y1="6" x2="42" y2="43" />
      <line x1="4" y1="37" x2="18" y2="37" />
    </>
  ),
  pushdown: (
    <>
      <line x1="8" y1="5" x2="8" y2="44" />
      <line x1="8" y1="6" x2="18" y2="6" />
      <line x1="18" y1="6" x2="18" y2="30" />
      <line x1="14" y1="30" x2="21" y2="30" />
      <circle cx="29" cy="9" r="3" />
      <line x1="29" y1="13" x2="29" y2="29" />
      <polyline points="29,16 27,25 20,30" />
      <polyline points="26,43 29,29 32,43" />
    </>
  ),
  facepull: (
    <>
      <line x1="6" y1="5" x2="6" y2="44" />
      <line x1="6" y1="14" x2="23" y2="14" />
      <circle cx="32" cy="10" r="3" />
      <line x1="32" y1="14" x2="32" y2="31" />
      <polyline points="32,17 39,17 25,14" />
      <line x1="24" y1="11" x2="24" y2="17" />
      <polyline points="29,43 32,31 35,43" />
    </>
  ),
  shrug: (
    <>
      <circle cx="24" cy="9" r="3" />
      <polyline points="16,19 20,14 28,14 32,19" />
      <line x1="24" y1="13" x2="24" y2="34" />
      <line x1="16" y1="19" x2="16" y2="31" />
      <line x1="32" y1="19" x2="32" y2="31" />
      <Bar y={31} />
      <polyline points="20,43 24,34 28,43" />
      <polyline points="9,13 12,9 15,13" />
      <polyline points="33,13 36,9 39,13" />
    </>
  ),
  plank: (
    <>
      <circle cx="9" cy="22" r="3" />
      <line x1="13" y1="25" x2="42" y2="36" />
      <polyline points="15,26 15,36 7,36" />
      <line x1="4" y1="40" x2="44" y2="40" />
    </>
  ),
  pushup: (
    <>
      <circle cx="9" cy="15" r="3" />
      <line x1="13" y1="18" x2="42" y2="36" />
      <line x1="16" y1="20" x2="16" y2="36" />
      <line x1="4" y1="40" x2="44" y2="40" />
    </>
  ),
  hammer: (
    <>
      <line x1="11" y1="42" x2="26" y2="24" />
      <line x1="29" y1="11" x2="29" y2="35" />
      <line x1="23" y1="8" x2="35" y2="8" />
      <line x1="23" y1="12" x2="35" y2="12" />
      <line x1="23" y1="34" x2="35" y2="34" />
      <line x1="23" y1="38" x2="35" y2="38" />
    </>
  ),
  generic: (
    <>
      <line x1="12" y1="24" x2="36" y2="24" />
      <rect x="6" y="16" width="6" height="16" rx="2" />
      <rect x="36" y="16" width="6" height="16" rx="2" />
    </>
  ),
  // Category glyphs for exercises without their own drawing.
  barbell: (
    <>
      <line x1="4" y1="24" x2="44" y2="24" />
      <rect x="8" y="14" width="4" height="20" rx="1.5" />
      <rect x="13" y="17" width="3" height="14" rx="1" />
      <rect x="36" y="14" width="4" height="20" rx="1.5" />
      <rect x="32" y="17" width="3" height="14" rx="1" />
    </>
  ),
  machine: (
    <>
      <rect x="8" y="6" width="32" height="36" rx="3" />
      <line x1="18" y1="6" x2="18" y2="42" />
      <rect x="22" y="12" width="14" height="4" rx="1" />
      <rect x="22" y="19" width="14" height="4" rx="1" />
      <rect x="22" y="26" width="14" height="4" rx="1" />
      <line x1="13" y1="12" x2="13" y2="30" />
      <circle cx="13" cy="34" r="2" />
    </>
  ),
  bodyweight: (
    <>
      <circle cx="24" cy="9" r="3.5" />
      <polyline points="12,8 18,17 30,17 36,8" />
      <line x1="24" y1="17" x2="24" y2="30" />
      <polyline points="17,43 24,30 31,43" />
    </>
  ),
  // ---- cardio ----
  run: (
    <>
      <circle cx="29" cy="8" r="3.5" />
      <line x1="27" y1="14" x2="22" y2="26" />
      <polyline points="15,19 23,15 31,21" />
      <polyline points="22,26 30,31 28,41" />
      <polyline points="22,26 17,34 9,34" />
    </>
  ),
  walk: (
    <>
      <circle cx="24" cy="8" r="3.5" />
      <line x1="24" y1="14" x2="24" y2="27" />
      <polyline points="18,23 24,16 30,22" />
      <polyline points="24,27 19,41" />
      <polyline points="24,27 29,41" />
    </>
  ),
  hike: (
    <>
      <circle cx="22" cy="8" r="3.5" />
      <line x1="22" y1="14" x2="21" y2="27" />
      <rect x="13" y="15" width="6" height="10" rx="2" />
      <polyline points="22,17 30,22" />
      <line x1="31" y1="18" x2="34" y2="43" />
      <polyline points="21,27 16,41" />
      <polyline points="21,27 27,34 26,41" />
    </>
  ),
  treadmill: (
    <>
      <circle cx="21" cy="8" r="3" />
      <line x1="20" y1="12" x2="17" y2="23" />
      <polyline points="12,17 18,14 24,18" />
      <polyline points="17,23 24,28 22,34" />
      <polyline points="17,23 13,30 8,30" />
      <rect x="5" y="36" width="34" height="5" rx="2.5" />
      <polyline points="39,38 37,16 30,16" />
    </>
  ),
  bike: (
    <>
      <circle cx="11" cy="32" r="7" />
      <circle cx="37" cy="32" r="7" />
      <polyline points="11,32 19,20 31,20 37,32" />
      <polyline points="19,20 24,32 31,20" />
      <line x1="16" y1="15" x2="22" y2="15" />
      <line x1="19" y1="15" x2="19" y2="20" />
      <polyline points="31,20 32,13 36,13" />
    </>
  ),
  spinbike: (
    <>
      <circle cx="33" cy="31" r="7" />
      <line x1="8" y1="42" x2="40" y2="42" />
      <polyline points="14,42 19,24 33,31" />
      <line x1="16" y1="18" x2="23" y2="18" />
      <line x1="19" y1="18" x2="20" y2="25" />
      <polyline points="27,27 31,13 37,13" />
    </>
  ),
  elliptical: (
    <>
      <ellipse cx="22" cy="35" rx="11" ry="5" />
      <line x1="6" y1="42" x2="42" y2="42" />
      <line x1="16" y1="31" x2="26" y2="10" />
      <line x1="28" y1="31" x2="34" y2="12" />
      <rect x="33" y="22" width="8" height="6" rx="1.5" />
      <line x1="37" y1="28" x2="37" y2="42" />
    </>
  ),
  rower: (
    <>
      <line x1="5" y1="40" x2="43" y2="40" />
      <circle cx="39" cy="31" r="5" />
      <circle cx="17" cy="15" r="3.5" />
      <line x1="18" y1="20" x2="21" y2="31" />
      <polyline points="19,24 27,27 33,27" />
      <polyline points="21,31 29,24 34,32" />
      <rect x="15" y="32" width="9" height="3" rx="1.5" />
    </>
  ),
  stairs: (
    <>
      <polyline points="6,42 6,34 16,34 16,26 26,26 26,18 36,18 36,10 42,10" />
      <line x1="6" y1="42" x2="42" y2="42" />
      <line x1="42" y1="10" x2="42" y2="42" />
    </>
  ),
  swim: (
    <>
      <circle cx="35" cy="17" r="3.5" />
      <polyline points="9,22 19,15 29,22" />
      <line x1="13" y1="26" x2="31" y2="24" />
      <path d="M5 34 q4.5 -4 9 0 t9 0 t9 0 t9 0" />
      <path d="M5 41 q4.5 -4 9 0 t9 0 t9 0 t9 0" />
    </>
  ),
  rope: (
    <>
      <circle cx="24" cy="8" r="3.5" />
      <line x1="24" y1="14" x2="24" y2="28" />
      <polyline points="16,25 24,18 32,25" />
      <polyline points="20,40 24,28 28,40" />
      <path d="M16 25 C6 27 8 46 24 46 C40 46 42 27 32 25" />
    </>
  ),
  ropes: (
    <>
      <path d="M6 16 q5 -6 10 0 t10 0 t10 0 t6 -2" />
      <path d="M6 28 q5 -6 10 0 t10 0 t10 0 t6 -2" />
      <line x1="6" y1="10" x2="6" y2="42" />
      <line x1="3" y1="42" x2="9" y2="42" />
    </>
  ),
  glove: (
    <>
      <path d="M15 24 C14 13 33 10 36 20 C38 28 35 33 30 33 L19 33 C16 33 15 31 15 28 Z" />
      <path d="M15 25 C10 25 10 31 16 31" />
      <rect x="18" y="33" width="13" height="8" rx="2" />
    </>
  ),
  pulse: (
    <>
      <path d="M24 41 C10 31 5 23 9 15 C13 8 21 9 24 15 C27 9 35 8 39 15 C43 23 38 31 24 41 Z" />
      <polyline points="9,25 17,25 20,19 25,31 28,24 39,24" />
    </>
  ),
  kettlebell: (
    <>
      <path d="M18 18 C16 10 32 10 30 18" />
      <path d="M14 30 C14 21 34 21 34 30 C34 38 29 41 24 41 C19 41 14 38 14 30 Z" />
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
