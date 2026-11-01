// Front/back anatomical body map (react-muscle-highlighter, MIT).
// Primary muscles are a saturated red, secondary a muted red, everything else neutral grey.
import Body from 'react-muscle-highlighter';
import { useApp } from '../state/AppContext.jsx';

// Our muscle ids -> the library's body part slugs.
const SLUG = {
  chest: 'chest',
  front_delts: 'deltoids',
  side_delts: 'deltoids',
  rear_delts: 'deltoids',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearm',
  traps: 'trapezius',
  lats: 'upper-back',
  upper_back: 'upper-back',
  lower_back: 'lower-back',
  abs: 'abs',
  obliques: 'obliques',
  glutes: 'gluteal',
  quads: 'quadriceps',
  hamstrings: 'hamstring',
  adductors: 'adductors',
  calves: 'calves',
};

export const PALETTE = {
  dark: { primary: '#e5484d', secondary: '#7d3236', base: '#3a3a3a', skin: '#8a8a8a', outline: '#5a5a5a' },
  light: { primary: '#dc3e42', secondary: '#f2a7a9', base: '#cfcfcf', skin: '#a8a8a8', outline: '#bdbdbd' },
};

// The library hard-codes a dark grey for unhighlighted parts, so every part gets an explicit color.
const MUSCLE_SLUGS = [...new Set(Object.values(SLUG)), 'tibialis'];
const OTHER_SLUGS = ['head', 'hair', 'neck', 'hands', 'feet', 'knees', 'ankles'];

export function bodyData(primary, secondary, colors) {
  const parts = new Map();
  for (const slug of MUSCLE_SLUGS) parts.set(slug, colors.base);
  for (const slug of OTHER_SLUGS) parts.set(slug, colors.skin);
  for (const m of secondary) if (SLUG[m]) parts.set(SLUG[m], colors.secondary);
  for (const m of primary) if (SLUG[m]) parts.set(SLUG[m], colors.primary); // primary wins on shared parts
  return [...parts].map(([slug, color]) => ({ slug, color }));
}

export default function BodyMap({ primary = [], secondary = [] }) {
  const { settings } = useApp();
  const colors = PALETTE[settings.theme] || PALETTE.dark;
  const gender = settings.calProfile?.sex === 'female' ? 'female' : 'male';
  const data = bodyData(primary, secondary, colors);
  const view = (side, label) => (
    <figure className="body-figure">
      <div role="img" aria-label={label}>
        <Body data={data} side={side} gender={gender} defaultFill={colors.base} border={colors.outline} />
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
  return (
    <div className="body-map" style={{ '--muscle-primary': colors.primary, '--muscle-secondary': colors.secondary }}>
      {view('front', '앞')}
      {view('back', '뒤')}
    </div>
  );
}
