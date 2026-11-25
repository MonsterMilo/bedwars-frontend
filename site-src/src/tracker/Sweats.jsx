// Defeated Sweats: summary, sweat of the day, filters and the three views.
import { useState, useMemo, useEffect, useRef } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Star } from '../ui/mc.jsx';
import { Tabs, Avatar, Empty } from '../ui/common.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { useSignal } from '../lib/signal.js';
import { season } from '../lib/prefs.js';
import { keyOwner, keyInfo } from '../lib/key.js';
import { toast } from '../lib/toast.js';
import { sweats, loadState, liveIds, load, removeSweat } from './store.js';
import { ROSTER, indexOf, identityKey, notesOf, beatenBy, parseDay, canRemove, canEdit } from './model.js';
import { DEFAULT_FILTERS, SORTS, process, paginate, activeFilterCount, rivalMap, rivalFor, rivalSummary, roman, rosterCounts, summary, sweatOfTheDay, sotdLeft, downloadCsv, PAGE_SIZE } from './list.js';
import { RosterDot, RosterDots, Flags, TierBadge, fixed, whole } from './ui.jsx';
import { readUrl, writeUrl } from './url.js';
import { NumberField, DateField, Check, Select } from '../ui/controls.jsx';

const VIEWS = [['grid', 'Grid'], ['table', 'Table'], ['leaderboard', 'Leaderboard']];
const ORD = n => n + (['th', 'st', 'nd', 'rd'][((n % 100) - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const dayText = d => { const x = parseDay(d); return x ? x.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown'; };

// ---------- summary ----------
function PlayerTile({ cls, label, s, children, onOpen }) {
  return (
    <button type="button" data-flip class={`ss-tile ss-player ${cls}`} onClick={() => onOpen(s)} aria-label={`${label}: ${s.username}. View their stats`}>
      <span class="ss-label">{label}</span>
      <span class="ss-value">{children}</span>
      <span class="ss-who"><Avatar id={s.uuid || s.username} size={18} />{s.username}</span>
    </button>
  );
}
function Summary({ list, person, onOpen }) {
  const sm = useMemo(() => summary(list), [list]);
  if (!sm) return person ? <div class="ss"><div class="ss-tile"><span class="ss-label">Beaten by {person}</span><span class="ss-value">0</span><span class="faint small">Nobody matching these filters yet</span></div></div> : null;
  const pct = n => `${(n / sm.total * 100).toFixed(1)}%`;
  return (
    <div class="ss" aria-label="Summary">
      <div class="ss-tile ss-total">
        <span class="ss-label">{person ? `Beaten by ${person}` : 'Players beaten'}</span>
        <span class="ss-value">{sm.total.toLocaleString()}</span>
        <span class="faint small">{sm.recent ? <><b class="good">+{sm.recent}</b> in 30 days</> : 'None in 30 days'}</span>
      </div>
      <PlayerTile cls="ss-star" label="Highest star" s={sm.topStar} onOpen={onOpen}><Star star={sm.topStar.star} /></PlayerTile>
      <PlayerTile cls="ss-fkdr" label="Best FKDR" s={sm.topFkdr} onOpen={onOpen}>{fixed(sm.topFkdr.fkdr)}</PlayerTile>
      <PlayerTile cls="ss-index" label="Top index" s={sm.topIndex} onOpen={onOpen}>{whole(indexOf(sm.topIndex))}</PlayerTile>
      <div class="ss-tile ss-flags">
        <span class="ss-label">Flagged</span>
        <span class="ss-value">{Math.round(sm.flagged / sm.total * 100)}%</span>
        <span class="flag-bar" aria-hidden="true"><span class="cheat" style={{ width: pct(sm.cheats) }} /><span class="boost" style={{ width: pct(sm.boosts) }} /></span>
        <span class="flag-legend"><span class="cheat"><i />{sm.cheats} cheating</span><span class="boost"><i />{sm.boosts} boosting</span></span>
      </div>
    </div>
  );
}

// ---------- sweat of the day ----------
export function Sotd({ onOpen }) {
  const all = useSignal(sweats);
  const pick = useMemo(() => sweatOfTheDay(all), [all]);
  const holiday = useSignal(season);
  const [left, setLeft] = useState(sotdLeft());
  useEffect(() => { const t = setInterval(() => setLeft(sotdLeft()), 30_000); return () => clearInterval(t); }, []);
  if (!pick) return null;
  const s = pick.sweat;
  const index = indexOf(s);
  return (
    <section class="panel sotd" aria-labelledby="sotd-h">
      <img class="sotd-body" src={`https://mc-heads.net/body/${s.uuid || s.username}/140`} alt="" loading="lazy" />
      <div class="sotd-main">
        <p class="eyebrow"><Icon name="star" />{holiday === 'christmas' ? 'Top of the naughty list' : 'In the spotlight'}</p>
        <h2 id="sotd-h" class="sotd-name"><Star star={s.star} /> <button type="button" data-flip class="link" onClick={() => onOpen(s)}>{s.username}</button></h2>
        <div class="sotd-sub">
          <TierBadge index={index} />
          <span class="faint small">Beaten {pick.times}× since {dayText(pick.first)}</span>
          <RosterDots ids={pick.by} />
        </div>
        <div class="sotd-stats">
          {pick.stats.map(([label, v, pct, d]) => (
            <div key={label} class="sotd-stat">
              <span class="faint small">{label}</span>
              <b class="mono">{Number.isFinite(v) ? (d ? v.toFixed(d) : Math.round(v).toLocaleString()) : '—'}</b>
              <span class="sotd-bar" title={`Higher than ${pct}% of tracked players`}><span style={{ width: `${pct}%` }} /></span>
            </div>
          ))}
        </div>
        {pick.note && <p class="sotd-note">“{pick.note.text}”</p>}
      </div>
      <p class="sotd-clock faint small">Next spotlight in <b>{left}</b></p>
    </section>
  );
}

// ---------- filters ----------
function Filters({ f, set, count, total, onReset }) {
  const [open, setOpen] = useState(activeFilterCount(f) > 0);
  const n = activeFilterCount(f);
  const num = (k, label, ph, step) => (
    <div class="field">
      <label for={`f-${k}`}>{label}</label>
      <NumberField id={`f-${k}`} decimals={String(step).includes('.')} step={Number(step)} max={1e9} placeholder={ph} value={f[k]} onChange={v => set({ [k]: v })} />
    </div>
  );
  return (
    <div class="filters">
      <div class="filters-top">
        <div class="search-box">
          <Icon name="search" />
          <label class="sr-only" for="f-q">Search names and notes</label>
          <input id="f-q" class="input" type="search" placeholder="Search names and notes" value={f.q} onInput={e => set({ q: e.currentTarget.value })} />
        </div>
        <button type="button" class={`btn ${open ? 'on' : ''}`} aria-expanded={open} aria-controls="filter-panel" onClick={() => setOpen(!open)}>
          <Icon name="settings" />Filters{n > 0 && <span class="count-badge">{n}</span>}
        </button>
        <span class="faint small result-count" role="status">{count === total ? `${total.toLocaleString()} tracked` : `${count.toLocaleString()} of ${total.toLocaleString()} match`}</span>
      </div>
      {open && (
        <div class="filter-panel" id="filter-panel">
          {num('stars', 'Stars at least', '0', '1')}
          {num('fkdr', 'FKDR at least', '0', '0.1')}
          {num('index', 'Index at least', '0', '1000')}
          <div class="field">
            <label for="f-date">Added since</label>
            <DateField id="f-date" label="Added since" placeholder="Any time" max={Date.now()} value={f.date} onChange={v => set({ date: v })} />
          </div>
          <div class="toggles" role="group" aria-label="Show">
            {[['dupes', 'Hide repeats'], ['cheaters', 'Cheaters only'], ['boosters', 'Boosters only']].map(([k, label]) => (
              <Check key={k} checked={f[k]} onChange={v => set({ [k]: v })}>{label}</Check>
            ))}
          </div>
          <button type="button" class="btn ghost small" disabled={!n && !f.q} onClick={onReset}><Icon name="refresh" />Reset</button>
        </div>
      )}
    </div>
  );
}

// ---------- items ----------
function Actions({ s, onEdit, onRemove }) {
  const showEdit = canEdit(s); const showRemove = canRemove(s);
  if (!showEdit && !showRemove) return null;
  return (
    <span class="item-actions">
      {showEdit && <button type="button" class="btn icon small ghost" aria-label={`Edit ${s.username}`} title="Edit" onClick={e => { e.stopPropagation(); onEdit(s); }}><Icon name="settings" /></button>}
      {showRemove && <button type="button" class="btn icon small ghost danger" aria-label={`Remove ${s.username}`} title="Remove" onClick={e => { e.stopPropagation(); onRemove(s); }}><Icon name="close" /></button>}
    </span>
  );
}

function Card({ s, count, rival, live, onOpen, onEdit, onRemove, i }) {
  const index = indexOf(s);
  const notes = notesOf(s);
  const last = notes[notes.length - 1];
  return (
    <article class={`card sweat-card ${s.cheating ? 'is-cheat' : ''} ${live ? 'is-live' : ''} ${rival ? 'is-rival' : ''}`} style={{ '--i': Math.min(i, 20) }}>
      <button type="button" data-flip class="card-hit" onClick={() => onOpen(s)} aria-label={`${s.username}, ${Math.floor(Number(s.star) || 0)} stars. View their stats`} />
      <div class="card-top">
        <Avatar id={s.uuid || s.username} size={40} />
        <div class="card-id">
          <div class="card-name"><Star star={s.star} /> <span class="nm">{s.username}</span>{count > 1 && <span class="chip small-chip" title={`Beaten ${count} times`}>×{count}</span>}</div>
          <div class="card-meta"><TierBadge index={index} /><span class="faint small">{dayText(s.dateAdded)}</span></div>
        </div>
        <Actions s={s} onEdit={onEdit} onRemove={onRemove} />
      </div>
      <div class="card-stats">
        <span><small>FKDR</small><b class="mono">{fixed(s.fkdr)}</b></span>
        <span><small>WLR</small><b class="mono">{fixed(s.wlr)}</b></span>
        <span><small>Index</small><b class="mono">{whole(index)}</b></span>
      </div>
      <div class="card-foot">
        <RosterDots ids={beatenBy(s)} empty="" />
        <Flags s={s} />
        {rival && <span class="rival-mark" title={`Rival · ${rivalSummary(rival)}`}><Icon name="sword" />{roman(rival.games)}</span>}
      </div>
      {last && <p class="card-note" title={last.text}><Icon name="list" />{last.text}{notes.length > 1 && <span class="faint"> +{notes.length - 1}</span>}</p>}
    </article>
  );
}

const COLS = [['star', 'Stars', true], ['username', 'Player', false], ['fkdr', 'FKDR', true], ['wlr', 'WLR', true], ['index', 'Index', true], ['cheating', 'Flags', true], ['dateAdded', 'Added', true]];
function Table({ items, counts, sort, setSort, live, onOpen, onEdit, onRemove }) {
  const head = (field, label, sortable) => {
    const on = sort && sort.field === field;
    return (
      <th key={field} scope="col" class={['star', 'fkdr', 'wlr', 'index'].includes(field) ? 'num' : ''} aria-sort={on ? (sort.asc ? 'ascending' : 'descending') : undefined}>
        {sortable ? <button type="button" class={`th-sort ${on ? 'on' : ''}`} onClick={() => setSort(on ? (sort.asc ? { field, asc: false } : null) : { field, asc: field === 'username' })}>{label}<Icon name="down" class={on && sort.asc ? 'up' : ''} /></button> : label}
      </th>
    );
  };
  return (
    <div class="table-wrap">
      <table class="table sweat-table">
        <thead><tr>{COLS.map(c => head(...c))}<th scope="col">Beaten by</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {items.map(s => {
            const n = counts[identityKey(s)] || 1;
            return (
              <tr key={s._id} data-flip class={live.has(s._id) ? 'is-live' : ''} onClick={() => onOpen(s)}>
                <td class="num"><Star star={s.star} /></td>
                <td><span class="player-cell"><Avatar id={s.uuid || s.username} size={24} /><button type="button" data-flip class="link-plain" onClick={e => { e.stopPropagation(); onOpen(s); }}>{s.username}</button>{n > 1 && <span class="chip small-chip">×{n}</span>}{notesOf(s).length > 0 && <Icon name="list" class="faint" />}</span></td>
                <td class="num mono">{fixed(s.fkdr)}</td>
                <td class="num mono">{fixed(s.wlr)}</td>
                <td class="num mono">{whole(indexOf(s))}</td>
                <td><Flags s={s} /></td>
                <td class="faint small nowrap">{dayText(s.dateAdded)}</td>
                <td><RosterDots ids={beatenBy(s)} empty="" /></td>
                <td><Actions s={s} onEdit={onEdit} onRemove={onRemove} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Ranking({ list, picked, setPicked }) {
  const ranked = rosterCounts(list);
  const top = Math.max(1, ranked[0] ? ranked[0].n : 1);
  return (
    <div class="ranking" role="group" aria-label="Pick who to show (pick more to compare)">
      {ranked.map(r => {
        const on = picked.includes(r.key);
        return (
          <button key={r.key} type="button" class={`rank-entry ${on ? 'on' : ''}`} style={{ '--c': ROSTER[r.key].color, '--share': r.n / top }} aria-pressed={on}
            aria-label={`${ORD(r.place)} place: ${ROSTER[r.key].label}, ${r.n} ${r.n === 1 ? 'player' : 'players'}`}
            onClick={() => { if (!on) setPicked([...picked, r.key]); else if (picked.length > 1) setPicked(picked.filter(p => p !== r.key)); }}>
            <span class="rank-place" data-medal={r.n > 0 && r.place <= 3 ? r.place : undefined}>{r.place}</span>
            <RosterDot id={r.key} size={30} />
            <span class="rank-name">{ROSTER[r.key].label}</span>
            <span class="rank-count"><b>{r.n}</b> {r.n === 1 ? 'player' : 'players'}</span>
            <span class="rank-bar" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function Pager({ page, pages, set }) {
  if (pages <= 1) return null;
  const nums = [...new Set([1, page - 1, page, page + 1, pages].filter(n => n >= 1 && n <= pages))].sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => { if (i && n - nums[i - 1] > 1) out.push(<span key={`g${n}`} class="faint">…</span>); out.push(<button key={n} type="button" class={`btn small ${n === page ? 'primary' : ''}`} aria-current={n === page ? 'page' : undefined} onClick={() => set(n)}>{n}</button>); });
  return (
    <nav class="pager" aria-label="Pages">
      <button type="button" class="btn small" disabled={page <= 1} onClick={() => set(page - 1)} aria-label="Previous page"><Icon name="chevron" class="flip" /></button>
      {out}
      <button type="button" class="btn small" disabled={page >= pages} onClick={() => set(page + 1)} aria-label="Next page"><Icon name="chevron" /></button>
    </nav>
  );
}

function Skeletons() {
  return <div class="card-grid">{Array.from({ length: 8 }, (_, i) => <div key={i} class="card sweat-card skel-card"><div class="skel" style={{ height: '40px', width: '60%' }} /><div class="skel" style={{ height: '36px' }} /><div class="skel" style={{ height: '14px', width: '40%' }} /></div>)}</div>;
}

// ---------- the section ----------
export function Sweats({ onOpen, onEdit }) {
  const all = useSignal(sweats);
  const ls = useSignal(loadState);
  const live = useSignal(liveIds);
  useSignal(keyOwner); useSignal(keyInfo); // permissions follow the key
  const init = useRef(readUrl()).current;
  const [f, setF] = useState(init.filters);
  const [sort, setSortState] = useState(init.sort);
  const [view, setViewState] = useState(init.view);
  const [picked, setPickedState] = useState(init.lb);
  const [page, setPageState] = useState(init.page);
  const [removing, setRemoving] = useState(null);
  const top = useRef(null);

  const setFilters = ch => { const next = { ...f, ...ch }; setF(next); setPageState(1); writeUrl({ filters: next, page: 1 }); };
  const reset = () => { setF({ ...DEFAULT_FILTERS }); setPageState(1); writeUrl({ filters: DEFAULT_FILTERS, page: 1 }); };
  const setSort = s => { setSortState(s); writeUrl({ sort: s }); };
  const setView = v => { setViewState(v); setPageState(1); writeUrl({ view: v, page: 1 }); };
  const setPicked = p => { setPickedState(p); setPageState(1); writeUrl({ lb: p, page: 1 }); };
  const setPage = p => { setPageState(p); writeUrl({ page: p }); if (top.current) top.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  const { list, counts } = useMemo(() => process(all, f, sort), [all, f, sort]);
  const rivals = useMemo(() => rivalMap(all), [all]);
  const ranked = useMemo(() => (view === 'leaderboard' ? rosterCounts(list) : []), [view, list]);
  const people = view === 'leaderboard' ? (picked.length ? picked : ranked[0] ? [ranked[0].key] : []) : [];
  const lbList = useMemo(() => (view === 'leaderboard' ? list.filter(s => people.every(k => s[k])) : list), [view, list, people.join()]);
  const shown = view === 'leaderboard' ? lbList : list;
  const pg = paginate(shown, page);
  const pickedLabel = people.map(k => ROSTER[k].label).join(' & ');

  useEffect(() => { if (pg.page !== page && all.length) setPageState(pg.page); }, [pg.page]);

  async function confirmRemove() {
    const s = removing;
    setRemoving(null);
    try { await removeSweat(s._id); toast(`Removed ${s.username}`); } catch (err) { toast(err.message || 'Couldn\'t remove that one'); }
  }

  const loading = ls.state === 'loading' && !all.length;
  return (
    <div class="sweats" ref={top}>
      <div class="section-bar">
        <Tabs label="View" value={view} onChange={setView} options={VIEWS} />
        {view !== 'table' && (
          <div class="sort-pick">
            <Select label="Sort by" small value={sort ? `${sort.field}:${sort.asc ? 'asc' : 'desc'}` : ''}
              onChange={v => setSort(v ? { field: v.split(':')[0], asc: v.endsWith('asc') } : null)}
              options={[['', 'Newest first'], ...SORTS.map(([k, label]) => [`${k}:desc`, `${label}: high to low`]),
                ...SORTS.filter(([k]) => !['cheating', 'boosting'].includes(k)).map(([k, label]) => [`${k}:asc`, `${label}: low to high`])]} />
          </div>
        )}
        <button type="button" class="btn" disabled={!shown.length} onClick={() => { downloadCsv(shown); toast(`Exported ${shown.length} player${shown.length === 1 ? '' : 's'}`); }}><Icon name="download" />CSV</button>
      </div>

      {ls.state === 'saved' && (
        <div class="notice" role="status">
          <Icon name="info" />
          <span class="grow">{ls.waking ? 'Showing the saved list while the server wakes up.' : navigator.onLine === false ? 'You\'re offline. This is the saved list.' : 'Couldn\'t reach the server. This is the saved list.'} Saved {new Date(ls.savedAt).toLocaleString()}.</span>
          {!ls.waking && <button type="button" class="btn small" onClick={() => load({ quiet: true })}><Icon name="refresh" />Retry</button>}
        </div>
      )}
      {ls.state === 'error' && (
        <div class="notice bad" role="alert"><Icon name="alert" /><span class="grow">{ls.error && ls.error.message || 'Couldn\'t load the list.'}</span><button type="button" class="btn small" onClick={() => load()}><Icon name="refresh" />Retry</button></div>
      )}

      {!loading && <Summary list={shown} person={view === 'leaderboard' ? pickedLabel : null} onOpen={onOpen} />}
      <Filters f={f} set={setFilters} count={list.length} total={all.length} onReset={reset} />

      {loading && <><p class="faint small" role="status">{ls.progress ? `Loading players… ${ls.progress[0]} of ${ls.progress[1]}` : 'Loading players…'}</p><Skeletons /></>}

      {!loading && view === 'leaderboard' && (
        <>
          <Ranking list={list} picked={people} setPicked={setPicked} />
          <h3 class="lb-title">{people.length > 1 ? `Beaten by ${pickedLabel} together` : `${pickedLabel}'s players`} <span class="faint">({lbList.length})</span></h3>
          <p class="faint small">Tap more names to see who you beat together.</p>
        </>
      )}

      {!loading && !shown.length && all.length > 0 && <Empty icon="search">Nobody matches these filters.</Empty>}
      {!loading && !all.length && ls.state === 'ready' && <Empty icon="trophy">No players yet. Look someone up to add the first.</Empty>}

      {!loading && shown.length > 0 && (view === 'grid'
        ? <div class="card-grid">{pg.items.map((s, i) => <Card key={s._id} i={i} s={s} count={counts[identityKey(s)] || 1} rival={rivalFor(rivals, s)} live={live.has(s._id)} onOpen={onOpen} onEdit={onEdit} onRemove={setRemoving} />)}</div>
        : <Table items={pg.items} counts={counts} sort={sort} setSort={setSort} live={live} onOpen={onOpen} onEdit={onEdit} onRemove={setRemoving} />)}
      {!loading && <Pager page={pg.page} pages={pg.pages} set={setPage} />}
      {!loading && shown.length > PAGE_SIZE && <p class="faint small center">Showing {(pg.page - 1) * PAGE_SIZE + 1}–{Math.min(pg.page * PAGE_SIZE, shown.length)} of {shown.length.toLocaleString()}</p>}

      <Dialog open={!!removing} onClose={() => setRemoving(null)} title="Remove player?" class="small-dialog">
        {removing && (
          <div class="confirm">
            <p>Remove <b>{removing.username}</b> ({dayText(removing.dateAdded)}) from the list?</p>
            <div class="dialog-actions">
              <button type="button" class="btn" onClick={() => setRemoving(null)}>Cancel</button>
              <button type="button" class="btn danger-solid" onClick={confirmRemove}><Icon name="close" />Remove</button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
