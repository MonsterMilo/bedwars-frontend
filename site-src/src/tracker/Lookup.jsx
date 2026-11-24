// Sweat Lookup: preview a player's live stats, then add them as beaten.
import { useState, useRef, useMemo } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { PlayerName, Star } from '../ui/mc.jsx';
import { ErrorBox } from '../ui/common.jsx';
import { get, enc } from '../lib/api.js';
import { readJson, writeJson } from '../lib/storage.js';
import { keyOwner } from '../lib/key.js';
import { useSignal } from '../lib/signal.js';
import { toast } from '../lib/toast.js';
import { sweats, addSweat } from './store.js';
import { statsFromPlayer, indexOf, canWrite, today, personLabel, ROSTER_KEYS } from './model.js';
import { RosterPicker, FlagPicker, Gauge, TierBadge, fixed, NoteAuthor } from './ui.jsx';
import { TagList } from './Tags.jsx';

const NAME = /^[A-Za-z0-9_]{1,16}$/;
const RECENT = 'trackerRecentLookups';
const NOTE_MAX = 280;

// Where a live value sits among the tracked list's saved values.
export function standing(list, field, live) {
  const v = Number(live);
  const vals = list.map(s => Number(s[field])).filter(Number.isFinite);
  if (vals.length < 3 || !Number.isFinite(v)) return null;
  return { pct: Math.round(vals.filter(x => x < v).length / vals.length * 100), of: vals.length };
}
export function Standing({ st, field }) {
  if (!st) return null;
  return (
    <div class="standing" title={`Higher than ${st.pct}% of ${st.of} tracked sweats' saved ${field}`}>
      <span class="standing-bar"><span style={{ width: `${st.pct}%` }} /></span>
      <span>Beats {st.pct}%</span>
    </div>
  );
}

export function Lookup({ onOpen }) {
  const list = useSignal(sweats);
  const owner = useSignal(keyOwner);
  const [name, setName] = useState('');
  const [recent, setRecent] = useState(() => readJson(RECENT, []).filter(n => NAME.test(n)).slice(0, 8));
  const [preview, setPreview] = useState(null); // { uuid, name, player, stats }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [beaten, setBeaten] = useState({});
  const [flags, setFlags] = useState({ cheating: false, boosting: false });
  const [note, setNote] = useState('');
  const [dupe, setDupe] = useState(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const input = useRef(null);
  const ctrl = useRef(null);

  async function look(e, override) {
    if (e) e.preventDefault();
    const n = (override || name).trim();
    if (!NAME.test(n)) { setError({ message: 'Names are 1 to 16 letters, numbers or _.' }); return; }
    if (ctrl.current) ctrl.current.abort();
    const c = ctrl.current = new AbortController();
    setBusy(true); setError(null); setDupe(null); setDone(null);
    try {
      const m = await get(`/mojang/${enc(n)}`, { signal: c.signal, maxAge: 10 * 60_000 });
      const res = await get(`/player/${m.id}`, { signal: c.signal, maxAge: 60_000 });
      if (c.signal.aborted) return;
      const player = res && res.player;
      if (!player) throw new Error(`${m.name} has never played on Hypixel.`);
      setPreview({ uuid: m.id, name: m.name, player, stats: statsFromPlayer(player) });
      setName(m.name);
      const next = [m.name, ...recent.filter(x => x.toLowerCase() !== m.name.toLowerCase())].slice(0, 8);
      setRecent(next); writeJson(RECENT, next);
    } catch (err) {
      if (c.signal.aborted) return;
      setPreview(null);
      setError(err.notFound ? { message: `No Minecraft account is called ${n}.` } : err);
    } finally { if (!c.signal.aborted) setBusy(false); }
  }

  function clear() {
    setPreview(null); setName(''); setError(null); setDupe(null); setDone(null);
    setBeaten({}); setFlags({ cheating: false, boosting: false }); setNote('');
    input.current && input.current.focus();
  }

  async function add(confirm = false) {
    if (!preview) return;
    setSaving(true); setError(null);
    const s = preview.stats;
    const body = {
      username: preview.name, uuid: preview.uuid, dateAdded: today(),
      star: s.star, fkdr: s.fkdr, wlr: s.wlr, bblr: s.bblr, kdr: s.kdr,
      finals: s.finals, finalDeaths: s.finalDeaths, beds: s.beds, bedsLost: s.bedsLost, kills: s.kills, deaths: s.deaths,
      ...Object.fromEntries(ROSTER_KEYS.map(k => [k, !!beaten[k]])), ...flags,
      note: note.trim() || undefined
    };
    try {
      const res = await addSweat(body, { confirm });
      if (res && res.duplicate) { setDupe(res.duplicate); return; }
      setDupe(null);
      setDone(res);
      toast(`Added ${preview.name}`);
      setBeaten({}); setFlags({ cheating: false, boosting: false }); setNote('');
    } catch (err) { setError(err); } finally { setSaving(false); }
  }

  const st = preview && preview.stats;
  const index = st ? indexOf(st) : 0;
  const times = useMemo(() => (preview ? list.filter(x => String(x.uuid || '').replace(/-/g, '') === preview.uuid.replace(/-/g, '')).length : 0), [preview, list]);
  const writable = canWrite();

  return (
    <section class="panel pad lit lookup" id="lookup" aria-labelledby="lookup-h">
      <h2 class="panel-title" id="lookup-h"><Icon name="search" />Sweat Lookup</h2>
      <form class="lookup-form" onSubmit={look} role="search">
        <label class="sr-only" for="lk-name">Username</label>
        <input id="lk-name" ref={input} class="input" value={name} onInput={e => setName(e.currentTarget.value)} placeholder="Username" maxLength={16} autocomplete="off" spellcheck={false} />
        <button class="btn primary" type="submit" disabled={busy}>{busy ? 'Looking…' : 'Preview'}</button>
        {preview && <button class="btn ghost" type="button" onClick={clear}>Clear</button>}
      </form>
      {recent.length > 0 && !preview && (
        <div class="chips-row" aria-label="Recent lookups">
          {recent.map(n => <button key={n} type="button" class="chip-btn" onClick={() => { setName(n); look(null, n); }}>{n}</button>)}
        </div>
      )}
      <ErrorBox error={error} />

      {!preview && !busy && !error && (
        <div class="lookup-idle" aria-hidden="true"><span class="beam b1" /><span class="beam b2" /><span class="beam b3" /><p>Look someone up to see how sweaty they are.</p></div>
      )}
      {busy && !preview && <div class="lookup-skel"><div class="skel" style={{ height: '160px' }} /></div>}

      {preview && (
        <div class="preview">
          <div class="preview-head">
            <img class="preview-skin" src={`https://mc-heads.net/body/${preview.uuid}/120`} alt="" width="60" height="135" />
            <div class="preview-id">
              <div class="preview-name"><Star star={st.star} /> <PlayerName player={preview.player} name={preview.name} /></div>
              <div class="preview-sub">
                <TierBadge index={index} />
                <span class="mono">{Math.round(index).toLocaleString()} index</span>
                {times > 0 && <button type="button" class="chip accent" onClick={() => onOpen({ uuid: preview.uuid, username: preview.name })}>Tracked ×{times}</button>}
              </div>
            </div>
          </div>
          <Gauge index={index} />
          <div class="preview-stats">
            {[['FKDR', 'fkdr', st.fkdr], ['WLR', 'wlr', st.wlr], ['KDR', 'kdr', st.kdr], ['BBLR', 'bblr', st.bblr]].map(([label, f, v]) => (
              <div class="pstat" key={f}>
                <span class="pstat-label">{label}</span>
                <span class="pstat-value mono">{fixed(v)}</span>
                <Standing st={standing(list, f, v)} field={label} />
              </div>
            ))}
          </div>
          <TagList uuid={preview.uuid} compact />

          {writable ? (
            <div class="add-form">
              <RosterPicker value={beaten} onChange={setBeaten} />
              <FlagPicker {...flags} onChange={setFlags} />
              <div class="field note-field">
                <label for="lk-note">Note <span class="faint">(optional)</span></label>
                <textarea id="lk-note" class="input" rows={2} maxLength={NOTE_MAX} value={note} onInput={e => setNote(e.currentTarget.value)} placeholder="What happened?" />
                <div class="note-meta">{owner && <NoteAuthor id={owner} />}<span class={`faint small ${note.length > NOTE_MAX - 20 ? 'warn' : ''}`}>{note.length}/{NOTE_MAX}</span></div>
              </div>
              {dupe ? (
                <div class="notice warn-notice" role="alert">
                  <Icon name="alert" />
                  <span class="grow">{dupe.username} was already added today{dupe.addedBy ? ` by ${personLabel(dupe.addedBy) || dupe.addedBy}` : ''}.</span>
                  <span class="warn-actions">
                    <button class="btn small" type="button" onClick={() => setDupe(null)}>Cancel</button>
                    <button class="btn small primary" type="button" disabled={saving} onClick={() => add(true)}>Add anyway</button>
                  </span>
                </div>
              ) : (
                <div class="add-row">
                  <button class="btn primary add-btn" type="button" disabled={saving} onClick={() => add(false)}><Icon name="check" />{saving ? 'Adding…' : 'Add Sweat'}</button>
                  {done && <span class="good small" role="status">Added. <button type="button" class="link" onClick={() => onOpen(done)}>Open</button></span>}
                </div>
              )}
            </div>
          ) : <p class="faint small">Checking your key…</p>}
        </div>
      )}
    </section>
  );
}
