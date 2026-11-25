// Small shared pieces: tabs, stat tiles, avatars, load/error states.
import { Icon } from './icons.jsx';
import { ItemIcon } from './items.jsx';

// Tabs as a segmented control. options: [[value, label, disabled?]]
export function Tabs({ label, value, options, onChange, class: cls = '' }) {
  function onKey(e) {
    const live = options.filter(o => !o[2]);
    const i = live.findIndex(o => o[0] === value);
    let next = null;
    if (e.key === 'ArrowRight') next = live[(i + 1) % live.length];
    if (e.key === 'ArrowLeft') next = live[(i - 1 + live.length) % live.length];
    if (e.key === 'Home') next = live[0];
    if (e.key === 'End') next = live[live.length - 1];
    if (next) {
      e.preventDefault();
      onChange(next[0]);
      requestAnimationFrame(() => e.currentTarget && e.currentTarget.querySelector('[aria-selected="true"]')?.focus());
    }
  }
  return (
    <div class={`seg ${cls}`} role="tablist" aria-label={label} onKeyDown={onKey}>
      {options.map(([v, text, disabled]) => (
        <button type="button" role="tab" key={v} aria-selected={v === value ? 'true' : 'false'} tabIndex={v === value ? 0 : -1}
          disabled={disabled} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

// icon: an item icon id; color: a CSS colour for the value.
export function Stat({ label, value, sub, tone, big = false, icon, color }) {
  return (
    <div class={`stat ${big ? 'big' : ''} ${tone ? `tone-${tone}` : ''} ${icon ? 'has-icon' : ''}`}>
      {icon && <span class="stat-icon"><ItemIcon id={icon} /></span>}
      <span class="stat-label">{label}</span>
      <span class="stat-value mono" style={color ? { color } : undefined}>{value}</span>
      {sub !== undefined && <span class="stat-sub">{sub}</span>}
    </div>
  );
}

export function Avatar({ id, size = 32, class: cls = '' }) {
  return <img class={`avatar ${cls}`} src={`https://mc-heads.net/avatar/${encodeURIComponent(id || 'MHF_Steve')}/${size * 2}`} alt="" width={size} height={size} loading="lazy" decoding="async" />;
}

export function Loading({ lines = 3, label = 'Loading' }) {
  return (
    <div class="loading" role="status" aria-label={label}>
      {Array.from({ length: lines }, (_, i) => <div key={i} class="skel skel-line" style={{ width: `${92 - i * 14}%` }} />)}
    </div>
  );
}

export function ErrorBox({ error, onRetry, what = 'this' }) {
  if (!error) return null;
  const msg = error.rateLimited ? 'Too many lookups. Wait a minute and try again.' : error.message || `Couldn't load ${what}.`;
  return (
    <div class="notice bad" role="alert">
      <Icon name="alert" />
      <span class="grow">{msg}</span>
      {onRetry && <button type="button" class="btn small" onClick={onRetry}><Icon name="refresh" />Retry</button>}
    </div>
  );
}

export function Empty({ children, icon = 'info' }) {
  return <div class="empty"><Icon name={icon} /><p>{children}</p></div>;
}

// How many lookups answered, without naming them. Works with the older
// { name: state } map too.
export function reachOf(res) {
  if (!res) return null;
  if (res.reach) return res.reach;
  if (!res.sources) return null;
  const r = { ok: 0, busy: 0, failed: 0 };
  for (const v of Object.values(res.sources)) { const s = String(v); if (s === 'off') continue; if (s === 'busy') r.busy++; else if (/^failed/.test(s)) r.failed++; else r.ok++; }
  return r;
}
export function ReachNote({ res }) {
  const r = reachOf(res);
  if (!r || !(r.failed + r.busy)) return null;
  return <p class="source-note"><span class="src src-failed"><span class="dot" />{r.ok ? 'Some lookups didn\'t answer, so this may be missing a few.' : 'Lookups didn\'t answer. Try again shortly.'}</span></p>;
}

export function copyText(text, toast) {
  const done = () => toast && toast('Copied');
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => {});
}

// A page's glyph on a lit gem tile, at the right of its head (decoration only).
export function HeadEmblem({ id }) {
  return (
    <div class="head-emblem" aria-hidden="true">
      <span class="he-ring" /><span class="he-gem"><ItemIcon id={id} /></span>
    </div>
  );
}
