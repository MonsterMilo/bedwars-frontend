// The frame every rebuilt page shares: header with the site map, search,
// key and settings; the light field behind the page; footer; toasts.
import { useState, useEffect, useRef } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { Settings } from './Settings.jsx';
import { KeyDialog, checkKey } from './KeyDialog.jsx';
import { PlayerSearch } from './PlayerSearch.jsx';
import { SECTIONS, currentPage } from '../lib/site.js';
import { siteKey, keyOwner, keyDialog } from '../lib/key.js';
import { toasts } from '../lib/toast.js';
import { useSignal } from '../lib/signal.js';
import { ItemIcon } from './items.jsx';
import { startBackdrop } from '../lib/backdrop.js';
import { season } from '../lib/prefs.js';
import { previewing } from '../lib/season.js';
import '../styles/christmas.css';

export { Logo } from './logo.jsx';
import { Logo } from './logo.jsx';

function NavGroup({ section, page, unlocked }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current || !ref.current.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') { setOpen(false); ref.current.querySelector('button').focus(); } };
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

export function Shell({ children, wide = false, search = true, bg = null }) {
  const page = currentPage();
  const key = useSignal(siteKey);
  const owner = useSignal(keyOwner);
  const list = useSignal(toasts);
  const [settings, setSettings] = useState(false);
  const keyOpen = useSignal(keyDialog);
  const setKeyOpen = v => { keyDialog.value = v; };
  const [menu, setMenu] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => { checkKey(); }, [key]);
  useEffect(() => { if (bg && bg !== 'none') startBackdrop(bg); }, []);
  // The holiday look: loaded only while it's on.
  const holiday = useSignal(season);
  useEffect(() => {
    if (holiday !== 'christmas') return;
    let off = false;
    const load = import('../lib/christmas.js');
    load.then(m => { if (!off) m.startChristmas({ previewing: previewing() }); }).catch(() => {});
    return () => { off = true; load.then(m => m.stopChristmas()).catch(() => {}); };
  }, [holiday]);
  useEffect(() => {
    const onKey = e => {
      if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement && document.activeElement.tagName) && searchRef.current) {
        e.preventDefault();
        searchRef.current.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const unlocked = !!(key && owner);

  return (
    <>
      <a class="skip-link" href="#main">Skip to content</a>
      <div class="bg-field" aria-hidden="true" />
      <header class="site-head">
        <div class={`wrap ${wide ? 'wide' : ''} head-row`}>
          <a class="brand" href="index.html" aria-label="Prism home"><Logo /><span>Prism</span></a>
          <nav class="nav" aria-label="Main">
            {SECTIONS.map(s => <NavGroup key={s.id} section={s} page={page} unlocked={unlocked} />)}
          </nav>
          <div class="head-tools">
            {search && <div class="head-search"><PlayerSearch inputRef={searchRef} /></div>}
            <button type="button" class={`btn icon ghost key-btn ${unlocked ? 'on' : ''}`} onClick={() => setKeyOpen(true)}
              aria-label={unlocked ? `Key: unlocked as ${owner}` : 'Enter key'} title={unlocked ? `Unlocked as ${owner}` : 'Enter key'}>
              <Icon name={unlocked ? 'unlock' : 'key'} />
            </button>
            <button type="button" class="btn icon ghost" onClick={() => setSettings(true)} aria-label="Settings" title="Settings"><Icon name="settings" /></button>
            <button type="button" class="btn icon ghost menu-btn" onClick={() => setMenu(!menu)} aria-expanded={menu ? 'true' : 'false'} aria-controls="mobile-nav" aria-label="Menu"><Icon name={menu ? 'close' : 'menu'} /></button>
          </div>
        </div>
        {menu && (
          <nav id="mobile-nav" class="mobile-nav wrap" aria-label="Main">
            {search && <PlayerSearch />}
            {SECTIONS.map(s => (
              <div key={s.id} class="mobile-group">
                <h2>{s.title}{s.locked && !unlocked && <Icon name="lock" class="nav-lock" label="Needs a key" />}</h2>
                {s.pages.map(p => <a key={p.href} href={p.href} aria-current={page && page.href === p.href ? 'page' : undefined}><span class="nav-ico small" style={{ '--hue': s.hue }}><ItemIcon id={p.item} /></span>{p.label}</a>)}
              </div>
            ))}
          </nav>
        )}
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer class="site-foot">
        <div class={`wrap ${wide ? 'wide' : ''} foot-row`}>
          <a class="brand small" href="index.html"><Logo size={20} /><span>Prism</span></a>
          <nav aria-label="Footer" class="foot-links">
            {SECTIONS.flatMap(s => s.pages).map(p => <a key={p.href} href={p.href}>{p.label}</a>)}
          </nav>
          <p class="faint small">Not affiliated with Hypixel or Mojang.</p>
        </div>
      </footer>
      <div class="toasts" role="status" aria-live="polite">{list.map(t => <div key={t.id} class="toast">{t.text}</div>)}</div>
      <Settings open={settings} onClose={() => setSettings(false)} />
      <KeyDialog open={keyOpen} onClose={() => setKeyOpen(false)} />
    </>
  );
}
