// What we recorded with a player: match stats, clips and full replays.
import { useState, useEffect } from 'preact/hooks';
import { Icon } from '../ui/icons.jsx';
import { get, enc } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { quietMusic } from '../lib/audio.js';

const TEAM = { Red: '#ff5555', Blue: '#5577ff', Green: '#3fcf5f', Yellow: '#e8c930', Aqua: '#3fd6d6', White: '#c9ced8', Pink: '#ff66d0', Gray: '#9aa0a8' };
const mmss = ms => { const s = Math.round((ms || 0) / 1000); return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; };
const when = (t, opts) => { const d = t ? new Date(t) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleString([], opts) : ''; };

// Signed links expire, so ask for one only when someone clicks.
async function download(path, setErr) {
  setErr('');
  try { const { url } = await get(path, { maxAge: 0 }); if (url) location.href = url; } catch (e) { setErr(e.message || 'Couldn\'t get the file.'); }
}

function Section({ icon, title, count, children }) {
  return (
    <section class="media">
      <h3 class="media-h"><Icon name={icon} />{title}<span class="count-badge">{count}</span></h3>
      {children}
    </section>
  );
}

export function MatchStats({ uuid }) {
  const { data } = useAsync(signal => get(`/match-stats?uuid=${enc(uuid)}`, { signal, maxAge: 5 * 60_000 }), [uuid], { skip: !uuid });
  const [all, setAll] = useState(false);
  const games = (data && data.games) || [];
  if (!games.length) return null;
  return (
    <Section icon="sword" title="Games we recorded" count={games.length}>
      <ul class="match-list">
        {(all ? games : games.slice(0, 3)).map((g, i) => (
          <li key={g.id || i} class="match">
            <div class="match-head">
              <b>{when(g.playedAt, { month: 'short', day: 'numeric' }) || 'Game'}</b>
              <span class="faint small">{[g.mode, g.map, g.durationMs ? `${Math.round(g.durationMs / 60000)}m` : null, g.nick ? `as ${g.nick}` : null].filter(Boolean).join(' · ')}</span>
              {g.result && <span class={`chip small-chip ${g.result === 'win' ? 'good' : g.result === 'left' ? '' : 'bad'}`}>{g.result === 'win' ? 'Win' : g.result === 'left' ? 'Left' : 'Loss'}</span>}
            </div>
            <div class="table-wrap">
              <table class="table match-table">
                <thead><tr><th scope="col">Player</th><th class="num" title="Kills / deaths">K/D</th><th class="num">Finals</th><th class="num">Beds</th><th class="num" title="Diamonds picked up">Dia</th><th class="num" title="Emeralds picked up">Em</th><th class="num" title="Time on an enemy island while their bed was alive and one of them was there">Pressure</th></tr></thead>
                <tbody>
                  {(g.players || []).map((p, j) => (
                    <tr key={j} class={p.me ? 'me' : ''}>
                      <td class={p.finalDeath ? 'out' : ''} title={p.finalDeath ? 'Final killed in this game' : undefined}>{p.name}</td>
                      <td class="num">{p.kills}/{p.deaths}</td><td class="num">{p.finals}</td><td class="num">{p.beds}</td><td class="num">{p.dia}</td><td class="num">{p.em}</td><td class="num">{mmss(p.pressureMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </li>
        ))}
      </ul>
      {games.length > 3 && !all && <button type="button" class="btn small" onClick={() => setAll(true)}>Show all {games.length}</button>}
    </Section>
  );
}

export function Clips({ uuid, name }) {
  const q = `/clips?uuid=${enc(uuid)}${/^\w{1,16}$/.test(name || '') ? `&name=${enc(name)}` : ''}`;
  const { data } = useAsync(signal => get(q, { signal, maxAge: 5 * 60_000 }), [q], { skip: !uuid });
  const [active, setActive] = useState(null);
  const [err, setErr] = useState('');
  // The music sits well under a playing clip.
  useEffect(() => { quietMusic(!!active); return () => quietMusic(false); }, [active]);
  if (!data) return null;
  const items = [...(data.clips || []).map(c => ({ c, other: false })), ...(data.sameGame || []).map(c => ({ c, other: true }))];
  if (!items.length) return null;
  const games = new Map();
  for (const it of items) { const g = String(it.c.game || it.c.replayId || it.c.id); if (!games.has(g)) games.set(g, []); games.get(g).push(it); }
  const ordered = [...games.values()].flatMap((l, gi) => l.sort((a, b) => (a.c.at || 0) - (b.c.at || 0)).map((it, i) => ({ ...it, start: gi > 0 && i === 0 })));
  const label = c => (c.kind === 'bed' ? 'Bed break' : c.kind === 'manual' ? 'Clip' : 'Final kill');
  const line = (c, other) => {
    if (c.kind === 'manual') return c.title || (c.follow ? `Following ${c.follow}` : (c.people || []).map(p => p.name).slice(0, 3).join(', '));
    const real = (other ? c.username : c.username || name) || c.victim || '';
    return c.victim && real && c.victim.toLowerCase() !== real.toLowerCase() ? `${real} (as ${c.victim})` : real;
  };
  return (
    <Section icon="film" title="Clips" count={items.length}>
      {active && (
        <div class="clip-stage">
          <iframe src={`replay.html?clip=${enc(active.id)}&embed=1`} title={label(active)} allow="autoplay; fullscreen" />
          <div class="clip-bar">
            <a class="btn small" href={`replay.html?clip=${enc(active.id)}`} target="_blank" rel="noopener"><Icon name="external" />Open full</a>
            <button type="button" class="btn small" onClick={() => download(`/clips/${enc(active.id)}/link`, setErr)}><Icon name="download" />Download</button>
            <button type="button" class="btn small ghost" onClick={() => setActive(null)}><Icon name="close" />Close</button>
          </div>
        </div>
      )}
      {err && <p class="bad small" role="alert">{err}</p>}
      <ul class="clip-strip">
        {ordered.map(({ c, other, start }) => (
          <li key={c.id} class={start ? 'game-start' : ''}>
            <button type="button" class={`clip-card ${other ? 'other' : ''} ${active && active.id === c.id ? 'on' : ''}`} style={{ '--team': TEAM[c.team] || 'var(--line-3)' }} onClick={() => setActive(c)} aria-label={`${label(c)}: ${line(c, other)}`}>
              <span class="clip-kind"><Icon name={c.kind === 'bed' ? 'bed' : c.kind === 'manual' ? 'film' : 'sword'} />{label(c)}</span>
              <span class="clip-who">{line(c, other)}</span>
              {c.by && c.source !== 'site' && <span class="faint small">{c.kind === 'bed' ? 'by' : c.kind === 'manual' ? 'clipped by' : 'killed by'} {c.by}</span>}
              <span class="faint small">{when(c.playedAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function Replays({ uuid, name }) {
  const { data } = useAsync(signal => get(`/replays?uuid=${enc(uuid)}`, { signal, maxAge: 5 * 60_000 }), [uuid], { skip: !uuid });
  const [err, setErr] = useState('');
  const list = (data && data.replays) || [];
  if (!list.length) return null;
  return (
    <Section icon="history" title="Replays" count={list.length}>
      <ul class="replay-list">
        {list.map(r => {
          const others = (r.players || []).map(p => p.username).filter(n => n && n.toLowerCase() !== String(name || '').toLowerCase());
          return (
            <li key={r.id}>
              <span class="grow">
                <b>{when(r.playedAt, { dateStyle: 'medium', timeStyle: 'short' }) || 'Game'}</b>
                <span class="faint small">{[r.mode, r.map, mmss(r.durationMs), `${((r.sizeBytes || 0) / 1048576).toFixed(1)} MB`, others.length ? `with ${others.join(', ')}` : null].filter(Boolean).join(' · ')}</span>
              </span>
              <a class="btn small primary" href={`replay.html?id=${enc(r.id)}`} target="_blank" rel="noopener">Watch</a>
              <button type="button" class="btn small" onClick={() => download(`/replays/${enc(r.id)}/link`, setErr)}><Icon name="download" /><span class="sr-only">Download</span></button>
            </li>
          );
        })}
      </ul>
      {err && <p class="bad small" role="alert">{err}</p>}
      <p class="faint small">Watch opens the 3D replay viewer. Download gets the .mcpr for Replay Mod.</p>
    </Section>
  );
}
