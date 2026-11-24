// Starts a page: applies settings before the first paint, then renders.
import { render } from 'preact';
import { apply } from './prefs.js';

export function mount(App) {
  apply();
  render(App, document.getElementById('app'));
}
