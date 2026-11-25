// Nick Finder: describe what you saw (cosmetics, numbers, the game) and
// Aurora and TrickAPI list who it could be. A typed nick also checks the
// denicks we already know.
import '../styles/base.css';
import '../styles/shell.css';
import '../styles/common.css';
import '../styles/nicks.css';
import { useEffect, useMemo, useState, useRef } from 'preact/hooks';
import { mount } from '../lib/mount.js';
import { Shell } from '../ui/Shell.jsx';
import { Icon } from '../ui/icons.jsx';
import { Star } from '../ui/mc.jsx';
import { Avatar, ErrorBox, Empty, SourceNote, HeadEmblem } from '../ui/common.jsx';
import { post } from '../lib/api.js';
import { num, date, ago, duration } from '../lib/format.js';
import { siteKey, keyOwner } from '../lib/key.js';
import { useSignal } from '../lib/signal.js';
import { playerUrl } from '../lib/players.js';
import COSMETICS from '../data/cosmetics.json';
import { CosmeticThumb, ItemIcon, killLine } from '../ui/items.jsx';
import { Select, NumberField, DateTimeField } from '../ui/controls.jsx';

const NAME = /^[A-Za-z0-9_]{1,16}$/;
const CATS = Object.entries(COSMETICS).filter(([cat]) => cat !== 'spray');
const MODE_LABELS = { '1s': 'Solos', '2s': 'Doubles', '3s': '3v3v3v3', '4s': '4v4v4v4', '4v4': '4v4', solo: 'Solos', doubles: 'Doubles', '3v3v3v3': '3v3v3v3', '4v4v4v4': '4v4v4v4' };
const params = new URLSearchParams(location.search);

// ---------- cosmetic picker ----------
function Thumb({ item, cat, size = 40 }) {
  return <CosmeticThumb item={item} cat={cat} size={size} class="pick-thumb" />;
}

function CosmeticPicker({ picked, onPick }) {
  const [cat, setCat] = useState(CATS[0][0]);
  const [q, setQ] = useState('');
  const group = COSMETICS[cat];
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return group.items.filter(it => !s || it.name.toLowerCase().includes(s)).sort((a, b) => a.name.localeCompare(b.name));
  }, [cat, q]);
  const chosen = picked[group.field];
  return (
    <div class="picker">
      <div class="picker-cats" role="tablist" aria-label="Cosmetic type">
        {CATS.map(([id, g]) => (
          <button key={id} type="button" role="tab" aria-selected={cat === id ? 'true' : 'false'} class={picked[g.field] ? 'has' : ''} onClick={() => { setCat(id); setQ(''); }}>
            <span class="cat-ico"><ItemIcon id={`cat:${id}`} /></span><span class="grow">{g.label}</span>{picked[g.field] && <span class="dot" aria-label="(picked)" />}
          </button>
        ))}
      </div>
      <div class="picker-body" role="tabpanel" aria-label={group.label}>
        <div class="picker-tools">
          <input class="input" type="search" placeholder={`Search ${group.label.toLowerCase()}`} value={q} onInput={e => setQ(e.currentTarget.value)} aria-label={`Search ${group.label}`} />
          <a class="btn ghost small" href={`cosmetics.html`} target="_blank" rel="noopener">Library<Icon name="external" /></a>
        </div>
        <ul class="pick-grid" aria-label={group.label}>
          {items.map(it => {
            const on = chosen === it.id;
            return (
              <li key={it.id}>
                <button type="button" class={`pick ${on ? 'on' : ''}`} aria-pressed={on ? 'true' : 'false'} onClick={() => onPick(group.field, on ? null : it.id)} title={it.verified ? it.name : `${it.name} (id not confirmed yet)`}>
                  <Thumb item={it} cat={cat} />
                  <span class="pick-text"><span>{it.name}</span>{it.line && <small>{killLine(it.line)}</small>}</span>
                  {on && <Icon name="check" class="pick-check" />}
                </button>
              </li>
            );
          })}
          {!items.length && <li class="faint small pick-none">Nothing matches.</li>}
        </ul>
      </div>
    </div>
  );
}

function PickedList({ picked, onPick }) {
  const rows = CATS.filter(([, g]) => picked[g.field]).map(([cat, g]) => ({ cat, g, it: g.items.find(i => i.id === picked[g.field]) }));
  if (!rows.length) return <p class="faint small picked-empty">None yet. Pick them on the left.</p>;
  return (
    <ul class="picked">
      {rows.map(({ cat, g, it }) => (
        <li key={g.field} class="picked-row">
          <Thumb item={it} cat={cat} size={36} />
          <span class="grow"><small>{g.label}</small><strong>{it.name}</strong></span>
          {it.lib && <a class="btn icon ghost small" href={`cosmetics.html#${it.lib}`} target="_blank" rel="noopener" aria-label={`See ${it.name} in the library`}><Icon name="external" /></a>}
          <button type="button" class="btn icon ghost small" onClick={() => onPick(g.field, null)} aria-label={`Remove ${it.name}`}><Icon name="close" /></button>
        </li>
      ))}
    </ul>
  );
}

// ---------- game ----------
// The ways to say which game it was. Each one ends up as a time window that
// TrickAPI searches (who was online then with those cosmetics).
const HOW = [
  { id: 'none', title: 'Skip', text: 'Search without the game. Expect more names.' },
  { id: 'time', title: 'Enter the time', text: 'When the game started (within a few minutes) and the mode.' }
];

function GamePicker({ how, setHow, game, setGame }) {
  return (
    <div class="stack">
      <div class="how-list" role="radiogroup" aria-label="How to find the game">
        {HOW.map(h => {
          const on = how === h.id;
          return (
            <button key={h.id} type="button" role="radio" aria-checked={on ? 'true' : 'false'} class={`how ${on ? 'on' : ''}`} onClick={() => { if (!on) { setHow(h.id); setGame({}); } }}>
              <span class="how-dot" aria-hidden="true" />
              <span class="how-text"><strong>{h.title}</strong><small>{h.text}</small></span>
            </button>
          );
        })}
      </div>
      {how === 'time' && (
        <div class="stack">
          <div class="field">
            <span>When it started</span>
            <DateTimeField label="When the game started" max={Date.now() + 5 * 60000} min={Date.now() - 365 * 86400000} value={game.at || null} onChange={v => setGame({ ...game, at: v })} />
            <small>Your device's time.</small>
          </div>
          <div class="field">
            <span>Mode</span>
            <Select label="Mode" value={game.mode || ''} onChange={v => setGame({ ...game, mode: v || null })}
              options={[['', 'Any mode'], ...['1s', '2s', '3s', '4s', '4v4'].map(m => [m, MODE_LABELS[m]])]} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- results ----------
function Results({ res, busySince }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!busySince) return undefined;
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [busySince]);
  if (busySince) {
    const s = Math.floor((Date.now() - busySince) / 1000);
    return (
      <section class="panel pad results" aria-live="polite" aria-busy="true">
        <div class="searching"><span class="spinner" aria-hidden="true" /><div><strong>Searching…</strong><p class="faint small">{s}s. This can take up to 40 seconds.</p></div></div>
      </section>
    );
  }
  if (!res) return null;
  const { game, gameNote, candidates = [], known = [], sources } = res;
  const states = Object.values(sources || {});
  const searched = states.length > 0;
  const noSource = searched && !candidates.length && states.every(v => v !== 'ok');
  return (
    <section class="panel pad results reveal" aria-live="polite" aria-labelledby="res-h">
      <h2 class="panel-title" id="res-h"><Icon name="search" />Results</h2>
      {game && <p class="chip accent game-chip"><Icon name="film" />{game.mode ? `${MODE_LABELS[game.mode] || game.mode} · ` : ''}{date(Date.parse(game.playedAt), { time: true })}{game.durationMs ? ` · ${duration(game.durationMs)}` : ''}</p>}
      {gameNote && <p class="notice"><Icon name="info" /><span>{gameNote}</span></p>}

      {known.length > 0 && (
        <>
          <h3 class="sub-title">Already denicked</h3>
          <ul class="known">
            {known.map((k, i) => (
              <li key={i}>
                <a class="person" href={playerUrl(k.player)}><Avatar id={k.player} size={20} />{k.player}</a>
                <span class="faint small">as {k.nick} · {k.source}{k.at ? ` · ${ago(k.at)}` : ''}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 class="sub-title">Possible players</h3>
      {candidates.length ? (
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Player</th><th class="num">Star</th><th class="num">Finals</th><th class="num">Beds</th><th class="num">Match</th><th>Found by</th></tr></thead>
            <tbody>
              {candidates.slice(0, 100).map(c => (
                <tr key={c.name} class={c.from.length > 1 ? 'both' : ''}>
                  <td><span class="player-cell"><a href={playerUrl(c.uuid || c.name)}><Avatar id={c.uuid || c.name} size={22} /><span class="mono">{c.name}</span></a></span></td>
                  <td class="num">{c.star != null ? <Star star={c.star} /> : '—'}</td>
                  <td class="num">{num(c.finals)}</td>
                  <td class="num">{num(c.beds)}</td>
                  <td class="num">{c.match != null ? `${Math.round(c.match)}%` : '—'}</td>
                  <td><span class="row">{c.from.map(f => <span key={f} class="chip">{f}</span>)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : noSource
        ? <p class="notice"><Icon name="alert" /><span>No search source answered. Try again in a minute.</span></p>
        : searched ? <Empty icon="mask">No one matched. Try fewer cosmetics, or add the game.</Empty>
          : <Empty icon="mask">{known.length ? 'Add cosmetics or numbers to search for more.' : 'No denick known for this nick yet. Add cosmetics or numbers to search.'}</Empty>}
      <SourceNote sources={sources} />
    </section>
  );
}

// ---------- page ----------
function NickFinder() {
  const key = useSignal(siteKey);
  const owner = useSignal(keyOwner);
  const unlocked = !!(key && owner);
  const [nick, setNick] = useState(params.get('nick') || '');
  const [finals, setFinals] = useState('');
  const [beds, setBeds] = useState('');
  const [picked, setPicked] = useState({});
  const [how, setHow] = useState('none');
  const [game, setGame] = useState({});
  const [res, setRes] = useState(null);
  const [error, setError] = useState(null);
  const [busySince, setBusySince] = useState(null);
  const resultsRef = useRef(null);

  const onPick = (field, id) => setPicked(p => { const n = { ...p }; if (id) n[field] = id; else delete n[field]; return n; });
  const count = Object.keys(picked).length;
  const nickOk = !nick || NAME.test(nick.trim());
  const canSearch = nickOk && (nick.trim() || finals !== '' || beds !== '' || count) && !busySince;

  async function submit(e) {
    e.preventDefault();
    if (!canSearch) return;
    const body = { cosmetics: picked };
    if (nick.trim()) body.nick = nick.trim();
    if (finals !== '') body.finals = Number(finals);
    if (beds !== '') body.beds = Number(beds);
    if (how === 'time' && game.at) body.game = { at: game.at, end: game.end || undefined, mode: game.mode || undefined };
    setError(null);
    setRes(null);
    setBusySince(Date.now());
    requestAnimationFrame(() => resultsRef.current && resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    try { setRes(await post('/site/nicks', body, { timeout: 70_000 })); }
    catch (err) { setError(err); }
    finally { setBusySince(null); }
  }
  function clear() { setNick(''); setFinals(''); setBeds(''); setPicked({}); setGame({}); setHow('none'); setRes(null); setError(null); }

  return (
    <Shell bg="nicks">
      <div class="page wrap">
        <header class="page-head">
          <div class="grow">
            <p class="eyebrow"><ItemIcon id="ui:eye" />Nick Finder</p>
            <h1>Who's behind the nick?</h1>
            <p>Someone in your game is nicked. Tell us what you saw them use, and we'll list the real players who match.</p>
          </div>
          <HeadEmblem id="ui:eye" />
        </header>
        <ol class="how-steps" aria-label="How it works">
          <li><span class="step-n">1</span><div><strong>Pick their cosmetics</strong><p>Kill effect, bed destroy, trail, glyph... Every one you add narrows it down.</p></div></li>
          <li><span class="step-n">2</span><div><strong>Add what you know</strong><p>The nick they're using, plus their final kills and beds if you saw them.</p></div></li>
          <li><span class="step-n">3</span><div><strong>Say which game</strong><p>Optional, but it helps most: we then only check players who were online then.</p></div></li>
        </ol>

        <form class="nick-form" onSubmit={submit} noValidate>
          <div class="nick-main">
            <section class="panel pad" aria-labelledby="cos-h">
              <h2 class="panel-title" id="cos-h"><span class="step-n small">1</span>Cosmetics they used</h2>
              <CosmeticPicker picked={picked} onPick={onPick} />
            </section>
          </div>
          <aside class="nick-side">
            <section class="panel pad stack" aria-labelledby="who-h">
              <h2 class="panel-title" id="who-h"><span class="step-n small">2</span>What you know</h2>
              <label class="field">
                <span>Nick</span>
                <input class="input" value={nick} onInput={e => setNick(e.currentTarget.value)} placeholder="The name they're using" maxLength={16} spellcheck={false} autocomplete="off" aria-invalid={nickOk ? undefined : 'true'} />
                {!nickOk && <small class="bad-text">1 to 16 letters, numbers or _</small>}
              </label>
              <div class="grid-2">
                <div class="field"><span>Final kills</span><NumberField label="Final kills" value={finals} onChange={setFinals} placeholder="—" /></div>
                <div class="field"><span>Beds broken</span><NumberField label="Beds broken" value={beds} onChange={setBeds} placeholder="—" /></div>
              </div>
              <div class="field"><span>Picked cosmetics{count > 0 && <b class="count-pill">{count}</b>}</span><PickedList picked={picked} onPick={onPick} /></div>
            </section>
            <section class="panel pad" aria-labelledby="game-h">
              <h2 class="panel-title" id="game-h"><span class="step-n small">3</span>Which game<span class="grow" /><span class="opt-tag">Optional</span></h2>
              <GamePicker how={how} setHow={setHow} game={game} setGame={setGame} />
            </section>
            <div class="row nick-go">
              <button class="btn primary grow" type="submit" disabled={!canSearch}><Icon name="search" />{busySince ? 'Searching…' : 'Find'}</button>
              <button class="btn" type="button" onClick={clear}>Clear</button>
            </div>
            {!canSearch && !busySince && <p class="faint small">Pick a cosmetic, or type the nick or numbers, to search.</p>}
            {!unlocked && <p class="faint small">Without a key you get 4 searches a minute.</p>}
          </aside>
        </form>

        <div ref={resultsRef} class="results-anchor">
          <ErrorBox error={error} what="results" />
          <Results res={res} busySince={busySince} />
        </div>
      </div>
    </Shell>
  );
}

mount(<NickFinder />);
