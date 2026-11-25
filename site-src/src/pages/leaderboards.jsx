// Leaderboards: Hypixel's Bed Wars boards (lifetime and weekly) and the
// daily ones Astrus keeps, with names and stars filled in.
import '../styles/base.css';
import '../styles/shell.css';
import '../styles/common.css';
import '../styles/leaderboards.css';
import { useState, useMemo } from 'preact/hooks';
import { mount } from '../lib/mount.js';
import { Shell } from '../ui/Shell.jsx';
import { Icon } from '../ui/icons.jsx';
import { PlayerName, Star } from '../ui/mc.jsx';
import { Tabs, Avatar, Loading, ErrorBox, Empty, HeadArt } from '../ui/common.jsx';
import { ItemIcon } from '../ui/items.jsx';
import { get } from '../lib/api.js';
import { useAsync, useParam } from '../lib/useAsync.js';
import { num, ago } from '../lib/format.js';
import { prefs } from '../lib/prefs.js';
import { useSignal } from '../lib/signal.js';
import { playerUrl } from '../lib/players.js';

const PERIODS = [['lifetime', 'Lifetime'], ['monthly', 'Month'], ['weekly', 'Week'], ['daily', 'Day']];
const STAT_ORDER = ['level', 'wins', 'finals'];

const PODIUM = { 1: 'block:gold', 2: 'block:diamond', 3: 'block:emerald' };

function Podium({ leaders }) {
  const top = leaders.slice(0, 3);
  if (top.length < 3) return null;
  const order = [top[1], top[0], top[2]];
  return (
    <ol class="podium" aria-label="Top three">
      {order.map(l => (
        <li key={l.uuid} class={`place p${l.rank}`}>
          <a href={playerUrl(l.uuid)} class="place-link">
            <span class="place-rank">{l.rank}</span>
            <img class="place-body" src={`https://mc-heads.net/body/${l.uuid}/${l.rank === 1 ? 150 : 120}`} alt="" loading="lazy" />
            <span class="place-block" aria-hidden="true"><ItemIcon id={PODIUM[l.rank]} /></span>
            <span class="place-name">{l.star != null && <Star star={l.star} />}{l.rankInfo ? <PlayerName player={l.rankInfo} name={l.name || '?'} rank={false} /> : <span class="mono">{l.name || 'Unknown'}</span>}</span>
            {l.value != null && <span class="place-value mono">{num(l.value)}</span>}
          </a>
        </li>
      ))}
    </ol>
  );
}

function Leaderboards() {
  const p = useSignal(prefs);
  const [period, setPeriod] = useParam('period', p.lbPeriod);
  const [stat, setStat] = useParam('stat', 'wins');
  const [q, setQ] = useState('');
  const { data, error, loading, reload } = useAsync(signal => get('/site/leaderboards', { signal, maxAge: 5 * 60_000 }), []);
  const boards = (data && data.boards) || [];
  const periods = PERIODS.map(([id, label]) => [id, label, !boards.some(b => b.period === id)]).filter(x => !x[2] || x[0] !== 'monthly');
  const stats = [...new Set(boards.filter(b => b.period === period).map(b => b.stat))].sort((a, b) => STAT_ORDER.indexOf(a) - STAT_ORDER.indexOf(b));
  const board = boards.find(b => b.period === period && b.stat === stat) || boards.find(b => b.period === period);
  const leaders = board ? board.leaders : [];
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? leaders.filter(l => (l.name || '').toLowerCase().includes(s)) : leaders;
  }, [board, q]);
  const hasValues = leaders.some(l => l.value != null);

  return (
    <Shell bg="leaderboards">
      <div class="page wrap">
        <header class="page-head">
          <div class="grow">
            <p class="eyebrow"><ItemIcon id="block:gold" />Leaderboards</p>
            <h1>Top Bed Wars players</h1>
            {data && <p class="faint small lb-src">From {data.source}{boards.some(b => b.period === 'daily') ? ' and Astrus' : ''} · updated {ago(data.at)}</p>}
          </div>
          <HeadArt items={['block:gold', 'ui:totem', 'res:gold']} />
        </header>

        {loading && !data && <div class="panel pad"><Loading lines={8} label="Loading leaderboards" /></div>}
        <ErrorBox error={error} onRetry={reload} what="the leaderboards" />

        {data && (
          <>
            <div class="lb-tools">
              <Tabs label="Period" value={board ? board.period : period} onChange={setPeriod} options={periods} />
              <Tabs label="Stat" value={board ? board.stat : stat} onChange={setStat} options={stats.map(s => [s, (boards.find(b => b.stat === s) || {}).title || s])} />
              <input class="input lb-search" type="search" placeholder="Find a name" value={q} onInput={e => setQ(e.currentTarget.value)} aria-label="Find a name on this board" />
            </div>
            {!board && <div class="panel pad"><Empty icon="trophy">No board for this period yet.</Empty></div>}
            {board && !q && <Podium leaders={leaders} />}
            {board && (
              <section class="panel pad" aria-label={`${board.title}, ${board.period}`}>
                <div class="table-wrap">
                  <table class="table lb">
                    <thead><tr><th class="num">#</th><th>Player</th><th class="num">Star</th>{hasValues && <th class="num">{board.title}</th>}</tr></thead>
                    <tbody>
                      {shown.map(l => (
                        <tr key={l.uuid} class={l.rank <= 3 ? `top top${l.rank}` : ''}>
                          <td class="num rank">{l.rank <= 3 ? <span class={`medal m${l.rank}`}>{l.rank}</span> : l.rank}</td>
                          <td>
                            <span class="player-cell">
                              <a href={playerUrl(l.uuid)}>
                                <Avatar id={l.uuid} size={24} />
                                {l.rankInfo ? <PlayerName player={l.rankInfo} name={l.name || '?'} /> : <span class="mono faint">{l.name || 'Unknown'}</span>}
                              </a>
                            </span>
                          </td>
                          <td class="num">{l.star != null ? <Star star={l.star} /> : '—'}</td>
                          {hasValues && <td class="num">{num(l.value)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!shown.length && <Empty>No one on this board matches.</Empty>}
              </section>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}

mount(<Leaderboards />);
