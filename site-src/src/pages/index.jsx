// Home: the wordmark and search beside the glass prism, whose split beams
// light the four groups of pages. Drag the prism to spin it.
import '../styles/base.css';
import '../styles/shell.css';
import '../styles/common.css';
import '../styles/home.css';
import { useEffect, useRef, useState } from 'preact/hooks';
import { mount } from '../lib/mount.js';
import { Shell, Logo } from '../ui/Shell.jsx';
import { PlayerSearch } from '../ui/PlayerSearch.jsx';
import { Icon } from '../ui/icons.jsx';
import { Avatar } from '../ui/common.jsx';
import { ItemIcon } from '../ui/items.jsx';
import { SECTIONS } from '../lib/site.js';
import { siteKey, keyOwner, keyDialog } from '../lib/key.js';
import { recent, favourites, playerUrl, clearRecent } from '../lib/players.js';
import { useSignal } from '../lib/signal.js';
import { prefs } from '../lib/prefs.js';

// Old tracker links (anything with ?query or #hash) still open the tracker.
if (location.search || (location.hash && location.hash !== '#')) {
  location.replace(`tracker.html${location.search}${location.hash}`);
}

function People() {
  const favs = useSignal(favourites);
  const rec = useSignal(recent);
  if (!favs.length && !rec.length) return null;
  const list = (title, items, extra) => items.length > 0 && (
    <div class="people-row">
      <h2>{title}{extra}</h2>
      <ul>
        {items.slice(0, 8).map(p => (
          <li key={p.name}><a class="person" href={playerUrl(p.name)}><Avatar id={p.uuid || p.name} size={22} />{p.name}</a></li>
        ))}
      </ul>
    </div>
  );
  return (
    <section class="people reveal" aria-label="Your players">
      {list('Favourites', favs)}
      {list('Recent', rec, <button type="button" class="btn ghost small clear" onClick={clearRecent}>Clear</button>)}
    </section>
  );
}

const HUES = ['--accent', '--accent-2', '--accent-3'];
const reduceMotion = () => document.documentElement.dataset.motion === 'reduce';

// Starts the 3D prism once the page has drawn, and keeps its beams on the cards.
function usePrism(canvas, spot, cards) {
  const [mode, setMode] = useState('loading'); // loading | 3d | flat
  const hot = useRef(SECTIONS.map(() => 0));
  const hotT = useRef(SECTIONS.map(() => 0));
  useEffect(() => {
    let scene = null, dead = false;
    const colors = () => {
      const cs = getComputedStyle(document.documentElement);
      return SECTIONS.map((s, i) => (HUES[i] ? cs.getPropertyValue(HUES[i]).trim() : s.hue));
    };
    const background = () => ({ base: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(), light: document.documentElement.dataset.surface === 'light' });
    const layout = () => {
      const sp = spot.current.getBoundingClientRect();
      const narrow = innerWidth <= 980;
      const size = Math.max(90, Math.min(sp.height * 0.92, sp.width * 0.62, 340));
      const x = narrow ? sp.left + sp.width / 2 : sp.left + Math.min(sp.width * 0.42, size * 1.05);
      const y = sp.top + sp.height * 0.5;
      const els = cards.current.filter(Boolean);
      const first = els[0] && els[0].getBoundingClientRect();
      const targets = els.map((el, i) => {
        const r = el.getBoundingClientRect();
        if (narrow) return { x: first.left + first.width * ((i + 0.8) / (els.length + 0.6)), y: first.top + 1 };
        return { x: r.left + 12, y: r.top + 34 };
      });
      for (let i = 0; i < hot.current.length; i++) hot.current[i] += (hotT.current[i] - hot.current[i]) * 0.1;
      return { prism: { x, y, size }, targets, hot: hot.current, narrow, source: narrow ? { x: -40, y: y - size * 0.5 } : { x: -60, y: y - size * 0.32 } };
    };
    function start() {
      if (scene || dead) return;
      if (document.documentElement.dataset.effects === 'off') { setMode('flat'); return; }
      import('../lib/prism3d.js').then(m => {
        if (dead || scene || document.documentElement.dataset.effects === 'off') return;
        scene = m.startPrism({ canvas: canvas.current, layout, colors, background, reduce: reduceMotion, onReady: () => setMode('3d') });
        if (!scene) setMode('flat');
      }).catch(() => setMode('flat'));
    }
    const off = prefs.subscribe(() => requestAnimationFrame(() => {
      if (document.documentElement.dataset.effects === 'off') { if (scene) { scene.stop(); scene = null; canvas.current.classList.remove('on'); } setMode('flat'); return; }
      if (scene) scene.recolor(); else start();
    }));
    const t = setTimeout(start, 60);
    return () => { dead = true; clearTimeout(t); off(); if (scene) scene.stop(); };
  }, []);
  return { mode, setHot: (i, v) => { hotT.current[i] = v; } };
}

function Home() {
  const key = useSignal(siteKey);
  const owner = useSignal(keyOwner);
  const unlocked = !!(key && owner);
  const canvas = useRef(null), spot = useRef(null), cards = useRef([]);
  const { mode, setHot } = usePrism(canvas, spot, cards);
  return (
    <Shell search={false} bg="none">
      <canvas ref={canvas} class="prism-canvas" aria-hidden="true" />
      <section class="hero wrap">
        <div class="hero-left">
          <p class="kicker reveal"><span aria-hidden="true" />Hypixel Bed Wars toolkit</p>
          <h1 class="hero-title reveal">Prism</h1>
          <p class="hero-sub reveal">Look anyone up, find who's behind a nick, and see every cosmetic and map.</p>
          <div class="hero-search reveal"><PlayerSearch big autofocus placeholder="Player name or UUID" /></div>
          <People />
          <div class={`prism-spot ${mode}`} ref={spot} aria-hidden="true">
            {mode === 'flat' && <span class="prism-flat"><Logo size={150} /></span>}
            {mode === '3d' && <span class="spin-hint">Drag to spin</span>}
          </div>
        </div>
        <div class="hero-cards">
          {SECTIONS.map((s, si) => (
            <section key={s.id} ref={el => { cards.current[si] = el; }} class={`sec-card panel reveal ${s.locked ? 'locked' : ''}`}
              style={{ animationDelay: `${160 + si * 70}ms`, '--hue': s.hue }} aria-labelledby={`sec-${s.id}`}
              onPointerEnter={() => setHot(si, 1)} onPointerLeave={() => setHot(si, 0)} onFocusIn={() => setHot(si, 1)} onFocusOut={() => setHot(si, 0)}>
              <header class="sec-head">
                <span class="sec-dot" aria-hidden="true" />
                <h2 id={`sec-${s.id}`}>{s.title}</h2>
                <span class="faint small">{s.blurb}</span>
                {s.locked && (unlocked
                  ? <span class="chip good"><Icon name="unlock" />Unlocked</span>
                  : <button type="button" class="btn small" onClick={() => { keyDialog.value = true; }}><Icon name="key" />Enter key</button>)}
              </header>
              <ul class="sec-rows">
                {s.pages.map(p => (
                  <li key={p.href}>
                    <a href={p.href} class="sec-row card-link">
                      <span class="tile"><ItemIcon id={p.item} /></span>
                      <span class="sec-text">
                        <strong>{p.label}{s.locked && !unlocked && <Icon name="lock" class="card-lock" label="Needs a key" />}</strong>
                        <small>{p.desc}</small>
                      </span>
                      <Icon name="chevron" class="card-go" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </Shell>
  );
}

mount(<Home />);
