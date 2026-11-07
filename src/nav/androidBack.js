// Android hardware back button (mobile app only): close what is open, then go back within the tab.
import { App as NativeApp } from '@capacitor/app';

export function listenBackButton(getState, dispatch) {
  return NativeApp.addListener('backButton', () => {
    // The tier promotion screen covers everything: back acts as its 확인 button.
    const promo = document.querySelector('.promo-backdrop');
    if (promo) {
      const ok = promo.querySelector('.promo-actions button') || [...promo.querySelectorAll('button')].pop();
      if (ok) ok.click();
      else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      return;
    }
    if (document.querySelector('.sheet')) {
      // Sheets close on Escape.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      return;
    }
    const s = getState();
    if (s.settingsOpen) return dispatch({ type: 'closeSettings' });
    if (s.stacks[s.active].length > 1) return dispatch({ type: 'back' });
    if (s.active !== 'status') return dispatch({ type: 'selectTab', tab: 'status' });
    NativeApp.minimizeApp();
  });
}
