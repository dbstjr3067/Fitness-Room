import { describe, expect, test } from 'vitest';
import { initialNavState, navReducer } from './navState.js';

const run = (actions, state = initialNavState()) => actions.reduce(navReducer, state);
const screens = (state, tab) => state.stacks[tab].map((s) => s.screen);

describe('tab navigation', () => {
  test('push and back within a tab', () => {
    const s = run([
      { type: 'push', screen: 'progress' },
      { type: 'push', screen: 'exercise', params: { id: 'squat' } },
      { type: 'back' },
    ]);
    expect(screens(s, 'status')).toEqual(['home', 'progress']);
  });

  test('back on the first screen does nothing', () => {
    const s0 = initialNavState();
    expect(navReducer(s0, { type: 'back' })).toBe(s0);
  });

  test('switching tabs keeps each stack', () => {
    const s = run([
      { type: 'push', screen: 'progress' },
      { type: 'push', screen: 'exercise' },
      { type: 'selectTab', tab: 'account' },
      { type: 'selectTab', tab: 'status' },
    ]);
    expect(s.active).toBe('status');
    expect(screens(s, 'status')).toEqual(['home', 'progress', 'exercise']);
  });

  test('tapping the open tab again returns to its first screen', () => {
    const s = run([
      { type: 'push', screen: 'progress' },
      { type: 'push', screen: 'exercise' },
      { type: 'selectTab', tab: 'status' },
    ]);
    expect(screens(s, 'status')).toEqual(['home']);
    expect(s.resets.status).toBe(1);
  });

  test('settings overlay: tapping the current tab only closes it', () => {
    const s = run([
      { type: 'push', screen: 'progress' },
      { type: 'openSettings' },
      { type: 'selectTab', tab: 'status' },
    ]);
    expect(s.settingsOpen).toBe(false);
    expect(screens(s, 'status')).toEqual(['home', 'progress']);
  });

  test('settings overlay: tapping another tab closes it and switches', () => {
    const s = run([{ type: 'openSettings' }, { type: 'selectTab', tab: 'search' }]);
    expect(s.settingsOpen).toBe(false);
    expect(s.active).toBe('search');
  });
});
