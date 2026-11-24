// Load data in a component: { data, error, loading, reload }. A newer call
// cancels the older one, so a fast tab switch never shows stale data.
import { useEffect, useState, useCallback, useRef } from 'preact/hooks';

export function useAsync(fn, deps, { skip = false } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: !skip });
  const [n, setN] = useState(0);
  const live = useRef(null);
  useEffect(() => {
    if (skip) { setState({ data: null, error: null, loading: false }); return undefined; }
    const ctrl = new AbortController();
    live.current = ctrl;
    setState(s => ({ data: s.data, error: null, loading: true }));
    Promise.resolve().then(() => fn(ctrl.signal)).then(
      data => { if (!ctrl.signal.aborted) setState({ data, error: null, loading: false }); },
      error => { if (!ctrl.signal.aborted) setState({ data: null, error, loading: false }); }
    );
    return () => ctrl.abort();
  }, [...deps, n, skip]);
  const reload = useCallback(() => setN(x => x + 1), []);
  return { ...state, reload };
}

// Read and write one URL search param (replaceState, so Back isn't spammed).
export function useParam(name, fallback = '') {
  const read = () => new URLSearchParams(location.search).get(name) ?? fallback;
  const [value, setValue] = useState(read);
  useEffect(() => {
    const onPop = () => setValue(read());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const set = useCallback((v, { push = false } = {}) => {
    const q = new URLSearchParams(location.search);
    if (v === '' || v === null || v === undefined || v === fallback) q.delete(name); else q.set(name, v);
    const url = `${location.pathname}${q.toString() ? `?${q}` : ''}${location.hash}`;
    history[push ? 'pushState' : 'replaceState'](null, '', url);
    setValue(v ?? fallback);
  }, [name]);
  return [value, set];
}
