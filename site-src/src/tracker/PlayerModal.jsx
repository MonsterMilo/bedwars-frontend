// The player popup: live stats against what we logged, our record against
// them, tags and notes.
import { useMemo, useState, useEffect } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { Star } from '../ui/mc.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { Loading, copyText } from '../ui/common.jsx';
import { get, enc } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { useSignal } from '../lib/signal.js';
import { keyOwner, keyInfo } from '../lib/key.js';
import { toast } from '../lib/toast.js';
import { playerUrl } from '../lib/players.js';
import { sweats } from './store.js';
import { cleanUuid, indexOf, beatenBy, parseDay, canEdit } from './model.js';
import { rivalMap, rivalFor, rivalSummary } from './list.js';
import { RosterDots, Flags, TierBadge, Gauge, fixed, whole } from './ui.jsx';
import { TagList } from './Tags.jsx';
import { Notes } from './Notes.jsx';
import { standing, Standing } from './Lookup.jsx';
import { MatchStats, Clips, Replays } from './Media.jsx';
import { flipOpen } from '../lib/fx.js';

// Every entry for this player, the opened one first.
export function entriesFor(all, target) {
  const u = cleanUuid(target.uuid);
  const name = String(target.username || '').toLowerCase();
  const list = all.filter(s => (u && cleanUuid(s.uuid) === u) || (!u && String(s.username || '').toLowerCase() === name));
  const opened = target._id && list.find(s => s._id === target._id);
  const rest = list.filter(s => s !== opened).sort((a, b) => (parseDay(b.dateAdded) || 0) - (parseDay(a.dateAdded) || 0));
  return opened ? [opened, ...rest] : rest;
}

function Delta({ live, logged, d = 0, suffix = '', when }) {
  const l = Number(live); const g = Number(logged);
  if (logged == null || logged === '' || !Number.isFinite(l) || !Number.isFinite(g)) return null;
  const f = 10 ** d;
  const delta = Math.round((l - g) * f) / f;
  const tone = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  return (
    <span class={`delta ${tone}`} title={`${g.toFixed(d)}${suffix} when we beat them${when ? ` on ${when}` : ''}`}>
      {delta === 0 ? 'No change' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(d)}${suffix}`}
    </span>
  );
}

function LiveStats({ uuid, rec, all }) {
  const { data, error, loading, reload } = useAsync(signal => get(`/stats/uuid/${uuid}`, { signal, maxAge: 60_000 }), [uuid], { skip: !uuid });
  const when = rec && parseDay(rec.dateAdded) ? parseDay(rec.dateAdded).toLocaleDateString() : '';
  if (loading) return <div class="mstats">{[1, 2, 3, 4, 5].map(i => <div key={i} class="mstat"><div class="skel" style={{ height: '12px', width: '50%' }} /><div class="skel" style={{ height: '26px', marginTop: '8px' }} /></div>)}</div>;
  const ok = data && Number.isFinite(Number(data.fkdr));
  if (error || !ok) {
    return (
      <div class="mstats-fallback">
        {rec && (
          <div class="mstats">
            <div class="mstat"><span class="mstat-label">Star (saved)</span><span class="mstat-value"><Star star={rec.star} /></span></div>
            <div class="mstat"><span class="mstat-label">FKDR (saved)</span><span class="mstat-value mono">{fixed(rec.fkdr)}</span></div>
            <div class="mstat"><span class="mstat-label">WLR (saved)</span><span class="mstat-value mono">{fixed(rec.wlr)}</span></div>
          </div>
        )}
        <div class="notice"><Icon name="info" /><span class="grow">{uuid ? `${(error && error.message) || 'Live stats unavailable.'}${rec ? ' Showing saved stats.' : ''}` : 'No UUID saved for this player.'}</span>{uuid && <button type="button" class="btn small" onClick={reload}><Icon name="refresh" />Try again</button>}</div>
      </div>
    );
  }
  const tile = (label, value, field, live, delta, c) => (
    <div class="mstat" style={{ '--c': c }}>
      <span class="mstat-label">{label}</span>
      <span class="mstat-value">{value}</span>
      {delta}
      {field && <Standing st={standing(all, field, live)} field={label} />}
    </div>
  );
  return (
    <>
      {data.currentName && data.originalName && data.currentName !== data.originalName && <p class="faint small">Now called <b>{data.currentName}</b> (was {data.originalName}).</p>}
      <div class="mstats">
        {tile('Star', <Star star={data.star} />, 'star', data.star, rec && <Delta live={data.star} logged={rec.star} suffix="★" when={when} />, 'var(--accent-3)')}
        {tile('FKDR', <span class="mono">{fixed(data.fkdr)}</span>, 'fkdr', data.fkdr, rec && <Delta live={data.fkdr} logged={rec.fkdr} d={2} when={when} />, 'var(--accent)')}
        {tile('WLR', <span class="mono">{fixed(data.wlr)}</span>, 'wlr', data.wlr, rec && <Delta live={data.wlr} logged={rec.wlr} d={2} when={when} />, 'var(--accent-2)')}
        {tile('Finals', <span class="mono">{whole(data.finals)}</span>, 'finals', data.finals, null, '#ff7a8a')}
        {tile('Wins', <span class="mono">{whole(data.wins)}</span>, null, null, null, '#5be39a')}
      </div>
    </>
  );
}

export function PlayerModal({ target, onClose, onEdit }) {
  const all = useSignal(sweats);
  useSignal(keyOwner); useSignal(keyInfo);
  const open = !!target;
  // Linked players without a UUID: ask Mojang.
  const needUuid = open && !target.uuid && target.username;
  const mojang = useAsync(signal => get(`/mojang/${enc(target.username)}`, { signal, maxAge: 10 * 60_000 }), [needUuid ? target.username : ''], { skip: !needUuid });
  const uuid = open ? (target.uuid || (mojang.data && mojang.data.id) || '') : '';
  const entries = useMemo(() => (open ? entriesFor(all, { ...target, uuid }) : []), [all, target, uuid]);
  const rec = entries[0] || null;
  const name = (rec && rec.username) || (mojang.data && mojang.data.name) || (target && target.username) || '';
  const rival = useMemo(() => (rec ? rivalFor(rivalMap(all), rec) : null), [all, rec]);
  const allBy = [...new Set(entries.flatMap(beatenBy))];
  const [shown, setShown] = useState(false);
  const who = target && (target._id || target.username);
  useEffect(() => { if (who) flipOpen(document.querySelector('dialog.player-dialog')); }, [who]);

  function copyLink() {
    const u = new URL(location.href);
    u.search = ''; u.searchParams.set('player', name); u.hash = '';
    copyText(u.toString(), toast);
  }

  return (
    <Dialog open={open} onClose={onClose} title={name || 'Player'} class="player-dialog" labelledBy="pm-title">
      {open && (
        <div class="pm">
          <div class="pm-top">
            <div class="pm-stage" aria-hidden="true">
              <img class={`pm-skin ${shown ? 'on' : ''}`} src={`https://mc-heads.net/body/${uuid || name}/220`} alt="" onLoad={() => setShown(true)} />
            </div>
            <div class="pm-main">
              <div class="pm-id">
                <div class="pm-name">{rec && <Star star={rec.star} />} <span>{name}</span></div>
                <div class="pm-actions">
                  <a class="btn small" href={playerUrl(name)}><Icon name="user" />Full profile</a>
                  <button type="button" class="btn small" onClick={copyLink}><Icon name="link" />Copy link</button>
                  {rec && canEdit(rec) && <button type="button" class="btn small" onClick={() => onEdit(rec)}><Icon name="settings" />Edit</button>}
                </div>
              </div>

              {needUuid && mojang.loading ? <Loading lines={3} /> : <LiveStats uuid={uuid} rec={rec} all={all} />}

              {rec && (
                <section class="pm-record" aria-label="Our record">
                  <div class="rec-item"><span class="rec-label">Beaten</span><b>{parseDay(rec.dateAdded) ? parseDay(rec.dateAdded).toLocaleDateString() : 'Unknown'}</b></div>
                  <div class="rec-item"><span class="rec-label">Index</span><span class="rec-line"><b class="mono">{whole(indexOf(rec))}</b><TierBadge index={indexOf(rec)} /></span></div>
                  <div class="rec-item"><span class="rec-label">Beaten by</span><RosterDots ids={allBy} /></div>
                  {entries.length > 1 && <div class="rec-item"><span class="rec-label">Times</span><b>{entries.length}</b></div>}
                  {rival && <div class="rec-item rec-rival"><Icon name="sword" /><span>Rival · {rivalSummary(rival)}</span></div>}
                  <Flags s={{ cheating: entries.some(e => e.cheating), boosting: entries.some(e => e.boosting) }} />
                  <div class="rec-gauge"><Gauge index={indexOf(rec)} /></div>
                </section>
              )}
            </div>
          </div>

          {uuid && <TagList uuid={uuid} />}
          {entries.length > 0 && <Notes entries={entries} />}
          {uuid && <MatchStats uuid={uuid} />}
          {uuid && <Clips uuid={uuid} name={name} />}
          {uuid && <Replays uuid={uuid} name={name} />}
          {!rec && <p class="faint small">Not on the tracked list.</p>}
        </div>
      )}
    </Dialog>
  );
}
