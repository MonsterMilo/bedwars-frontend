// A tiny observable value, plus a Preact hook to read it in components.
import { useEffect, useState } from 'preact/hooks';

export function signal(initial) {
  const subs = new Set();
  let value = initial;
  return {
    get value() { return value; },
    set value(v) { if (v === value) return; value = v; subs.forEach(fn => fn(v)); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  };
}
export function useSignal(s) {
  const [, force] = useState(0);
  useEffect(() => s.subscribe(() => force(n => n + 1)), [s]);
  return s.value;
}
