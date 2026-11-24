// Home: search first, then every page grouped by what it's for.
import '../styles/base.css';
import '../styles/shell.css';
import '../styles/common.css';
import '../styles/home.css';
import { mount } from '../lib/mount.js';
import { Shell, Logo } from '../ui/Shell.jsx';
import { PlayerSearch } from '../ui/PlayerSearch.jsx';
import { Icon } from '../ui/icons.jsx';
import { Avatar } from '../ui/common.jsx';
import { SECTIONS } from '../lib/site.js';
import { siteKey, keyOwner, keyDialog } from '../lib/key.js';
import { recent, favourites, playerUrl, clearRecent } from '../lib/players.js';
import { useSignal } from '../lib/signal.js';

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
        {items.slice(0, 10).map(p => (
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

function Home() {
  const key = useSignal(siteKey);
  const owner = useSignal(keyOwner);
  const unlocked = !!(key && owner);
  return (
    <Shell search={false}>
      <section class="hero wrap">
        <div class="hero-beam" aria-hidden="true"><span /><span /><span /></div>
        <div class="hero-mark reveal"><Logo size={56} /></div>
        <h1 class="hero-title reveal">Prism</h1>
        <p class="hero-sub reveal">Bed Wars stats, nicks and the players worth knowing.</p>
        <div class="hero-search reveal"><PlayerSearch big autofocus placeholder="Player name or UUID" /></div>
        <People />
      </section>

      <div class="wrap sections">
        {SECTIONS.map((s, si) => (
          <section key={s.id} class={`section reveal ${s.locked ? 'locked' : ''}`} style={{ animationDelay: `${120 + si * 80}ms` }} aria-labelledby={`sec-${s.id}`}>
            <header class="section-head">
              <h2 id={`sec-${s.id}`}>{s.title}</h2>
              <span class="faint">{s.blurb}</span>
              {s.locked && (unlocked
                ? <span class="chip good"><Icon name="unlock" />Unlocked</span>
                : <button type="button" class="btn small" onClick={() => { keyDialog.value = true; }}><Icon name="key" />Enter key</button>)}
            </header>
            <div class="cards">
              {s.pages.map(p => (
                <a key={p.href} href={p.href} class="card panel card-link">
                  <span class="card-ico"><Icon name={p.icon} /></span>
                  <span class="card-text">
                    <strong>{p.label}{s.locked && !unlocked && <Icon name="lock" class="card-lock" label="Needs a key" />}</strong>
                    <small>{p.desc}</small>
                  </span>
                  <Icon name="chevron" class="card-go" />
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Shell>
  );
}

mount(<Home />);
