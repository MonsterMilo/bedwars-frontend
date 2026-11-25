// Sweat Lookup: preview a player's live stats, then add them as beaten.
import { useState, useRef, useMemo } from 'preact/hooks';
import { num } from '../lib/format.js';
import { Icon } from '../ui/icons.jsx';
import { PlayerName, Star } from '../ui/mc.jsx';
import { ErrorBox } from '../ui/common.jsx';
import { get, enc } from '../lib/api.js';
import { readJson, writeJson } from '../lib/storage.js';
import { keyOwner } from '../lib/key.js';
import { useSignal } from '../lib/signal.js';
import { toast } from '../lib/toast.js';
import { sweats, addSweat } from './store.js';
import { statsFromPlayer, indexOf, canWrite, today, personLabel, ROSTER_KEYS, TIERS, tierIndex, gaugeOf } from './model.js';
import { RosterPicker, FlagPicker, fixed, NoteAuthor } from './ui.jsx';
import { TagList } from './Tags.jsx';
import { play, scan } from '../lib/audio.js';
import { successFlourish, technoblade } from '../lib/fx.js';

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
    <div class="standing" title={`Higher than ${st.pct}% of ${st.of} tracked players' saved ${field}`}>
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
  const addRow = useRef(null);
  const techno = useRef(false);
  function typeName(v) {
    setName(v);
    const t = v.trim().toLowerCase() === 'technoblade';
    if (t && !techno.current) technoblade(input.current);
    techno.current = t;
  }

  async function look(e, override) {
    if (e) e.preventDefault();
    const n = (override || name).trim();
    if (!NAME.test(n)) { setError({ message: 'Names are 1 to 16 letters, numbers or _.' }); play('error'); return; }
    if (ctrl.current) ctrl.current.abort();
    const c = ctrl.current = new AbortController();
    setBusy(true); setError(null); setDupe(null); setDone(null);
    scan(true);
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
      scan(false); play('found');
    } catch (err) {
      if (c.signal.aborted) return;
      scan(false); play('error');
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
      if (res && res.duplicate) { setDupe(res.duplicate); play('error'); return; }
      setDupe(null);
      setDone(res);
      toast(`Added ${preview.name}`);
      // After the row re-renders (it was the duplicate warning a moment ago).
      setTimeout(() => { const row = addRow.current; successFlourish(row, row && row.querySelector('.add-btn')); }, 0);
      setBeaten({}); setFlags({ cheating: false, boosting: false }); setNote('');
    } catch (err) { setError(err); play('error'); } finally { setSaving(false); }
  }

  const st = preview && preview.stats;
  const index = st ? indexOf(st) : 0;
  const times = useMemo(() => (preview ? list.filter(x => String(x.uuid || '').replace(/-/g, '') === preview.uuid.replace(/-/g, '')).length : 0), [preview, list]);
  const writable = canWrite();

  return (
    <div class="panel pad lit lookup">
      <div class="lookup-body">
        <div class="lookup-main">
          <Step n="01" title="Player" />
          <form class="lookup-form" onSubmit={look} role="search">
            <label class="sr-only" for="lk-name">Username</label>
            <span class="lk-input"><Icon name="search" /><input id="lk-name" ref={input} class="input" value={name} onInput={e => typeName(e.currentTarget.value)} placeholder="Username" maxLength={16} autocomplete="off" spellcheck={false} /></span>
            <button class="btn primary" type="submit" disabled={busy}>{busy ? 'Looking…' : 'Preview'}</button>
            {preview && <button class="btn ghost" type="button" onClick={clear}>Clear</button>}
          </form>
          {recent.length > 0 && !preview && (
            <div class="lk-recent" aria-label="Recent lookups">
              <span class="lk-recent-label">Recent</span>
              {recent.map(n => <button key={n} type="button" class="lk-recent-chip" onClick={() => { setName(n); look(null, n); }}><img src={`https://mc-heads.net/avatar/${enc(n)}/32`} alt="" width="18" height="18" loading="lazy" />{n}</button>)}
            </div>
          )}
          <ErrorBox error={error} />
          {!preview && <p class="lookup-hint">Preview someone's stats, then mark who beat them, flag them and add them.</p>}
          {preview && (
            <div class="lookup-add">
              {writable ? (
                <div class="add-form steps">
                  <Step n="02" title="Beaten by" extra={(() => { const c = ROSTER_KEYS.filter(k => beaten[k]).length; return c ? <span class="lk-count">{c} picked</span> : null; })()} />
                  <RosterPicker value={beaten} onChange={setBeaten} look="orbs" />
                  <Step n="03" title="Flags" />
                  <FlagPicker {...flags} onChange={setFlags} />
                  <Step n="04" title="Note" extra={<span class="lk-opt">optional</span>} />
                  <div class="field note-field">
                    <label class="sr-only" for="lk-note">Note</label>
                    <textarea id="lk-note" class="input" rows={2} maxLength={NOTE_MAX} value={note} onInput={e => setNote(e.currentTarget.value)} placeholder="What happened?" />
                    <div class="note-meta">{owner && <span class="lk-signed">Signed as <NoteAuthor id={owner} /></span>}<span class={`faint small ${note.length > NOTE_MAX - 20 ? 'warn' : ''}`}>{note.length}/{NOTE_MAX}</span></div>
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
                    <div class="add-row" ref={addRow}>
                      <button class="btn primary add-btn" type="button" disabled={saving} onClick={() => add(false)}><Icon name="check" />{saving ? 'Adding…' : `Add ${preview.name}`}</button>
                      {done && <span class="good small" role="status">Added. <button type="button" data-flip class="link" onClick={() => onOpen(done)}>Open</button></span>}
                    </div>
                  )}
                </div>
              ) : <p class="faint small">Checking your key…</p>}
            </div>
          )}
        </div>
        <div class="lookup-side">
          {!preview && !busy && !error && (
            <div class="lookup-idle" aria-hidden="true"><span class="beam b1" /><span class="beam b2" /><span class="beam b3" /><p>Look someone up to see their stats.</p></div>
          )}
          {busy && !preview && <div class="lookup-skel"><div class="skel" style={{ height: '160px' }} /></div>}

          {preview && <PreviewCard preview={preview} index={index} list={list} times={times} onOpen={onOpen} />}
        </div>
      </div>
    </div>
  );
}

const short = n => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : Math.round(n).toLocaleString());
const STAT_TILES = [
  ['FKDR', 'fkdr', 'c-fk', s => `${num(s.finals)} F · ${num(s.finalDeaths)} FD`],
  ['WLR', 'wlr', 'c-wl', s => `${num(s.wins)} W · ${num(s.losses)} L`],
  ['KDR', 'kdr', 'c-kd', s => `${num(s.kills)} K · ${num(s.deaths)} D`],
  ['BBLR', 'bblr', 'c-bb', s => `${num(s.beds)} B · ${num(s.bedsLost)} BL`]
];

function Step({ n, title, extra }) {
  return <div class="lk-step"><span class="lk-num">{n}</span><span class="lk-title">{title}</span>{extra}</div>;
}

// The preview: the skin on a lit stage, a threat ring with the tier, four
// coloured stat tiles and the player's tags.
function PreviewCard({ preview, index, list, times, onOpen }) {
  const st = preview.stats;
  const ti = tierIndex(index), t = TIERS[ti];
  const fill = gaugeOf(index);
  const tougher = useMemo(() => {
    const vals = list.map(x => indexOf(x)).filter(v => Number.isFinite(v) && v > 0);
    return vals.length >= 3 ? Math.round(vals.filter(v => v < index).length / vals.length * 100) : null;
  }, [list, index]);
  const stage = useRef(null);
  function tilt(e) {
    const el = stage.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--rx', `${((e.clientY - r.top) / r.height - 0.5) * -10}deg`);
    el.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 16}deg`);
    el.style.setProperty('--gx', `${(e.clientX - r.left) / r.width * 100}%`);
  }
  const untilt = () => { const el = stage.current; if (el) { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); } };
  const R = 50, C = 2 * Math.PI * R;
  return (
    <div class={`pv ${t.key}`}>
      <div class="pv-stage" ref={stage} onPointerMove={tilt} onPointerLeave={untilt}>
        <span class="pv-aura" aria-hidden="true" />
        <span class="pv-rays" aria-hidden="true" />
        <img class="pv-skin" src={`https://mc-heads.net/body/${preview.uuid}/240`} alt={`${preview.name}'s skin`} width="120" height="288" />
        <span class="pv-glare" aria-hidden="true" />
        <span class="pv-floor" aria-hidden="true" />
      </div>
      <div class="pv-main">
        <div class="pv-head">
          <PlayerName player={preview.player} name={preview.name} class="pv-name" />
          <span class="pv-star"><Star star={st.star} /></span>
          {times > 0 && <button type="button" class="chip accent" onClick={() => onOpen({ uuid: preview.uuid, username: preview.name })}>Tracked ×{times}</button>}
        </div>
        <div class="pv-threat" role="meter" aria-label="Player index" aria-valuemin={0} aria-valuemax={7} aria-valuenow={Math.log10(Math.max(1, index)).toFixed(2)} aria-valuetext={`${Math.round(index).toLocaleString()} (${t.name})`}>
          <div class="pv-ring">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle class="r-ticks" cx="60" cy="60" r="57" />
              <circle class="r-track" cx="60" cy="60" r={R} />
              <circle class="r-fill" cx="60" cy="60" r={R} style={{ strokeDasharray: `${C * fill} ${C}` }} />
            </svg>
            <div class="pv-ring-c"><b class="mono">{short(index)}</b><span>Index</span></div>
          </div>
          <div class="pv-tier">
            <span class="pv-kicker">Threat level</span>
            <span class="pv-tier-name">{t.name}</span>
            <span class="pv-tier-sub">{tougher != null ? `Tougher than ${tougher}% of tracked players` : `${Math.round(index).toLocaleString()} index`}</span>
            <span class="pv-segs" aria-hidden="true">{TIERS.map((x, i) => <i key={x.key} class={`${x.key} ${i <= ti ? 'on' : ''}`} />)}</span>
          </div>
        </div>
        <div class="pv-stats">
          {STAT_TILES.map(([label, f, cls, sub]) => (
            <div class={`pv-stat ${cls}`} key={f}>
              <span class="pv-stat-label">{label}</span>
              <span class="pv-stat-value mono">{fixed(st[f])}</span>
              <span class="pv-stat-sub">{sub(st)}</span>
              <Standing st={standing(list, f, st[f])} field={label} />
            </div>
          ))}
        </div>
        <TagList uuid={preview.uuid} compact />
      </div>
    </div>
  );
}
