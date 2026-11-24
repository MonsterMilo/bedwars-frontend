import { signal } from './signal.js';
export const toasts = signal([]);
let id = 0;
export function toast(text, ms = 3200) {
  const t = { id: ++id, text };
  toasts.value = [...toasts.value, t];
  setTimeout(() => { toasts.value = toasts.value.filter(x => x.id !== t.id); }, ms);
}
