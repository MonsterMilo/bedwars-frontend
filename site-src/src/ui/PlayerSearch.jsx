// Player search with recent and favourite players as suggestions
// (an ARIA combobox: arrows move, Enter opens, Esc closes).
import { useState, useRef, useId } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { recent, favourites, playerUrl } from '../lib/players.js';
import { useSignal } from '../lib/signal.js';

const VALID = /^[A-Za-z0-9_]{1,16}$|^[0-9a-fA-F-]{32,36}$/;

export function PlayerSearch({ big = false, autofocus = false, placeholder = 'Search a player', inputRef, onGo, value: initial = '' }) {
  const rec = useSignal(recent);
  const favs = useSignal(favourites);
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState('');
  const local = useRef(null);
  const ref = inputRef || local;
  const id = useId();

  const q = value.trim().toLowerCase();
  const seen = new Set();
  const options = [...favs.map(p => ({ ...p, fav: true })), ...rec]
    .filter(p => { const k = p.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return !q || k.includes(q); })
    .slice(0, 8);

  function go(name) {
    const n = String(name || '').trim();
    if (!VALID.test(n)) { setError('Names are 1 to 16 letters, numbers or _'); return; }
    setError('');
    setOpen(false);
    if (onGo) onGo(n);
    else location.href = playerUrl(n);
  }
  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(-1, a - 1)); }
    else if (e.key === 'Escape') { setOpen(false); setActive(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); go(active >= 0 && options[active] ? options[active].name : value); }
  }
  const showList = open && options.length > 0;
  return (
    <form class={`psearch ${big ? 'big' : ''}`} role="search" onSubmit={e => { e.preventDefault(); go(value); }}>
      <div class="psearch-box">
        <Icon name="search" class="psearch-icon" />
        <input ref={ref} class="psearch-input" type="search" value={value} placeholder={placeholder} autofocus={autofocus}
          aria-label="Player name or UUID" role="combobox" aria-expanded={showList ? 'true' : 'false'} aria-controls={`${id}-list`}
          aria-autocomplete="list" aria-activedescendant={showList && active >= 0 ? `${id}-o${active}` : undefined}
          aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${id}-err` : undefined}
          autocomplete="off" autocapitalize="off" spellcheck={false} maxLength={36}
          onInput={e => { setValue(e.currentTarget.value); setOpen(true); setActive(-1); setError(''); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} onKeyDown={onKey} />
        {big ? <button class="btn primary" type="submit">Search</button> : <kbd class="psearch-kbd" aria-hidden="true">/</kbd>}
      </div>
      {error && <p id={`${id}-err`} class="psearch-err" role="alert">{error}</p>}
      {showList && (
        <ul id={`${id}-list`} class="psearch-list" role="listbox" aria-label="Suggestions">
          {options.map((p, i) => (
            <li key={p.name} id={`${id}-o${i}`} role="option" aria-selected={i === active ? 'true' : 'false'} class={i === active ? 'on' : ''}
              onMouseDown={e => { e.preventDefault(); go(p.name); }} onMouseEnter={() => setActive(i)}>
              <img src={`https://mc-heads.net/avatar/${encodeURIComponent(p.uuid || p.name)}/32`} alt="" width="22" height="22" loading="lazy" />
              <span>{p.name}</span>
              {p.fav ? <Icon name="star" class="fav-icon" label="Favourite" /> : <span class="faint small">Recent</span>}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
