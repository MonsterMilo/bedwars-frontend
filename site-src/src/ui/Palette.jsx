// The jump menu: Ctrl K (Cmd K on a Mac) or the header button opens it on
// every page. Type to find a page, one of your players or a cosmetic, or look
// anyone up by name. Arrow keys move, Enter opens, Esc closes.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { Avatar } from './common.jsx';
import { signal, useSignal } from '../lib/signal.js';
import { SECTIONS } from '../lib/site.js';
import { recent, favourites, playerUrl } from '../lib/players.js';
import { tracked, loadTracked, matchTracked } from '../lib/tracked.js';

export const paletteOpen = signal(false);
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

let installed = false;
export function installPaletteKey() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      paletteOpen.value = !paletteOpen.value;
    }
  });
}

let cosmetics = null;
const loadCosmetics = () => cosmetics || (cosmetics = fetch('app/cosmetic-index.json').then(r => (r.ok ? r.json() : [])).catch(() => []));
const PAGES = SECTIONS.flatMap(s => s.pages.flatMap(p => [p, ...(p.also ? [p.also] : [])]).map(p => ({ ...p, hue: s.hue, locked: !!s.locked, group: s.title })));
const NAME = /^[A-Za-z0-9_]{1,16}$/;

// Starts-with beats contains; nothing matched -> -1.
function score(text, q) {
  const t = text.toLowerCase();
  if (t.startsWith(q)) return 2;
  if (t.split(/[\s_-]+/).some(w => w.startsWith(q))) return 1.5;
  return t.includes(q) ? 1 : -1;
}

export function Palette({ unlocked = false }) {
  const open = useSignal(paletteOpen);
  const rec = useSignal(recent);
  const favs = useSignal(favourites);
  const trk = useSignal(tracked);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [cos, setCos] = useState([]);
  const input = useRef(null), list = useRef(null), back = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQ(''); setActive(0);
    back.current = document.activeElement;
    loadCosmetics().then(setCos);
    loadTracked();
    requestAnimationFrame(() => input.current && input.current.focus());
    return () => { if (back.current && back.current.focus) back.current.focus(); };
  }, [open]);

  if (!open) return null;
  const close = () => { paletteOpen.value = false; };
  const query = q.trim().toLowerCase();

  const players = [...favs.map(p => ({ ...p, fav: true })), ...rec.filter(r => !favs.some(f => f.name === r.name))];
  const groups = [];
  if (query && NAME.test(q.trim())) groups.push({ title: 'Look up', items: [{ key: 'look', href: playerUrl(q.trim()), label: `Look up ${q.trim()}`, sub: 'Player lookup', icon: 'search' }] });
  const pages = PAGES.map(p => ({ p, s: query ? Math.max(score(p.label, query), p.desc.toLowerCase().split(/[\s,.]+/).some(w => w.startsWith(query)) ? 0.5 : -1) : 0 })).filter(x => x.s >= 0).sort((a, b) => b.s - a.s);
  if (pages.length) groups.push({ title: 'Pages', items: pages.map(({ p }) => ({ key: p.href, href: p.href, label: p.label, sub: p.desc, icon: p.icon || 'chevron', hue: p.hue, locked: p.locked && !unlocked })) });
  const people = players.map(p => ({ p, s: query ? score(p.name, query) : 0 })).filter(x => x.s >= 0).sort((a, b) => b.s - a.s).slice(0, query ? 6 : 5);
  if (people.length) groups.push({ title: 'Players', items: people.map(({ p }) => ({ key: `p:${p.name}`, href: playerUrl(p.name), label: p.name, sub: p.fav ? 'Favourite' : 'Recent', avatar: p.uuid || p.name })) });
  // With a key: tracked players open in the Tracker.
  const tr = matchTracked(trk, query, 5);
  if (tr.length) groups.push({ title: 'Tracked', items: tr.map(p => ({ key: `t:${p.name}`, href: `tracker.html?player=${encodeURIComponent(p.name)}#sweats`, label: p.name, sub: 'Open in Tracker', avatar: p.uuid || p.name })) });
  if (query.length >= 2) {
    const found = cos.map(c => ({ c, s: score(c[0], query) })).filter(x => x.s >= 0).sort((a, b) => b.s - a.s).slice(0, 6);
    if (found.length) groups.push({ title: 'Cosmetics', items: found.map(({ c }) => ({ key: `c:${c[1]}`, href: `cosmetics.html#${c[1]}`, label: c[0], sub: c[2], thumb: c[3] ? c[1] : null, icon: 'sparkle' })) });
  }
  // With nothing typed, your players come first.
  if (!query) groups.sort((a, b) => (a.title === 'Players' ? -1 : b.title === 'Players' ? 1 : 0));
  const flat = groups.flatMap(g => g.items);
  const cur = Math.min(active, Math.max(0, flat.length - 1));

  function go(item) { if (item) { close(); location.href = item.href; } }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = flat.length; if (!n) return;
      const next = (cur + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      setActive(next);
      requestAnimationFrame(() => { const el = list.current && list.current.querySelector(`[data-i="${next}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); });
    }
    if (e.key === 'Enter') { e.preventDefault(); go(flat[cur]); }
  }

  let i = -1;
  return (
    <div class="pal-scrim" onPointerDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div class="pal" role="dialog" aria-modal="true" aria-label="Jump to" onKeyDown={onKey}>
        <div class="pal-search">
          <Icon name="search" />
          <input ref={input} value={q} onInput={e => { setQ(e.currentTarget.value); setActive(0); }} placeholder="Jump to a page, player or cosmetic"
            aria-label="Jump to" aria-controls="pal-list" aria-activedescendant={flat.length ? `pal-${cur}` : undefined} autocomplete="off" spellcheck={false} maxLength={40} />
          <kbd>Esc</kbd>
        </div>
        <div class="pal-list" id="pal-list" role="listbox" ref={list}>
          {groups.map(g => (
            <div key={g.title} class="pal-group" role="group" aria-label={g.title}>
              <p class="pal-title">{g.title}</p>
              {g.items.map(it => {
                i++;
                const idx = i;
                return (
                  <a key={it.key} id={`pal-${idx}`} data-i={idx} href={it.href} role="option" aria-selected={idx === cur ? 'true' : 'false'}
                    class={`pal-item ${idx === cur ? 'on' : ''}`} onPointerMove={() => { if (idx !== cur) setActive(idx); }} onClick={e => { e.preventDefault(); go(it); }}>
                    <span class="pal-ico" style={it.hue ? { '--hue': it.hue } : undefined}>
                      {it.avatar ? <Avatar id={it.avatar} size={22} /> : it.thumb ? <img src={`cosmetics/thumbs/${it.thumb}.webp`} alt="" width="26" height="26" loading="lazy" /> : <Icon name={it.icon} />}
                    </span>
                    <span class="pal-text"><strong>{it.label}</strong>{it.sub && <small>{it.sub}</small>}</span>
                    {it.locked && <Icon name="lock" class="pal-lock" label="Needs a key" />}
                    <Icon name="chevron" class="pal-go" />
                  </a>
                );
              })}
            </div>
          ))}
          {!flat.length && <p class="pal-none">Nothing found. Type a player's exact name to look them up.</p>}
        </div>
        <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>{isMac ? '⌘' : 'Ctrl'}</kbd><kbd>K</kbd> toggle</span></div>
      </div>
    </div>
  );
}

// The header button that opens it.
export function PaletteButton({ class: cls = 'btn icon ghost', iconClass }) {
  return (
    <button type="button" class={`${cls} pal-btn`} onClick={() => { paletteOpen.value = true; }} aria-label={`Jump to (${isMac ? 'Cmd' : 'Ctrl'} K)`} title={`Jump to (${isMac ? '⌘' : 'Ctrl'} K)`}>
      <Icon name="command" class={iconClass} />
    </button>
  );
}
