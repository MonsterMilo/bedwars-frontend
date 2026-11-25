// Activity (admin key only): every add, edit, delete, note and denick, with
// restore for deleted sweats.
import { useState, useEffect } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { ErrorBox } from '../ui/common.jsx';
import { get } from '../lib/api.js';
import { ago } from '../lib/format.js';
import { toast } from '../lib/toast.js';
import { restoreSweat } from './store.js';
import { ROSTER_KEYS, personLabel } from './model.js';
import { RosterDot } from './ui.jsx';
import { Select } from '../ui/controls.jsx';

const ACTIONS = [['', 'Everything'], ['sweat.add', 'Added'], ['sweat.edit', 'Edited'], ['sweat.delete', 'Deleted'], ['sweat.restore', 'Restored'], ['note.add,note.edit,note.delete', 'Notes'], ['denick.search', 'Denicks']];
const VERB = { 'sweat.add': 'added', 'sweat.edit': 'edited', 'sweat.delete': 'removed', 'sweat.restore': 'restored', 'note.add': 'noted on', 'note.edit': 'edited a note on', 'note.delete': 'deleted a note on', 'denick.search': 'searched' };
const FIELD = { star: 'Stars', fkdr: 'FKDR', wlr: 'WLR', bblr: 'BBLR', kdr: 'KDR', cheating: 'Cheating', boosting: 'Boosting' };
const show = v => (typeof v === 'boolean' ? (v ? 'yes' : 'no') : typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : v == null || v === '' ? '—' : String(v));

function Changes({ changes }) {
  if (!changes) return null;
  return (
    <span class="act-chips">
      {Object.entries(changes).map(([k, [a, b]]) => (
        <span key={k} class="act-chip">{FIELD[k] || personLabel(k) || k}: <s>{show(a)}</s> → <b>{show(b)}</b></span>
      ))}
    </span>
  );
}

function Row({ e, onRestored }) {
  const [busy, setBusy] = useState(false);
  const denick = e.action === 'denick.search';
  async function restore() {
    setBusy(true);
    try { await restoreSweat(e.sweatId); toast(`Restored ${e.username}`); onRestored(e._id); } catch (err) { toast(err.message || 'Couldn\'t restore it'); } finally { setBusy(false); }
  }
  return (
    <li class={`act act-${e.action.split('.')[0]}`}>
      <RosterDot id={e.who || 'admin'} size={28} />
      <div class="grow">
        <div class="act-line">
          <b>{personLabel(e.who) || e.who || 'Someone'}</b> {VERB[e.action] || e.action}{' '}
          {denick ? <><b class="mono">{e.query}</b> <span class="faint">({e.mode === 'player' ? 'player' : 'nick'})</span></> : <b>{e.username}</b>}
          {e.via === 'bot' && <span class="chip small-chip">bot</span>}
        </div>
        {e.action === 'sweat.edit' && <Changes changes={e.changes} />}
        {e.noteText && <p class="act-note">{e.action === 'note.edit' && e.noteBefore ? <><s>{e.noteBefore}</s> → </> : null}“{e.noteText}”{e.noteAuthor && e.noteAuthor !== e.who ? <span class="faint"> (by {personLabel(e.noteAuthor) || e.noteAuthor})</span> : null}</p>}
        {denick && (
          <span class="act-chips">
            {(e.found || []).length ? e.found.map((f, i) => <span key={i} class="act-chip">{f.name}<span class="faint"> · {f.source}</span></span>) : <span class="faint small">No results</span>}
            {e.resultCount > (e.found || []).length && <span class="faint small">+{e.resultCount - e.found.length} more</span>}
            {e.partial && <span class="chip warn small-chip">partial</span>}
          </span>
        )}
      </div>
      <span class="faint small nowrap" title={new Date(e.at).toLocaleString()}>{ago(Date.parse(e.at))}</span>
      {e.action === 'sweat.delete' && e.restorable && <button type="button" class="btn small" disabled={busy} onClick={restore}><Icon name="history" />Restore</button>}
    </li>
  );
}

export function Activity() {
  const [who, setWho] = useState('');
  const [action, setAction] = useState('');
  const [entries, setEntries] = useState([]);
  const [next, setNext] = useState(null);
  const [state, setState] = useState({ loading: true });

  async function load(before = null) {
    setState({ loading: true });
    const p = new URLSearchParams({ limit: '40' });
    if (who) p.set('who', who);
    if (action) p.set('action', action);
    if (before) p.set('before', before);
    try {
      const data = await get(`/activity?${p}`, { maxAge: 0 });
      setEntries(before ? [...entries, ...data.entries] : data.entries);
      setNext(data.nextBefore);
      setState({});
    } catch (error) { setState({ error }); }
  }
  useEffect(() => { load(); }, [who, action]);

  return (
    <div class="panel pad activity">
      <div class="denick-head">
        <span class="grow" />
        <button type="button" class="btn small ghost" onClick={() => load()} aria-label="Refresh"><Icon name="refresh" /></button>
      </div>
      <div class="act-filters">
        <Select label="Who" small value={who} onChange={setWho} options={[['', 'Everyone'], ...[...ROSTER_KEYS, 'admin'].map(k => [k, personLabel(k)])]} />
        <Select label="Change" small value={action} onChange={setAction} options={ACTIONS} />
      </div>
      <ErrorBox error={state.error} onRetry={() => load()} what="the activity" />
      {!state.loading && !state.error && !entries.length && <p class="faint small">Nothing here yet.</p>}
      <ul class="act-list">{entries.map(e => <Row key={e._id} e={e} onRestored={id => setEntries(entries.map(x => (x._id === id ? { ...x, restorable: false } : x)))} />)}</ul>
      {state.loading && <div class="denick-skel">{[1, 2, 3].map(i => <div key={i} class="skel" style={{ height: '44px' }} />)}</div>}
      {next && !state.loading && <button type="button" class="btn small center-btn" onClick={() => load(next)}>Show more</button>}
    </div>
  );
}
