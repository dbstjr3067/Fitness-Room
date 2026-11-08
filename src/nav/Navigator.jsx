import { createContext, useContext, useMemo, useReducer } from 'react';
import { initialNavState, navReducer } from './navState.js';

const NavStateContext = createContext(null);
const TabContext = createContext(null);

export function NavProvider({ children, initialTab }) {
  const [state, dispatch] = useReducer(navReducer, initialTab, initialNavState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <NavStateContext.Provider value={value}>{children}</NavStateContext.Provider>;
}

export function useNavState() {
  return useContext(NavStateContext);
}

// Navigation helpers for the screen's own tab.
export function useNav() {
  const { dispatch } = useContext(NavStateContext);
  const tab = useContext(TabContext);
  return useMemo(
    () => ({
      tab,
      push: (screen, params) => dispatch({ type: 'push', tab, screen, params }),
      back: () => dispatch({ type: 'back', tab }),
      selectTab: (t) => dispatch({ type: 'selectTab', tab: t }),
      openSettings: () => dispatch({ type: 'openSettings' }),
      closeSettings: () => dispatch({ type: 'closeSettings' }),
    }),
    [dispatch, tab],
  );
}

/**
 * Renders every screen in a tab's stack and shows only the top one, so each
 * screen keeps its own scroll position while you go deeper and come back.
 */
export function TabStack({ tab, screens, hidden }) {
  const { state } = useNavState();
  const stack = state.stacks[tab];
  const resetKey = state.resets[tab];
  return (
    <TabContext.Provider value={tab}>
      <div className="tab-panel" hidden={hidden} data-tab={tab}>
        {stack.map((entry, i) => {
          const Screen = screens[entry.screen] || screens.home;
          const top = i === stack.length - 1;
          return (
            <div
              key={i === 0 ? `root-${resetKey}` : `${i}-${entry.screen}`}
              className="screen"
              hidden={!top}
              data-screen={entry.screen}
            >
              <Screen {...entry.params} />
            </div>
          );
        })}
      </div>
    </TabContext.Provider>
  );
}

export function ScreenContext({ tab, children }) {
  return <TabContext.Provider value={tab}>{children}</TabContext.Provider>;
}
