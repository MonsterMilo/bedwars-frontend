// The installable app: the service worker, the Install button's state, and
// whether we're running from the home screen.
import { signal } from './signal.js';

export const standalone = typeof window !== 'undefined'
  && (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
const iosSafari = typeof navigator !== 'undefined' && /iP(hone|ad|od)/.test(navigator.userAgent)
  && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);

// 'prompt' (the browser can install it), 'ios' (explain Add to Home
// Screen), or '' (nothing to offer).
export const installable = signal(!standalone && iosSafari ? 'ios' : '');
let deferred = null;

export function setupApp() {
  if (typeof window === 'undefined') return;
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}));
  }
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; installable.value = 'prompt'; });
  addEventListener('appinstalled', () => { deferred = null; installable.value = ''; });
  if (standalone) document.documentElement.classList.add('app-standalone');
}

// Resolves true once installed, false if dismissed, 'ios' when the person
// has to do it from the Share menu.
export async function install() {
  if (!deferred) return installable.value === 'ios' ? 'ios' : false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice.catch(() => ({}));
  deferred = null;
  installable.value = ''; // the browser offers it again later if it wants to
  return outcome === 'accepted';
}
