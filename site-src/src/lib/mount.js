// Starts a page: applies settings before the first paint, then renders.
import { render } from 'preact';
import { apply } from './prefs.js';
import { startIntro } from './intro.js';

export function mount(App, { intro = true } = {}) {
  apply();
  if (intro) startIntro();
  render(App, document.getElementById('app'));
}
