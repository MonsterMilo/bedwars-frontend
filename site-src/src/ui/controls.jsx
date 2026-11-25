// The site's own form controls, so nothing falls back to the browser's grey
// boxes: dropdown, number box, date and time picker, checkbox, switch and
// slider. Each one works with the keyboard and screen readers like the
// native control it replaces.
import { useState, useRef, useEffect, useLayoutEffect } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { prefs } from '../lib/prefs.js';

let uid = 0;
function useUid(prefix) {
  const r = useRef(null);
  if (!r.current) r.current = `${prefix}-${++uid}`;
  return r.current;
}

// Closes a popover when you press outside it.
function useOutside(open, close, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const down = e => { if (ref.current && !ref.current.contains(e.target)) close(); };
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, [open]);
}

// Opens upward when there isn't room below, and lines up with the right edge
// when it would run off the screen.
function usePlacement(open, wrap, pop) {
  const [place, setPlace] = useState('');
  useLayoutEffect(() => {
    if (!open || !wrap.current || !pop.current) return;
    const r = wrap.current.getBoundingClientRect();
    const h = pop.current.offsetHeight, w = pop.current.offsetWidth;
    const up = r.bottom + h + 12 > innerHeight && r.top - h - 12 > 0;
    const right = r.left + w > innerWidth - 8;
    setPlace(`${up ? 'up' : ''} ${right ? 'right' : ''}`);
  }, [open]);
  return place;
}

const norm = o => (Array.isArray(o) ? { value: o[0], label: o[1], hint: o[2] } : o);

// options: [[value, label, hint?]] or [{ value, label, hint?, icon? }]
export function Select({ value, onChange, options, label, id, placeholder = 'Choose', class: cls = '', small = false, disabled = false }) {
  const opts = options.map(norm);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrap = useRef(null), btn = useRef(null), list = useRef(null), typed = useRef({ s: '', t: 0 });
  const lid = useUid('lb');
  const cur = opts.find(o => o.value === value);
  useOutside(open, () => setOpen(false), wrap);
  const place = usePlacement(open, wrap, list);
  useEffect(() => {
    if (!open || !list.current) return;
    const el = list.current.children[hi];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [hi, open]);

  function show() { setHi(Math.max(0, opts.findIndex(o => o.value === value))); setOpen(true); }
  function pick(o) { setOpen(false); if (o.value !== value) onChange(o.value); if (btn.current) btn.current.focus(); }
  function onKey(e) {
    const k = e.key;
    if (!open) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') { e.preventDefault(); show(); }
      return;
    }
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    else if (k === 'ArrowDown') { e.preventDefault(); setHi(i => Math.min(opts.length - 1, i + 1)); }
    else if (k === 'ArrowUp') { e.preventDefault(); setHi(i => Math.max(0, i - 1)); }
    else if (k === 'Home' || k === 'PageUp') { e.preventDefault(); setHi(0); }
    else if (k === 'End' || k === 'PageDown') { e.preventDefault(); setHi(opts.length - 1); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); if (opts[hi]) pick(opts[hi]); }
    else if (k === 'Tab') setOpen(false);
    else if (k.length === 1) {
      const now = Date.now();
      typed.current.s = (now - typed.current.t < 700 ? typed.current.s : '') + k.toLowerCase();
      typed.current.t = now;
      const i = opts.findIndex(o => String(o.label).toLowerCase().startsWith(typed.current.s));
      if (i >= 0) setHi(i);
    }
  }
  return (
    <div class={`cselect ${open ? 'open' : ''} ${small ? 'small' : ''} ${cls}`} ref={wrap}>
      <button type="button" id={id} ref={btn} class="cselect-btn" disabled={disabled} aria-haspopup="listbox" aria-expanded={open ? 'true' : 'false'}
        aria-controls={open ? lid : undefined} aria-label={label ? `${label}: ${cur ? cur.label : placeholder}` : undefined}
        aria-activedescendant={open ? `${lid}-${hi}` : undefined} onClick={() => (open ? setOpen(false) : show())} onKeyDown={onKey}>
        {cur && cur.icon}
        <span class="cselect-value">{cur ? cur.label : <span class="faint">{placeholder}</span>}</span>
        <Icon name="down" class="cselect-caret" />
      </button>
      {open && (
        <ul class={`pop cselect-list ${place}`} id={lid} role="listbox" ref={list} aria-label={label} tabIndex={-1}>
          {opts.map((o, i) => (
            <li key={String(o.value)} id={`${lid}-${i}`} role="option" aria-selected={o.value === value ? 'true' : 'false'} class={i === hi ? 'hi' : ''}
              onPointerMove={() => i !== hi && setHi(i)} onPointerDown={e => e.preventDefault()} onClick={() => pick(o)}>
              {o.icon}
              <span class="grow"><span class="opt-label">{o.label}</span>{o.hint && <small>{o.hint}</small>}</span>
              {o.value === value && <Icon name="check" class="cselect-check" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// A whole-number (or decimal) box with − and + buttons. value is a string,
// '' when empty, like a text input's.
export function NumberField({ value, onChange, min = 0, max = 1e7, step = 1, placeholder, id, label, decimals = false, invalid }) {
  const n = value === '' || value == null ? null : Number(value);
  const clamp = v => Math.max(min, Math.min(max, v));
  function bump(d) {
    const base = n === null || Number.isNaN(n) ? (d > 0 ? min - step : min + step) : n;
    onChange(String(clamp(Math.round((base + d * step) * 1000) / 1000)));
  }
  return (
    <div class={`cnum ${invalid ? 'bad' : ''}`}>
      <input id={id} class="input cnum-input" type="text" inputMode={decimals ? 'decimal' : 'numeric'} value={value ?? ''} placeholder={placeholder}
        aria-label={label} autocomplete="off" spellcheck={false} aria-invalid={invalid ? 'true' : undefined}
        onInput={e => {
          let v = e.currentTarget.value.replace(decimals ? /[^\d.]/g : /\D/g, '');
          if (decimals) v = v.replace(/(\..*)\./g, '$1');
          if (v !== e.currentTarget.value) e.currentTarget.value = v;
          onChange(v);
        }}
        onKeyDown={e => {
          if (e.key === 'ArrowUp') { e.preventDefault(); bump(1); }
          if (e.key === 'ArrowDown') { e.preventDefault(); bump(-1); }
        }} />
      <span class="cnum-steps">
        <button type="button" tabIndex={-1} aria-label={`Less${label ? ` ${label}` : ''}`} disabled={n !== null && n <= min} onClick={() => bump(-1)}><Icon name="minus" /></button>
        <button type="button" tabIndex={-1} aria-label={`More${label ? ` ${label}` : ''}`} disabled={n !== null && n >= max} onClick={() => bump(1)}><Icon name="plus" /></button>
      </span>
    </div>
  );
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const pad = n => String(n).padStart(2, '0');

function showValue(ms, withTime) {
  const d = new Date(ms);
  const day = `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
  if (!withTime) return day;
  const h12 = prefs.value.hour12 !== false;
  const h = d.getHours();
  const t = h12 ? `${((h + 11) % 12) + 1}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}` : `${pad(h)}:${pad(d.getMinutes())}`;
  return `${day} · ${t}`;
}

// A small up/down spinner for the time row.
function Spin({ value, onChange, min, max, label, format = pad }) {
  const wrap = v => (v > max ? min : v < min ? max : v);
  return (
    <span class="spin" role="spinbutton" tabIndex={0} aria-label={label} aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} aria-valuetext={format(value)}
      onKeyDown={e => {
        if (e.key === 'ArrowUp') { e.preventDefault(); onChange(wrap(value + 1)); }
        if (e.key === 'ArrowDown') { e.preventDefault(); onChange(wrap(value - 1)); }
        if (e.key === 'PageUp') { e.preventDefault(); onChange(wrap(value + 10)); }
        if (e.key === 'PageDown') { e.preventDefault(); onChange(wrap(value - 10)); }
      }}
      onWheel={e => { e.preventDefault(); onChange(wrap(value + (e.deltaY < 0 ? 1 : -1))); }}>
      <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => onChange(wrap(value + 1))}><Icon name="up" /></button>
      <span class="spin-val mono">{format(value)}</span>
      <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => onChange(wrap(value - 1))}><Icon name="down" /></button>
    </span>
  );
}

// Date (and time) picker. value: ms or null, in this device's time.
export function DateTimeField({ value, onChange, withTime = true, max = null, min = null, placeholder, label, id }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null), pop = useRef(null), btn = useRef(null), grid = useRef(null);
  const sel = value ? new Date(value) : null;
  const [view, setView] = useState(() => { const d = sel || new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [focusDay, setFocusDay] = useState(() => (sel || new Date()).getDate());
  useOutside(open, () => setOpen(false), wrap);
  const place = usePlacement(open, wrap, pop);
  const h12 = prefs.value.hour12 !== false;
  const today = new Date();

  useEffect(() => {
    if (!open) return;
    const d = sel || new Date();
    setView(new Date(d.getFullYear(), d.getMonth(), 1));
    setFocusDay(d.getDate());
  }, [open]);
  useEffect(() => {
    if (!open || !grid.current) return;
    const el = grid.current.querySelector('[data-focus="1"]');
    if (el && pop.current && pop.current.contains(document.activeElement)) el.focus();
  }, [focusDay, view, open]);

  const allowed = d => {
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime();
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return (max === null || start <= max) && (min === null || end >= min);
  };
  const clampMs = ms => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, ms));
  function setDay(d) {
    const base = sel || (withTime ? new Date() : new Date(0, 0, 1, 12, 0));
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), withTime ? base.getHours() : 12, withTime ? base.getMinutes() : 0);
    onChange(clampMs(next.getTime()));
    if (!withTime) { setOpen(false); if (btn.current) btn.current.focus(); }
  }
  function setTime(h, m) {
    const base = sel || new Date();
    onChange(clampMs(new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m).getTime()));
  }
  const days = [];
  const first = view.getDay();
  const inMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  for (let i = 0; i < first; i++) days.push(null);
  for (let d = 1; d <= inMonth; d++) days.push(new Date(view.getFullYear(), view.getMonth(), d));
  while (days.length % 7) days.push(null);
  const canNext = max === null || new Date(view.getFullYear(), view.getMonth() + 1, 1).getTime() <= max;
  const canPrev = min === null || new Date(view.getFullYear(), view.getMonth(), 0, 23, 59).getTime() >= min;
  const move = months => setView(v => new Date(v.getFullYear(), v.getMonth() + months, 1));

  function gridKey(e) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) {
      e.preventDefault();
      const d = new Date(view.getFullYear(), view.getMonth(), focusDay + step);
      setView(new Date(d.getFullYear(), d.getMonth(), 1));
      setFocusDay(d.getDate());
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const d = new Date(view.getFullYear(), view.getMonth(), focusDay);
      if (allowed(d)) setDay(d);
    }
  }
  const hours = sel ? sel.getHours() : today.getHours();
  const mins = sel ? sel.getMinutes() : today.getMinutes();

  return (
    <div class={`cdate ${open ? 'open' : ''}`} ref={wrap} onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); if (btn.current) btn.current.focus(); } }}>
      <button type="button" id={id} ref={btn} class="cselect-btn cdate-btn" aria-haspopup="dialog" aria-expanded={open ? 'true' : 'false'}
        aria-label={label ? `${label}: ${value ? showValue(value, withTime) : 'not set'}` : undefined} onClick={() => setOpen(!open)}>
        <Icon name={withTime ? 'clock' : 'calendar'} class="cdate-ico" />
        <span class="cselect-value">{value ? showValue(value, withTime) : <span class="faint">{placeholder || (withTime ? 'Pick a date and time' : 'Pick a date')}</span>}</span>
        <Icon name="down" class="cselect-caret" />
      </button>
      {open && (
        <div class={`pop cdate-pop ${place}`} ref={pop} role="dialog" aria-label={label || 'Pick a date'}>
          <div class="cal-head">
            <button type="button" class="btn icon ghost small" onClick={() => move(-1)} disabled={!canPrev} aria-label="Previous month"><Icon name="chevron" class="flip" /></button>
            <strong aria-live="polite">{MONTHS[view.getMonth()]} {view.getFullYear()}</strong>
            <button type="button" class="btn icon ghost small" onClick={() => move(1)} disabled={!canNext} aria-label="Next month"><Icon name="chevron" /></button>
          </div>
          <div class="cal-grid" role="grid" ref={grid} onKeyDown={gridKey}>
            {DAYS.map(d => <span key={d} class="cal-dow" role="columnheader">{d}</span>)}
            {days.map((d, i) => {
              if (!d) return <span key={`e${i}`} />;
              const ok = allowed(d), on = sameDay(d, sel), now = sameDay(d, today), f = d.getDate() === focusDay;
              return (
                <button key={i} type="button" role="gridcell" class={`cal-day ${on ? 'on' : ''} ${now ? 'today' : ''}`} disabled={!ok}
                  tabIndex={f ? 0 : -1} data-focus={f ? '1' : undefined} aria-selected={on ? 'true' : 'false'} aria-label={`${MONTHS[d.getMonth()]} ${d.getDate()}`}
                  onClick={() => { setFocusDay(d.getDate()); setDay(d); }}>{d.getDate()}</button>
              );
            })}
          </div>
          {withTime && (
            <div class="cal-time">
              <Icon name="clock" class="faint" />
              <Spin label="Hour" value={h12 ? ((hours + 11) % 12) + 1 : hours} min={h12 ? 1 : 0} max={h12 ? 12 : 23} format={h12 ? String : pad}
                onChange={v => setTime(h12 ? (v % 12) + (hours >= 12 ? 12 : 0) : v, mins)} />
              <span class="cal-colon">:</span>
              <Spin label="Minute" value={mins} min={0} max={59} onChange={v => setTime(hours, v)} />
              {h12 && (
                <span class="seg cal-ampm" role="group" aria-label="AM or PM">
                  <button type="button" aria-pressed={hours < 12 ? 'true' : 'false'} onClick={() => hours >= 12 && setTime(hours - 12, mins)}>AM</button>
                  <button type="button" aria-pressed={hours >= 12 ? 'true' : 'false'} onClick={() => hours < 12 && setTime(hours + 12, mins)}>PM</button>
                </span>
              )}
            </div>
          )}
          <div class="cal-foot">
            <button type="button" class="btn ghost small" onClick={() => { onChange(clampMs(withTime ? Date.now() : new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime())); if (!withTime) setOpen(false); }}>{withTime ? 'Now' : 'Today'}</button>
            {value && <button type="button" class="btn ghost small" onClick={() => onChange(null)}>Clear</button>}
            <button type="button" class="btn small primary" onClick={() => { setOpen(false); if (btn.current) btn.current.focus(); }}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

// A date only, as 'YYYY-MM-DD' (what the tracker stores).
export function DateField({ value, onChange, ...rest }) {
  const ms = value ? new Date(`${value}T12:00:00`).getTime() : null;
  return <DateTimeField {...rest} withTime={false} value={Number.isFinite(ms) ? ms : null}
    onChange={v => { if (!v) return onChange(''); const d = new Date(v); onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`); }} />;
}

export function Check({ checked, onChange, disabled = false, children, class: cls = '' }) {
  return (
    <label class={`ccheck ${disabled ? 'off' : ''} ${cls}`}>
      <input type="checkbox" class="ccheck-input" checked={checked} disabled={disabled} onChange={e => onChange(e.currentTarget.checked)} />
      <span class="ccheck-box" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m3.5 8.4 2.9 2.9 6.1-6.6" /></svg></span>
      <span class="ccheck-text">{children}</span>
    </label>
  );
}

export function Switch({ checked, onChange, disabled = false, children, class: cls = '' }) {
  return (
    <label class={`cswitch ${disabled ? 'off' : ''} ${cls}`}>
      <span class="cswitch-text">{children}</span>
      <input type="checkbox" role="switch" class="ccheck-input" checked={checked} disabled={disabled} onChange={e => onChange(e.currentTarget.checked)} />
      <span class="cswitch-track" aria-hidden="true"><span class="cswitch-thumb" /></span>
    </label>
  );
}

// A slider whose filled part shows the value.
export function Range({ value, onChange, min = 0, max = 100, step = 1, disabled = false, label, id }) {
  const p = ((Number(value) - min) / (max - min)) * 100;
  return <input id={id} type="range" class="crange" min={min} max={max} step={step} value={value} disabled={disabled} aria-label={label}
    style={{ '--p': `${Math.max(0, Math.min(100, p))}%` }} onInput={e => onChange(Number(e.currentTarget.value))} />;
}
