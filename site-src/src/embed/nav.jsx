// The site header for the hand-written pages (Recordings, Atlas, Cosmetics).
// build.mjs bundles this on its own as app/nav.js, a stable name those pages
// can load. It renders into a shadow root so it looks the same as on the
// rebuilt pages without touching their styles.
import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { Logo } from '../ui/logo.jsx';
import { Icon } from '../ui/icons.jsx';
import { ItemIcon } from '../ui/items.jsx';
import { SECTIONS, currentPage } from '../lib/site.js';
import hostCss from './nav-host.css';
import shellCss from '../styles/shell.css';
import { startIntro } from '../lib/intro.js';
import { Palette, PaletteButton, installPaletteKey } from '../ui/Palette.jsx';
import { installFx } from '../lib/fx.js';
import fxCss from '../styles/fx.css';

const hasKey = () => { try { return !!localStorage.getItem('bedwarsAdminKey'); } catch { return false; } };

function Group({ section, page, unlocked }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (!e.composedPath().includes(ref.current)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const active = page && page.section === section.id;
  return (
    <div class={`nav-group ${active ? 'active' : ''}`} ref={ref}>
      <button type="button" class="nav-btn" aria-expanded={open ? 'true' : 'false'} aria-haspopup="true" onClick={() => setOpen(!open)}>
        {section.title}{section.locked && !unlocked && <Icon name="lock" class="nav-lock" label="Needs a key" />}<Icon name="down" class="nav-caret" />
      </button>
      {open && (
        <div class="nav-menu" role="menu">
          {section.pages.map(p => (
            <a key={p.href} href={p.href} role="menuitem" class={`nav-item ${page && page.href === p.href ? 'current' : ''}`} aria-current={page && page.href === p.href ? 'page' : undefined}>
              <span class="nav-ico" style={{ '--hue': section.hue }}><ItemIcon id={p.item} /></span>
              <span><strong>{p.label}</strong><small>{p.desc}</small></span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Search() {
  const go = e => {
    e.preventDefault();
    const v = e.currentTarget.elements.q.value.trim();
    if (v) location.href = `player.html?name=${encodeURIComponent(v)}`;
  };
  return (
    <form class="e-search" role="search" onSubmit={go}>
      <Icon name="search" class="icon" />
      <input name="q" type="search" placeholder="Search a player" autocomplete="off" spellcheck={false} maxLength={36} aria-label="Search a player" />
    </form>
  );
}

function Header() {
  useEffect(() => { installPaletteKey(); }, []);
  const page = currentPage();
  const unlocked = hasKey();
  const [menu, setMenu] = useState(false);
  return (
    <>
    <header class="site-head">
      <div class="wrap head-row">
        <a class="brand" href="index.html" aria-label="Prism home"><Logo /><span>Prism</span></a>
        <nav class="nav" aria-label="Main">
          {SECTIONS.map(s => <Group key={s.id} section={s} page={page} unlocked={unlocked} />)}
        </nav>
        <div class="head-tools">
          <Search />
          <PaletteButton class="btn icon-btn" iconClass="icon" />
          <a class="btn icon-btn" href="index.html" aria-label="Home" title="Home"><Icon name="home" class="icon" /></a>
          <button type="button" class="btn icon-btn menu-btn" onClick={() => setMenu(!menu)} aria-expanded={menu ? 'true' : 'false'} aria-label="Menu"><Icon name={menu ? 'close' : 'menu'} class="icon" /></button>
        </div>
      </div>
      {menu && (
        <nav class="mobile-nav wrap" aria-label="Main">
          {SECTIONS.map(s => (
            <div key={s.id} class="mobile-group">
              <h2>{s.title}{s.locked && !unlocked && <Icon name="lock" class="nav-lock" label="Needs a key" />}</h2>
              {s.pages.map(p => <a key={p.href} href={p.href} aria-current={page && page.href === p.href ? 'page' : undefined}><span class="nav-ico small" style={{ '--hue': s.hue }}><ItemIcon id={p.item} /></span>{p.label}</a>)}
            </div>
          ))}
        </nav>
      )}
    </header>
    <Palette unlocked={unlocked} />
    </>
  );
}

function mountNav() {
  if (document.querySelector('prism-nav')) return;
  const host = document.createElement('prism-nav');
  document.body.prepend(host);
  const root = host.attachShadow({ mode: 'open' });
  const css = `${hostCss}\n${shellCss}`;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    root.adoptedStyleSheets = [sheet];
  } catch {
    const st = document.createElement('style');
    st.textContent = css;
    root.appendChild(st);
  }
  render(<Header />, root);
}

// Sounds and click effects like the rest of the site; their look goes in the page itself.
function startFx() {
  const st = document.createElement('style');
  st.textContent = fxCss;
  document.head.appendChild(st);
  installFx();
}
if (document.body) { mountNav(); startIntro(); startFx(); } else document.addEventListener('DOMContentLoaded', () => { mountNav(); startIntro(); startFx(); });
