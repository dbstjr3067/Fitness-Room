import { describe, expect, test } from 'vitest';
import { PALETTE, bodyData } from './BodyMap.jsx';

const colorOf = (data, slug) => data.find((d) => d.slug === slug)?.color;

describe('body map colors', () => {
  test('primary red, secondary muted red, everything else neutral', () => {
    const c = PALETTE.dark;
    const data = bodyData(['glutes', 'hamstrings'], ['quads', 'lats'], c);
    expect(colorOf(data, 'gluteal')).toBe(c.primary);
    expect(colorOf(data, 'hamstring')).toBe(c.primary);
    expect(colorOf(data, 'quadriceps')).toBe(c.secondary);
    expect(colorOf(data, 'upper-back')).toBe(c.secondary);
    expect(colorOf(data, 'chest')).toBe(c.base);
    expect(colorOf(data, 'head')).toBe(c.skin);
  });

  test('primary wins when two muscles share one drawn part', () => {
    const c = PALETTE.light;
    expect(colorOf(bodyData(['side_delts'], ['front_delts'], c), 'deltoids')).toBe(c.primary);
  });
});
