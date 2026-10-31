// Per-tab screen stacks. Pure reducer so the behaviour is easy to test.
export const TAB_IDS = ['status', 'search', 'add', 'notifications', 'account'];

export function initialNavState(active = 'status') {
  const stacks = {};
  const resets = {};
  for (const id of TAB_IDS) {
    stacks[id] = [{ screen: 'home', params: {} }];
    resets[id] = 0;
  }
  return { active, stacks, resets, settingsOpen: false };
}

export function navReducer(state, action) {
  switch (action.type) {
    case 'selectTab': {
      const { tab } = action;
      if (state.settingsOpen) {
        // Closing settings from the bar: tapping the current tab just closes it.
        if (tab === state.active) return { ...state, settingsOpen: false };
        return { ...state, settingsOpen: false, active: tab };
      }
      if (tab === state.active) {
        // Tapping the open tab again returns it to its first screen.
        return {
          ...state,
          stacks: { ...state.stacks, [tab]: [state.stacks[tab][0]] },
          resets: { ...state.resets, [tab]: state.resets[tab] + 1 },
        };
      }
      // Switching tabs keeps each tab's stack as it was.
      return { ...state, active: tab };
    }
    case 'push': {
      const tab = action.tab || state.active;
      return {
        ...state,
        stacks: {
          ...state.stacks,
          [tab]: [...state.stacks[tab], { screen: action.screen, params: action.params || {} }],
        },
      };
    }
    case 'back': {
      const tab = action.tab || state.active;
      if (state.stacks[tab].length <= 1) return state;
      return { ...state, stacks: { ...state.stacks, [tab]: state.stacks[tab].slice(0, -1) } };
    }
    case 'openSettings':
      return { ...state, settingsOpen: true };
    case 'closeSettings':
      return { ...state, settingsOpen: false };
    default:
      return state;
  }
}
