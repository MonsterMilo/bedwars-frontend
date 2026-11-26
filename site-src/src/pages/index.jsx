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
import { prefs, season, apply } from '../lib/prefs.js';
import { firstLoad } from '../lib/intro.js';
import { christmasLine } from '../lib/season.js';

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

const reduceMotion = () => document.documentElement.dataset.motion === 'reduce';

// First visit in this tab: the cards wait in the dark until their beam lands.
apply();
const INTRO = firstLoad();
if (INTRO) document.documentElement.classList.add('home-intro');
const endIntro = () => document.documentElement.classList.remove('home-intro');

// Starts the 3D prism once the page has drawn, and keeps its beams on the cards.
function usePrism(canvas, spot, cards, left) {
  const [mode, setMode] = useState('loading'); // loading | 3d | flat
  const [lit, setLit] = useState(() => SECTIONS.map(() => false));
  const hot = useRef(SECTIONS.map(() => 0));
  const hotT = useRef(SECTIONS.map(() => 0));
  useEffect(() => {
    let scene = null, dead = false;
    const colors = () => {
      const cs = getComputedStyle(document.documentElement);
      return SECTIONS.map(s => (s.hue.startsWith('var(') ? cs.getPropertyValue(s.hue.slice(4, -1)).trim() : s.hue));
    };
    const background = () => ({ base: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(), light: document.documentElement.dataset.surface === 'light' });
    const layout = () => {
      const sp = spot.current.getBoundingClientRect();
      const narrow = innerWidth <= 980;
      const els = cards.current.filter(Boolean);
      const first = els[0] && els[0].getBoundingClientRect();
      let size, x, y, targets;
      if (narrow) {
        // Phones: the prism between the words and the stacked cards, beams into the first card's top.
        size = Math.max(90, Math.min(sp.height * 0.9, sp.width * 0.5, 230));
        x = sp.left + sp.width / 2; y = sp.top + sp.height * 0.5;
        targets = els.map((el, i) => ({ x: first.left + first.width * ((i + 0.8) / (els.length + 0.6)), y: first.top + 1 }));
      } else {
        // Desktop: the prism top right, the cards in a row below. The white
        // light comes in from the right and the colours fan down out of the
        // base into the top of each card.
        size = Math.max(120, Math.min(sp.height * 0.8, sp.width * 0.5, 240));
        x = sp.left + sp.width / 2; y = sp.top + sp.height * 0.48;
        // Keep every beam off the words: slide its landing point along the
        // card's top edge until the line from the glass misses the text.
        const words = [...left.current.querySelectorAll('.kicker, .hero-title, .hero-sub, .hero-search, .people-row h2, .people-row li')].map(el => el.getBoundingClientRect()).filter(r => r.height);
        const bx = x - size * 0.1, by = y + size * 0.32;
        const hits = (tx, ty) => {
          for (let k = 1; k < 24; k++) {
            const px = bx + (tx - bx) * (k / 24), py = by + (ty - by) * (k / 24);
            if (words.some(r => px > r.left - 12 && px < r.right + 12 && py > r.top - 10 && py < r.bottom + 10)) return true;
          }
          return false;
        };
        targets = els.map((el, i) => {
          const r = el.getBoundingClientRect();
          let f = 0.7 - 0.4 * (i / Math.max(1, els.length - 1));
          while (f < 0.94 && hits(r.left + r.width * f, r.top)) f += 0.04;
          return { x: r.left + r.width * Math.min(f, 0.94), y: r.top + 1 };
        });
      }
      for (let i = 0; i < hot.current.length; i++) hot.current[i] += (hotT.current[i] - hot.current[i]) * 0.1;
      return { prism: { x, y, size }, targets, hot: hot.current };
    };
    function start() {
      if (scene || dead) return;
      if (document.documentElement.dataset.effects === 'off') { setMode('flat'); endIntro(); return; }
      import('../lib/prism3d.js').then(m => {
        if (dead || scene || document.documentElement.dataset.effects === 'off') return;
        scene = m.startPrism({ canvas: canvas.current, layout, colors, background, reduce: reduceMotion, onReady: () => setMode('3d'), intro: INTRO,
          backdrop: () => document.getElementById('backdrop'),
          onLand: i => setLit(l => (l[i] ? l : l.map((v, j) => v || j === i))) });
        if (!scene) { setMode('flat'); endIntro(); }
      }).catch(() => { setMode('flat'); endIntro(); });
    }
    const off = prefs.subscribe(() => requestAnimationFrame(() => {
      if (document.documentElement.dataset.effects === 'off') { if (scene) { scene.stop(); scene = null; canvas.current.classList.remove('on'); } setMode('flat'); return; }
      if (scene) scene.recolor(); else start();
    }));
    const t = setTimeout(start, 60);
    // Never leave the cards hidden if the light is slow to arrive.
    const safe = INTRO ? setTimeout(endIntro, 6000) : 0;
    return () => { dead = true; clearTimeout(t); clearTimeout(safe); off(); if (scene) scene.stop(); };
  }, []);
  return { mode, lit, setHot: (i, v) => { hotT.current[i] = v; } };
}

function Home() {
  const key = useSignal(siteKey);
  const owner = useSignal(keyOwner);
  const unlocked = !!(key && owner);
  const holiday = useSignal(season);
  const canvas = useRef(null), spot = useRef(null), cards = useRef([]), left = useRef(null);
  const { mode, lit, setHot } = usePrism(canvas, spot, cards, left);
  return (
    <Shell search={false} bg="none">
      <canvas ref={canvas} class="prism-canvas" aria-hidden="true" />
      <section class="hero wrap wide">
        <div class="hero-left" ref={left}>
          <p class="kicker reveal"><span aria-hidden="true" />Hypixel Bed Wars toolkit{holiday === 'christmas' && <b class="xm-count">{christmasLine()}</b>}</p>
          <h1 class="hero-title reveal">Prism</h1>
          <p class="hero-sub reveal">Look anyone up, find who's behind a nick, and see every cosmetic and map.</p>
          <div class="hero-search reveal"><PlayerSearch big autofocus placeholder="Player name or UUID" /></div>
          <People />
        </div>
        <div class={`prism-spot ${mode}`} ref={spot} aria-hidden="true">
          {mode === 'flat' && <span class="prism-flat"><Logo size={130} /></span>}
          {mode === '3d' && <span class="spin-hint">Drag to spin</span>}
        </div>
        <div class="hero-cards">
          {SECTIONS.map((s, si) => (
            <section key={s.id} ref={el => { cards.current[si] = el; }} class={`sec-card panel reveal ${lit[si] ? 'lit' : ''} ${s.locked ? 'locked' : ''} ${s.locked && !unlocked ? 'shut' : ''}`}
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
                    <a href={p.href} class={`sec-row card-link ${p.featured ? 'featured' : ''}`}>
                      <span class="tile"><ItemIcon id={p.item} /></span>
                      <span class="sec-text">
                        <strong>{p.label}{s.locked && !unlocked && <Icon name="lock" class="card-lock" label="Needs a key" />}</strong>
                        {!(s.locked && !unlocked) && <small>{p.desc}</small>}
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

mount(<Home />, { intro: false });
