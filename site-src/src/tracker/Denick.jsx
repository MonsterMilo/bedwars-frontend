// Denicking: search every source, an unmask card for the best match, and
// Ask Milo for nicks nobody has seen yet.
import { useState, useEffect, useRef } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Tabs, Avatar } from '../ui/common.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { readJson, writeJson } from '../lib/storage.js';
import { ago } from '../lib/format.js';
import { search, subtitle, myRequests, sendRequest, REQUEST_LABELS } from './denick.js';
import { readUrl, writeUrl } from './url.js';
import { play, scan } from '../lib/audio.js';

const MODES = [['nick', 'Nick → Owners'], ['player', 'Player → Nicks']];
const NAME = /^[A-Za-z0-9_]{1,16}$/;
const PAGE = 8;
const SEEN = 'denickRequestsSeen';
const seenIds = () => new Set(readJson(SEEN, []));

function Unmask({ nick, entry }) {
  const [play, setPlay] = useState(0);
  useEffect(() => setPlay(p => p + 1), [nick, entry.username]);
  return (
    <button type="button" key={play} class="unmask play" onClick={() => setPlay(p => p + 1)} aria-label={`${nick} is ${entry.username}. Play again`}>
      <span class="unmask-card">
        <span class="unmask-face front"><span class="unmask-q" aria-hidden="true">?</span><span class="unmask-txt"><small>Nick</small><b>{nick}</b></span></span>
        <span class="unmask-face back">
          <img src={`https://mc-heads.net/body/${encodeURIComponent(entry.username)}/120`} alt="" />
          <span class="unmask-txt"><small>{nick} is</small><b>{entry.username}</b><span class="faint small">{entry.source}{entry.updated ? ` · ${ago(entry.updated)}` : ''}</span></span>
        </span>
      </span>
    </button>
  );
}

function AskDialog({ open, onClose, nick: initialNick, requests, reload }) {
  const [nick, setNick] = useState('');
  const [replay, setReplay] = useState('');
  const [note, setNote] = useState('');
  const [state, setState] = useState({});
  useEffect(() => { if (open) { setNick(initialNick || ''); setReplay(''); setNote(''); setState({}); } }, [open]);
  async function submit(e) {
    e.preventDefault();
    if (!NAME.test(nick.trim())) { setState({ error: 'Enter the nick (letters, numbers and _ only).' }); play('error'); return; }
    setState({ busy: true });
    try {
      await sendRequest({ nick: nick.trim(), replay: replay.trim(), note: note.trim() });
      setState({ sent: true }); setNick(''); setReplay(''); setNote('');
      play('success');
      reload();
    } catch (err) { setState({ error: err.message }); play('error'); }
  }
  const seen = seenIds();
  return (
    <Dialog open={open} onClose={onClose} title="Ask Milo" class="ask-dialog">
      <form class="ask" onSubmit={submit}>
        <p class="faint small">Milo gets a DM and answers here, usually within a day.</p>
        <div class="field"><label for="ask-nick">Nick</label><input id="ask-nick" class="input" maxLength={16} value={nick} onInput={e => setNick(e.currentTarget.value)} autofocus={!initialNick} /></div>
        <div class="field"><label for="ask-replay">Replay ID <span class="faint">(optional)</span></label><input id="ask-replay" class="input mono" value={replay} onInput={e => setReplay(e.currentTarget.value)} placeholder="e.g. 1a2b3c4d-…" autofocus={!!initialNick} /></div>
        <div class="field"><label for="ask-note">Note <span class="faint">(optional)</span></label><textarea id="ask-note" class="input" rows={2} maxLength={280} value={note} onInput={e => setNote(e.currentTarget.value)} /></div>
        {state.error && <p class="bad small" role="alert">{state.error}</p>}
        {state.sent && <p class="good small" role="status">Sent. Milo usually answers within a day, by DM.</p>}
        <div class="dialog-actions">
          <button type="button" class="btn" onClick={onClose}>{state.sent ? 'Close' : 'Cancel'}</button>
          <button type="submit" class="btn primary" disabled={state.busy}><Icon name="external" />{state.busy ? 'Sending…' : 'Send'}</button>
        </div>
      </form>
      <h3 class="ask-mine-h">Your requests</h3>
      {!requests.length ? <p class="faint small">Nothing sent yet.</p> : (
        <ul class="ask-mine">
          {requests.slice(0, 10).map(r => (
            <li key={r.id} class={r.status !== 'open' && !seen.has(`${r.id}:${r.answeredAt}`) ? 'is-new' : ''}>
              <b class="mono">{r.nick}</b>
              <span class={`chip ${r.status === 'found' ? 'good' : r.status === 'possible' ? 'warn' : r.status === 'notfound' ? 'bad' : ''}`}>{REQUEST_LABELS[r.status] || r.status}</span>
              <span class="ask-answer">
                {(r.status === 'found' || r.status === 'possible') ? <>{r.status === 'found' ? 'It\'s ' : 'Might be '}{(r.names || []).map((n, i) => <span key={n}>{i ? ', ' : ''}<b>{n}</b></span>)}</>
                  : r.status === 'notfound' ? 'Milo couldn\'t find who it is.' : `Sent ${ago(Date.parse(r.createdAt))}`}
              </span>
              {r.reply && <span class="ask-reply">“{r.reply}”</span>}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

export function Denick() {
  const init = useRef(readUrl()).current;
  const [mode, setModeState] = useState(init.denickMode);
  const [q, setQ] = useState(init.denick);
  const [res, setRes] = useState(null); // { query, mode, results, partial }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [ask, setAsk] = useState(null); // nick to prefill, or '' when open
  const [reqs, setReqs] = useState({ requests: [], on: true });
  const token = useRef(0);

  const loadReqs = () => myRequests().then(r => { setReqs(r); return r; }).catch(() => null);
  useEffect(() => {
    loadReqs();
    const vis = () => { if (!document.hidden) loadReqs(); };
    document.addEventListener('visibilitychange', vis);
    if (init.denick) run(init.denick, init.denickMode);
    return () => document.removeEventListener('visibilitychange', vis);
  }, []);

  async function run(query = q, m = mode) {
    const v = query.trim();
    if (!NAME.test(v)) { setError('Names are 1 to 16 letters, numbers or _.'); play('error'); return; }
    const t = ++token.current;
    setBusy(true); setError(''); setRes(null); setPage(1);
    scan(true);
    writeUrl({ denick: v, denickMode: m });
    try {
      const out = await search(m, v);
      if (t === token.current) { setRes({ query: v, mode: m, ...out }); scan(false); play(out.results.length ? 'found' : 'error'); }
    } catch (err) { if (t === token.current) { setError(err.message || 'Search failed.'); scan(false); play('error'); } } finally { if (t === token.current) setBusy(false); }
  }
  const setMode = m => { setModeState(m); setRes(null); writeUrl({ denickMode: m }); };
  function openAsk(nick) {
    setAsk(nick || '');
    // Opening the list counts as reading every answer in it.
    loadReqs().then(r => {
      if (!r) return;
      writeJson(SEEN, r.requests.filter(x => x.status !== 'open').map(x => `${x.id}:${x.answeredAt}`).slice(0, 50));
    });
  }

  const seen = seenIds();
  const fresh = reqs.requests.filter(r => r.status !== 'open' && !seen.has(`${r.id}:${r.answeredAt}`)).length;
  const list = res ? res.results : [];
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const shown = list.slice((page - 1) * PAGE, page * PAGE);
  const nameOf = e => (res && res.mode === 'nick' ? e.username : e.nick);

  return (
    <section class="panel pad lit denick" id="denick" aria-labelledby="denick-h">
      <div class="denick-head">
        <h2 class="panel-title" id="denick-h"><Icon name="mask" />Denicking</h2>
        <span class="grow" />
        {reqs.on && (
          <button type="button" class="btn small ghost" onClick={() => openAsk(res && res.mode === 'nick' ? res.query : '')}>
            Ask Milo{fresh > 0 && <span class="count-badge" aria-label={`${fresh} new answer${fresh === 1 ? '' : 's'}`}>{fresh}</span>}
          </button>
        )}
      </div>
      <Tabs label="Search by" value={mode} onChange={setMode} options={MODES} />
      <form class="lookup-form denick-form" onSubmit={e => { e.preventDefault(); run(); }} role="search">
        <label class="sr-only" for="dn-q">{mode === 'nick' ? 'Nick' : 'Player'}</label>
        <input id="dn-q" class="input" value={q} onInput={e => setQ(e.currentTarget.value)} placeholder={mode === 'nick' ? 'Nick to unmask' : 'Player name'} maxLength={16} autocomplete="off" spellcheck={false} />
        <button class="btn primary" type="submit" disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
      </form>
      {error && <p class="bad small" role="alert">{error}</p>}
      {busy && <div class="denick-skel">{[1, 2, 3].map(i => <div key={i} class="skel" style={{ height: '48px' }} />)}</div>}

      {res && !list.length && (
        <div class="denick-miss" role="status">
          <Icon name="search" />
          <div class="grow">
            <b>No results for “{res.query}”</b>
            <span class="faint small">{res.partial ? 'Part of the database didn\'t respond, so try again in a bit.' : res.mode === 'nick' ? 'Nobody in the database has been seen using this nick yet.' : 'No nick history found for this player.'}</span>
          </div>
          {res.mode === 'nick' && !res.partial && reqs.on && <button type="button" class="btn small primary" onClick={() => openAsk(res.query)}>Ask Milo to denick it</button>}
        </div>
      )}

      {res && list.length > 0 && (
        <>
          {res.mode === 'nick' && <Unmask nick={res.query} entry={list[0]} />}
          {res.partial && <p class="warn small">Part of the database didn't respond, so some results may be missing.</p>}
          <p class="faint small" role="status">{list.length} {res.mode === 'nick' ? (list.length === 1 ? 'owner' : 'owners') : (list.length === 1 ? 'nick' : 'nicks')} found</p>
          <ul class="denick-list">
            {shown.map(e => (
              <li key={`${e.username}|${e.nick}`}>
                <Avatar id={e.username} size={32} />
                <span class="grow">
                  <b>{nameOf(e)}</b>{res.mode === 'player' && <span class="faint small"> (as {e.username})</span>}
                  <span class="faint small">{subtitle(e)}</span>
                </span>
                {e.updated > 0 && <span class="faint small nowrap" title={new Date(e.updated).toLocaleString()}>{ago(e.updated)}</span>}
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav class="pager" aria-label="Result pages">
              <button type="button" class="btn small" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous"><Icon name="chevron" class="flip" /></button>
              <span class="faint small">{page} / {pages}</span>
              <button type="button" class="btn small" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next"><Icon name="chevron" /></button>
            </nav>
          )}
        </>
      )}
      <AskDialog open={ask !== null} onClose={() => { setAsk(null); loadReqs(); }} nick={ask} requests={reqs.requests} reload={loadReqs} />
    </section>
  );
}
