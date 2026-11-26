// Guild page: a guild's header and its members ranked by stars, FKDR,
// weekly guild XP or rank. Light on the Hypixel key: the backend asks
// Hypixel once per guild, only for visitors with a key, and saves it for
// 6 hours; member stats come from a saved bulk copy.
import '../styles/base.css';
import '../styles/shell.css';
import '../styles/common.css';
import '../styles/guild.css';
import { useState, useMemo, useEffect } from 'preact/hooks';
import { mount } from '../lib/mount.js';
import { Shell } from '../ui/Shell.jsx';
import { Icon } from '../ui/icons.jsx';
import { PlayerName, Star, Segments } from '../ui/mc.jsx';
import { Tabs, Stat, Avatar, Loading, ErrorBox, Empty, HeadEmblem } from '../ui/common.jsx';
import { ItemIcon } from '../ui/items.jsx';
import { get, enc } from '../lib/api.js';
import { useAsync, useParam } from '../lib/useAsync.js';
import { num, ratio, ratioValue, date, ago } from '../lib/format.js';
import { useSignal } from '../lib/signal.js';
import { playerUrl } from '../lib/players.js';
import { COLOR_NAMES } from '../lib/mc.js';
import { keyDialog, siteKey } from '../lib/key.js';
import { readJson, writeJson } from '../lib/storage.js';

const GUILD_RE = /^[A-Za-z0-9 ]{1,32}$/;
const PLAYER_RE = /^[A-Za-z0-9_]{1,16}$/;
const RECENT = 'prismRecentGuilds';
const guildUrl = name => `guild.html?name=${enc(name)}`;
const isMaster = r => /^guild ?master$/i.test(String(r || ''));
const short = n => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : num(n));
const GAMES = { BEDWARS: 'Bed Wars', SKYWARS: 'SkyWars', DUELS: 'Duels', BUILD_BATTLE: 'Build Battle', MURDER_MYSTERY: 'Murder Mystery', ARCADE: 'Arcade', SKYBLOCK: 'SkyBlock', TNTGAMES: 'TNT Games', WALLS3: 'Mega Walls', UHC: 'UHC', HOUSING: 'Housing', PIT: 'Pit' };

function Search({ initial = '' }) {
  const [mode, setMode] = useState('guild');
  const [q, setQ] = useState(initial);
  const [err, setErr] = useState('');
  function go(e) {
    e.preventDefault();
    const v = q.trim().replace(/\s+/g, ' ');
    if (mode === 'guild' ? !GUILD_RE.test(v) : !PLAYER_RE.test(v)) { setErr(mode === 'guild' ? 'Guild names are letters, numbers and spaces' : 'Names are 1 to 16 letters, numbers or _'); return; }
    location.href = mode === 'guild' ? guildUrl(v) : `guild.html?player=${enc(v)}`;
  }
  return (
    <form class="gd-search" onSubmit={go}>
      <Tabs label="Search by" value={mode} onChange={m => { setMode(m); setErr(''); }} options={[['guild', 'Guild'], ['player', 'Player']]} />
      <div class="gd-search-box">
        <Icon name="search" />
        <input class="input" value={q} onInput={e => setQ(e.currentTarget.value)} maxLength={32} autocomplete="off" spellcheck={false}
          placeholder={mode === 'guild' ? 'Guild name' : 'A member\'s name'} aria-label={mode === 'guild' ? 'Guild name' : 'Player name'} aria-invalid={err ? 'true' : undefined} />
        <button type="submit" class="btn primary">Find</button>
      </div>
      {err && <p class="small bad-text" role="alert">{err}</p>}
    </form>
  );
}

function NeedsKey() {
  return (
    <div class="panel pad gd-needs">
      <Empty icon="lock">This guild isn't saved yet. A key loads it.</Empty>
      <button type="button" class="btn primary" onClick={() => { keyDialog.value = true; }}><Icon name="key" />Enter a key</button>
    </div>
  );
}

function Header({ g, members, stats }) {
  const known = members.filter(m => stats[m.uuid]);
  const avgStar = known.length ? known.reduce((a, m) => a + stats[m.uuid].star, 0) / known.length : null;
  const fks = known.reduce((a, m) => a + stats[m.uuid].fk, 0), fds = known.reduce((a, m) => a + stats[m.uuid].fd, 0);
  const week = members.reduce((a, m) => a + (m.week || 0), 0);
  const lvl = Math.floor(g.level || 0);
  return (
    <section class="panel lit pad gd-head reveal" aria-label="Guild">
      <div class="gd-title">
        <h1>{g.tag && <Segments segs={[{ text: `[${g.tag}]`, c: COLOR_NAMES[g.tagColor] || '7' }]} />} {g.name}</h1>
        {g.created && <span class="chip" title={date(g.created)}>Since {new Date(g.created).getFullYear()}</span>}
        <span class="chip" title={`Saved ${date(g.at, { time: true })}`}>Saved {ago(g.at)}</span>
      </div>
      {g.description && <p class="gd-desc">{g.description}</p>}
      <div class="gd-level" aria-label={`Level ${lvl}, ${Math.round((g.level - lvl) * 100)}% to ${lvl + 1}`}>
        <span class="mono">Level {lvl}</span>
        <div class="xp-bar"><span style={{ width: `${Math.max(1.5, (g.level - lvl) * 100)}%` }} /></div>
        <span class="mono faint">{lvl + 1}</span>
      </div>
      <div class="stats stat-row gd-stats">
        <Stat label="Members" icon="ui:helmet" value={num(members.length)} sub="of 125" />
        <Stat label="Avg star" icon="ui:star" value={avgStar === null ? '—' : <Star star={Math.round(avgStar)} />} sub={known.length < members.length ? `${known.length} with stats` : undefined} />
        <Stat label="Guild FKDR" icon="ui:sword" value={known.length ? ratio(fks, fds) : '—'} />
        <Stat label="Weekly GXP" icon="ui:xp" value={short(week)} />
      </div>
      {g.games && g.games.length > 0 && (
        <div class="gd-games">{g.games.map(x => <span key={x} class={`chip ${x === 'BEDWARS' ? 'accent' : ''}`}>{GAMES[x] || x.toLowerCase().replace(/_/g, ' ')}</span>)}</div>
      )}
    </section>
  );
}

const SORTS = [['rank', 'Rank'], ['star', 'Stars'], ['fkdr', 'FKDR'], ['week', 'Weekly GXP'], ['joined', 'Joined']];

function Members({ g, stats, loading }) {
  const [sort, setSort] = useParam('sort', 'star');
  const [q, setQ] = useState('');
  const prio = useMemo(() => Object.fromEntries((g.ranks || []).map(r => [r.name.toLowerCase(), r.priority])), [g]);
  const rankOf = m => (isMaster(m.rank) ? 1e6 : prio[String(m.rank || '').toLowerCase()] ?? 0);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = g.members.map(m => ({ ...m, s: stats[m.uuid] || null }))
      .filter(m => !s || (m.s && m.s.name.toLowerCase().includes(s)));
    const val = m => sort === 'rank' ? rankOf(m) : sort === 'joined' ? -(m.joined || 0) : sort === 'week' ? m.week || 0
      : !m.s ? -1 : sort === 'fkdr' ? ratioValue(m.s.fk, m.s.fd) : m.s.star;
    return list.sort((a, b) => val(b) - val(a) || (b.s ? b.s.star : -1) - (a.s ? a.s.star : -1));
  }, [g, stats, sort, q]);
  return (
    <section class="panel pad" aria-label="Members">
      <div class="gd-tools">
        <h2>Members</h2>
        <Tabs label="Sort by" value={sort} onChange={setSort} options={SORTS} />
        <input class="input gd-find" type="search" placeholder="Find a member" value={q} onInput={e => setQ(e.currentTarget.value)} aria-label="Find a member" />
      </div>
      {loading && <p class="faint small gd-note">Loading member stats…</p>}
      <div class="table-wrap">
        <table class="table gd-table">
          <thead><tr><th class="num hide-s">#</th><th>Player</th><th class="hide-s">Rank</th><th class="num">Star</th><th class="num">FKDR</th><th class="num hide-s">WLR</th><th class="num"><span class="hide-s">Weekly </span>GXP</th><th class="num hide-s">Joined</th></tr></thead>
          <tbody>
            {rows.map((m, i) => (
              <tr key={m.uuid}>
                <td class="num faint hide-s">{i + 1}</td>
                <td>
                  <span class="player-cell">
                    <a href={playerUrl(m.s ? m.s.name : m.uuid)}>
                      <Avatar id={m.uuid} size={24} />
                      {m.s ? <><PlayerName player={m.s.rankInfo} name={m.s.name} class="hide-s" /><PlayerName player={m.s.rankInfo} name={m.s.name} rank={false} class="show-s" /></> : <span class="mono faint">{loading ? '…' : 'Unknown'}</span>}
                      {isMaster(m.rank) && <Icon name="crown" class="gd-gm show-s" label="Guild Master" />}
                    </a>
                  </span>
                </td>
                <td class={`gd-rank hide-s ${isMaster(m.rank) ? 'gm' : ''}`}>{isMaster(m.rank) && <Icon name="crown" />}{isMaster(m.rank) ? 'Guild Master' : m.rank || '—'}</td>
                <td class="num">{m.s ? <Star star={m.s.star} /> : '—'}</td>
                <td class="num mono">{m.s ? ratio(m.s.fk, m.s.fd) : '—'}</td>
                <td class="num mono hide-s">{m.s ? ratio(m.s.wins, m.s.losses) : '—'}</td>
                <td class="num mono">{short(m.week || 0)}</td>
                <td class="num faint hide-s" title={m.joined ? date(m.joined, { time: true }) : undefined}>{m.joined ? date(m.joined) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <Empty>No member matches.</Empty>}
    </section>
  );
}

function GuildView({ name, player }) {
  const key = useSignal(siteKey);
  const path = name ? `/site/guild?name=${enc(name)}` : `/site/guild?player=${enc(player)}`;
  const res = useAsync(signal => get(path, { signal, maxAge: 5 * 60_000 }), [path, key]);
  const g = res.data && res.data.guild;
  const mem = useAsync(signal => get(`/site/guild/members?name=${enc(g.name)}`, { signal, maxAge: 10 * 60_000 }), [g && g.name, g && g.at], { skip: !g });
  const stats = (mem.data && mem.data.stats) || {};
  useEffect(() => {
    if (!g) return;
    document.title = `${g.name} · Prism`;
    if (player) history.replaceState(null, '', guildUrl(g.name));
    const list = readJson(RECENT, []).filter(x => x && x.toLowerCase() !== g.name.toLowerCase());
    writeJson(RECENT, [g.name, ...list].slice(0, 8));
  }, [g && g.name]);

  if (res.loading && !res.data) return <div class="panel pad"><Loading lines={6} label="Loading guild" /></div>;
  if (res.error) return res.error.notFound ? <div class="panel pad"><Empty icon="search">{res.error.message}</Empty></div> : <ErrorBox error={res.error} onRetry={res.reload} what="the guild" />;
  if (res.data && res.data.needsKey) return <NeedsKey />;
  if (!g) return null;
  return (
    <>
      <Header g={g} members={g.members} stats={stats} />
      {mem.error && <ErrorBox error={mem.error} onRetry={mem.reload} what="member stats" />}
      <Members g={g} stats={stats} loading={mem.loading} />
    </>
  );
}

function Guild() {
  const [name] = useParam('name', '');
  const [player] = useParam('player', '');
  const recentGuilds = readJson(RECENT, []).filter(x => typeof x === 'string' && GUILD_RE.test(x));
  const ok = (name && GUILD_RE.test(name)) || (!name && player && PLAYER_RE.test(player));
  return (
    <Shell bg="leaderboards">
      <div class="page wrap">
        {!ok && (
          <>
            <header class="page-head">
              <div class="grow">
                <p class="eyebrow"><ItemIcon id="ui:helmet" />Guilds</p>
                <h1>Find a guild</h1>
                <p>Members ranked by stars, FKDR or guild XP.</p>
              </div>
              <HeadEmblem id="ui:helmet" />
            </header>
            <div class="panel pad">
              <Search />
              {recentGuilds.length > 0 && (
                <div class="gd-recent"><span class="faint small">Recent</span>{recentGuilds.map(x => <a key={x} class="chip" href={guildUrl(x)}>{x}</a>)}</div>
              )}
            </div>
          </>
        )}
        {ok && (
          <>
            <div class="gd-top"><a class="btn small ghost" href="guild.html"><Icon name="search" />Find another guild</a></div>
            <GuildView name={name} player={player} />
          </>
        )}
      </div>
    </Shell>
  );
}

mount(<Guild />);
