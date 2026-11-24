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
import { Tabs, Avatar, ErrorBox, Empty, SourceNote } from '../ui/common.jsx';
import { get, post, enc, ApiError } from '../lib/api.js';
import { num, date, ago, duration } from '../lib/format.js';
import { siteKey, keyOwner, keyDialog } from '../lib/key.js';
import { useSignal } from '../lib/signal.js';
import { playerUrl } from '../lib/players.js';
import COSMETICS from '../data/cosmetics.json';

const NAME = /^[A-Za-z0-9_]{1,16}$/;
const CATS = Object.entries(COSMETICS).filter(([cat]) => cat !== 'spray');
const MODE_LABELS = { '1s': 'Solos', '2s': 'Doubles', '3s': '3v3v3v3', '4s': '4v4v4v4', '4v4': '4v4', solo: 'Solos', doubles: 'Doubles', '3v3v3v3': '3v3v3v3', '4v4v4v4': '4v4v4v4' };
const params = new URLSearchParams(location.search);

// ---------- cosmetic picker ----------
function Thumb({ item, size = 40 }) {
  return (
    <span class="pick-thumb" style={{ width: `${size}px`, height: `${size}px` }}>
      {item.thumb ? <img src={`cosmetics/thumbs/${item.lib}.webp`} alt="" loading="lazy" width={size} height={size} /> : <span aria-hidden="true">{item.name.replace(/[^A-Za-z0-9#]/g, '').slice(0, 2)}</span>}
    </span>
  );
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
            {g.label}{picked[g.field] && <span class="dot" aria-label="(picked)" />}
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
                  <Thumb item={it} />
                  <span>{it.name}</span>
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
  const rows = CATS.map(([, g]) => g).filter(g => picked[g.field]).map(g => ({ g, it: g.items.find(i => i.id === picked[g.field]) }));
  if (!rows.length) return <p class="faint small">No cosmetics picked yet.</p>;
  return (
    <ul class="picked">
      {rows.map(({ g, it }) => (
        <li key={g.field} class="picked-row">
          <Thumb item={it} size={32} />
          <span class="grow"><small>{g.label}</small><strong>{it.name}</strong></span>
          {it.lib && <a class="btn icon ghost small" href={`cosmetics.html#${it.lib}`} target="_blank" rel="noopener" aria-label={`See ${it.name} in the library`}><Icon name="external" /></a>}
          <button type="button" class="btn icon ghost small" onClick={() => onPick(g.field, null)} aria-label={`Remove ${it.name}`}><Icon name="close" /></button>
        </li>
      ))}
    </ul>
  );
}

// ---------- game ----------
function RecentGames({ value, onChange }) {
  const [who, setWho] = useState(params.get('player') || '');
  const [state, setState] = useState({ loading: false, error: null, data: null });
  async function load(e) {
    if (e) e.preventDefault();
    if (!NAME.test(who.trim())) { setState({ loading: false, error: new ApiError('Enter a valid player name', 400), data: null }); return; }
    setState({ loading: true, error: null, data: null });
    try { setState({ loading: false, error: null, data: await get(`/site/recent-games/${enc(who.trim())}`, { maxAge: 60_000 }) }); }
    catch (err) { setState({ loading: false, error: err, data: null }); }
  }
  useEffect(() => { if (who) load(); }, []);
  const games = (state.data && state.data.games) || [];
  return (
    <div class="stack">
      <div class="input-row">
        <input class="input" value={who} onInput={e => setWho(e.currentTarget.value)} placeholder="A player who was in the game" aria-label="Player in the game" maxLength={16} spellcheck={false} autocomplete="off"
          onKeyDown={e => { if (e.key === 'Enter') load(e); }} />
        <button type="button" class="btn" onClick={load} disabled={state.loading}>{state.loading ? 'Loading…' : 'Load games'}</button>
      </div>
      <ErrorBox error={state.error} what="recent games" />
      {state.data && !games.length && <p class="faint small">No recent Bed Wars games. Hypixel hides them if the player turned that off.</p>}
      {games.length > 0 && (
        <ul class="games" role="radiogroup" aria-label="Pick the game">
          {games.map((g, i) => {
            const on = value && value.at === g.start;
            return (
              <li key={i}>
                <button type="button" role="radio" aria-checked={on ? 'true' : 'false'} class={`game ${on ? 'on' : ''}`} onClick={() => onChange({ at: g.start, end: g.end, mode: g.mode })}>
                  <strong>{MODE_LABELS[g.mode] || 'Bed Wars'}{g.map ? ` · ${g.map}` : ''}</strong>
                  <span class="faint small">{date(g.start, { time: true })} · {ago(g.start)}{g.end ? ` · ${duration(g.end - g.start)}` : ' · not finished'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const localInput = ms => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

function GamePicker({ how, setHow, game, setGame, unlocked }) {
  return (
    <div class="stack">
      <Tabs label="How to find the game" value={how} onChange={v => { setHow(v); setGame({}); }}
        options={[['none', 'Skip'], ['replay', 'Replay ID'], ['recent', 'Recent games'], ['time', 'Time']]} />
      {how === 'none' && <p class="faint small">Without a game, only Aurora searches{unlocked ? ' and TrickAPI checks everyone it has seen' : ''}. Adding the game finds more.</p>}
      {how === 'replay' && (
        <label class="field">
          <span>Replay ID or link</span>
          <input class="input mono" value={game.replayId || ''} onInput={e => setGame({ replayId: e.currentTarget.value.trim() })} placeholder="e.g. 3f2c9a1e-…" spellcheck={false} autocomplete="off" maxLength={200} />
          <small>Its time and mode come from Bedlify's recorded games.</small>
        </label>
      )}
      {how === 'recent' && (unlocked
        ? <RecentGames value={game} onChange={setGame} />
        : <p class="notice"><Icon name="lock" /><span>Recent games need a key. <button type="button" class="linkish" onClick={() => { keyDialog.value = true; }}>Enter key</button> or use the time instead.</span></p>)}
      {how === 'time' && (
        <div class="grid-2">
          <label class="field">
            <span>When the game started</span>
            <input class="input" type="datetime-local" max={localInput(Date.now())} value={game.at ? localInput(game.at) : ''} onInput={e => setGame({ ...game, at: e.currentTarget.value ? new Date(e.currentTarget.value).getTime() : null })} />
            <small>Your device's time. Within a few minutes is fine.</small>
          </label>
          <label class="field">
            <span>Mode</span>
            <select class="select" value={game.mode || ''} onChange={e => setGame({ ...game, mode: e.currentTarget.value || null })}>
              <option value="">Any</option>
              {['1s', '2s', '3s', '4s', '4v4'].map(m => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
            </select>
          </label>
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
        <div class="searching"><span class="spinner" aria-hidden="true" /><div><strong>Searching…</strong><p class="faint small">{s}s. TrickAPI can take up to 40 seconds when it's busy.</p></div></div>
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
  const [how, setHow] = useState(params.get('player') ? 'recent' : 'none');
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
    if (how === 'replay' && game.replayId) body.game = { replayId: game.replayId };
    if ((how === 'recent' || how === 'time') && game.at) body.game = { at: game.at, end: game.end || undefined, mode: game.mode || undefined };
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
    <Shell>
      <div class="page wrap">
        <header class="page-head">
          <div class="grow">
            <p class="eyebrow"><Icon name="mask" />Nick Finder</p>
            <h1>Who's behind the nick?</h1>
            <p>Pick what you saw them use. Adding the game narrows it down a lot.</p>
          </div>
        </header>

        <form class="nick-form" onSubmit={submit} noValidate>
          <div class="nick-main">
            <section class="panel pad" aria-labelledby="cos-h">
              <h2 class="panel-title" id="cos-h"><Icon name="palette" />Cosmetics they used</h2>
              <CosmeticPicker picked={picked} onPick={onPick} />
            </section>
          </div>
          <aside class="nick-side">
            <section class="panel pad stack" aria-labelledby="who-h">
              <h2 class="panel-title" id="who-h"><Icon name="user" />What you know</h2>
              <label class="field">
                <span>Nick</span>
                <input class="input mono" value={nick} onInput={e => setNick(e.currentTarget.value)} placeholder="Optional" maxLength={16} spellcheck={false} autocomplete="off" aria-invalid={nickOk ? undefined : 'true'} />
                {!nickOk && <small class="bad-text">1 to 16 letters, numbers or _</small>}
              </label>
              <div class="grid-2">
                <label class="field"><span>Final kills</span><input class="input mono" type="number" min="0" inputMode="numeric" value={finals} onInput={e => setFinals(e.currentTarget.value)} placeholder="Optional" /></label>
                <label class="field"><span>Beds broken</span><input class="input mono" type="number" min="0" inputMode="numeric" value={beds} onInput={e => setBeds(e.currentTarget.value)} placeholder="Optional" /></label>
              </div>
              <div class="field"><span>Picked cosmetics</span><PickedList picked={picked} onPick={onPick} /></div>
            </section>
            <section class="panel pad" aria-labelledby="game-h">
              <h2 class="panel-title" id="game-h"><Icon name="film" />The game</h2>
              <GamePicker how={how} setHow={setHow} game={game} setGame={setGame} unlocked={unlocked} />
            </section>
            <div class="row nick-go">
              <button class="btn primary grow" type="submit" disabled={!canSearch}><Icon name="search" />{busySince ? 'Searching…' : 'Find'}</button>
              <button class="btn" type="button" onClick={clear}>Clear</button>
            </div>
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
