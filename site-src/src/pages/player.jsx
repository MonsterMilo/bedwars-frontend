// Player profile: Bed Wars stats by mode and period, quickbuy, cosmetics,
// tags, and name and skin history.
import '../styles/base.css';
import '../styles/shell.css';
import '../styles/common.css';
import '../styles/player.css';
import { useEffect, useState } from 'preact/hooks';
import { mount } from '../lib/mount.js';
import { Shell } from '../ui/Shell.jsx';
import { PlayerSearch } from '../ui/PlayerSearch.jsx';
import { Icon } from '../ui/icons.jsx';
import { PlayerName, Star, Segments } from '../ui/mc.jsx';
import { Tabs, Stat, Avatar, Loading, ErrorBox, Empty, SourceNote, copyText, HeadArt } from '../ui/common.jsx';
import { SkinViewer } from '../ui/SkinViewer.jsx';
import { get, enc } from '../lib/api.js';
import { useAsync, useParam } from '../lib/useAsync.js';
import { MODES, DREAMS, modeStats, hasPlayed, starInfo, quickbuy, hotbar, COSMETIC_FIELDS, cosmeticName } from '../lib/bedwars.js';
import { num, ratio, ratioValue, pct, date, ago, span } from '../lib/format.js';
import { prefs } from '../lib/prefs.js';
import { useSignal } from '../lib/signal.js';
import { addRecent, isFavourite, toggleFavourite, favourites, recent, playerUrl } from '../lib/players.js';
import { COLOR_NAMES, prestigeColor } from '../lib/mc.js';
import { toast } from '../lib/toast.js';
import { keyDialog, siteKey } from '../lib/key.js';
import { ItemIcon, CosmeticThumb, killLine } from '../ui/items.jsx';

const networkLevel = exp => (Math.sqrt(2 * (Number(exp) || 0) + 30625) / 50) - 2.5;
const dashed = u => (u && u.length === 32 ? `${u.slice(0, 8)}-${u.slice(8, 12)}-${u.slice(12, 16)}-${u.slice(16, 20)}-${u.slice(20)}` : u);

// ---------- head ----------
// Ratio colours, like the overlays players know: grey, white, gold, green, red, pink.
const ratioColor = v => `var(--mc-${v < 1 ? '7' : v < 3 ? 'f' : v < 5 ? '6' : v < 10 ? 'a' : v < 20 ? 'c' : 'd'})`;

function ProfileHead({ data, view }) {
  const p = data.player || {};
  useSignal(favourites);
  const fav = isFavourite(data.name);
  const star = starInfo(p);
  const g = data.guild;
  const s = data.status;
  const bw = p.bedwars;
  const lastSeen = p.lastLogout || p.lastLogin;
  const d = prefs.value.decimals;
  const overall = bw ? modeStats(bw, '') : null;
  return (
    <section class="panel lit head reveal" aria-label="Profile" style={{ '--pc': `var(--mc-${prestigeColor(star.star)})` }}>
      <div class="head-glow" aria-hidden="true" />
      <div class="head-skin">
        <SkinViewer id={view.id} model={view.model} cape={view.cape} label={`${data.name}'s skin`} />
        <span class="pedestal" aria-hidden="true" />
      </div>
      <div class="head-main">
        <div class="head-title">
          <h1><PlayerName player={p} name={data.name} /></h1>
        </div>
        <div class="head-chips">
          <span class="chip star-chip"><Star star={star.star} /></span>
          {s && s.online && <span class="chip good"><span class="dot pulse" />Online{s.gameType ? ` · ${s.gameType === 'BEDWARS' ? 'Bed Wars' : s.gameType.toLowerCase().replace(/_/g, ' ')}` : ''}{s.map ? ` · ${s.map}` : ''}</span>}
          {s && !s.online && <span class="chip"><span class="dot" />Offline</span>}
          {!s && lastSeen && <span class="chip">Seen {ago(lastSeen)}</span>}
          {g && <span class="chip" title={`${g.members} members`}>{g.tag ? <Segments segs={[{ text: `[${g.tag}]`, c: COLOR_NAMES[g.tagColor] || '7' }]} /> : <Icon name="shield" />} {g.name}{g.rank ? ` · ${g.rank}` : ''}</span>}
          <span class={`chip ${data.live ? 'accent' : ''}`} title={data.live ? 'Fresh from Hypixel' : 'A saved copy. A key makes lookups live.'}>{data.live ? 'Live' : 'Saved copy'}</span>
        </div>
        {star.progress !== null && (
          <div class="xp" aria-label={`Star progress: ${Math.floor(star.progress * 100)}% to ${star.star + 1}`}>
            <div class="xp-row"><Star star={star.star} /><span class="faint small mono">{num(star.into)} / {num(star.need)} XP</span><Star star={star.star + 1} /></div>
            <div class="xp-bar"><span style={{ width: `${Math.max(1.5, star.progress * 100)}%` }} /></div>
          </div>
        )}
        {overall && hasPlayed(overall) && (
          <ul class="glance" aria-label="Overall Bed Wars">
            <li><ItemIcon id="ui:sword" /><span><small>FKDR</small><strong class="mono" style={{ color: ratioColor(ratioValue(overall.finals, overall.finalDeaths)) }}>{ratio(overall.finals, overall.finalDeaths, d)}</strong></span></li>
            <li><ItemIcon id="block:gold" /><span><small>WLR</small><strong class="mono" style={{ color: ratioColor(ratioValue(overall.wins, overall.losses) * 2) }}>{ratio(overall.wins, overall.losses, d)}</strong></span></li>
            <li><ItemIcon id="ui:totem" /><span><small>Wins</small><strong class="mono">{num(overall.wins)}</strong></span></li>
            <li><ItemIcon id="ui:bed" /><span><small>Beds</small><strong class="mono">{num(overall.beds)}</strong></span></li>
          </ul>
        )}
        <dl class="facts">
          {p.networkExp > 0 && <div><dt>Network level</dt><dd class="mono">{networkLevel(p.networkExp).toFixed(1)}</dd></div>}
          {p.firstLogin && <div><dt>First joined</dt><dd>{date(p.firstLogin)}</dd></div>}
          {p.karma > 0 && <div><dt>Karma</dt><dd class="mono">{num(p.karma)}</dd></div>}
          {p.achievementPoints > 0 && <div><dt>Achievement points</dt><dd class="mono">{num(p.achievementPoints)}</dd></div>}
        </dl>
        <div class="row head-actions">
          <button type="button" class={`btn small ${fav ? 'fav-on' : ''}`} aria-pressed={fav ? 'true' : 'false'} onClick={() => toggleFavourite(data.name, data.uuid)}>
            <Icon name="star" />{fav ? 'Favourite' : 'Add favourite'}
          </button>
          <button type="button" class="btn small" onClick={() => copyText(dashed(data.uuid), toast)}><Icon name="copy" />Copy UUID</button>
          <a class="btn small ghost" href={`nicks.html?player=${enc(data.name)}`}><Icon name="mask" />Find a nick from their game</a>
        </div>
        {!data.live && !siteKey.value && (
          <p class="faint small">Stats may be a few hours old. <button type="button" class="linkish" onClick={() => { keyDialog.value = true; }}>Enter a key</button> for live stats.</p>
        )}
      </div>
    </section>
  );
}

// ---------- tags ----------
function Tags({ uuid }) {
  const { data, error, loading, reload } = useAsync(signal => get(`/site/tags/${uuid}`, { signal, maxAge: 5 * 60_000 }), [uuid]);
  const tags = (data && data.tags) || [];
  return (
    <section class="panel pad reveal" aria-labelledby="tags-h">
      <h2 class="panel-title" id="tags-h"><Icon name="shield" />Tags<span class="grow" />{data && <span class={`chip ${tags.length ? 'bad' : 'good'}`}>{tags.length ? `${tags.length} tag${tags.length > 1 ? 's' : ''}` : 'Clean'}</span>}</h2>
      {loading && <Loading lines={2} />}
      <ErrorBox error={error} onRetry={reload} what="tags" />
      {data && !tags.length && <p class="dim">No blacklist has tagged this player.</p>}
      {tags.length > 0 && (
        <ul class="tags">
          {tags.map((t, i) => (
            <li key={i} class="tag-row">
              <span class="chip bad">{t.type.replace(/_/g, ' ')}</span>
              <span class="grow">
                <span class="tag-reason">{t.reason || 'No reason given'}</span>
                <span class="faint small">{t.source}{t.at ? ` · ${date(typeof t.at === 'number' && t.at < 1e12 ? t.at * 1000 : t.at)}` : ''}{t.automatic ? ' · automatic' : ''}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {data && <SourceNote sources={data.sources} />}
    </section>
  );
}

// ---------- stats ----------
// Aurora's session answer -> a flat { hypixelKey: change } map. Its exact
// shape varies, so any number (or { change } / { previous, current }) counts.
function periodBw(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw.changes || raw.stats || raw.bedwars || raw.difference || raw.diff || raw;
  const out = {};
  const pick = v => {
    if (typeof v === 'number') return v;
    if (!v || typeof v !== 'object') return null;
    for (const k of ['change', 'diff', 'delta', 'difference', 'gained']) if (typeof v[k] === 'number') return v[k];
    const before = v.previous ?? v.old ?? v.before ?? v.from;
    const after = v.current ?? v.new ?? v.after ?? v.to;
    if (typeof before === 'number' && typeof after === 'number') return after - before;
    return null;
  };
  for (const [k, v] of Object.entries(src)) {
    const n = pick(v);
    if (n !== null) out[k] = n;
  }
  return Object.keys(out).length ? out : null;
}

function StatGrid({ s, period }) {
  const d = prefs.value.decimals;
  if (!s || !hasPlayed(s)) return <Empty icon="info">{period === 'lifetime' ? 'No games in this mode.' : 'No games recorded in this period.'}</Empty>;
  const games = s.games ?? ((s.wins || 0) + (s.losses || 0));
  return (
    <div class="stats">
      <Stat big label="FKDR" icon="ui:sword" color={ratioColor(ratioValue(s.finals, s.finalDeaths))} value={ratio(s.finals, s.finalDeaths, d)} sub={`${num(s.finals)} finals · ${num(s.finalDeaths)} deaths`} />
      <Stat big label="WLR" icon="block:gold" color={ratioColor(ratioValue(s.wins, s.losses) * 2)} value={ratio(s.wins, s.losses, d)} sub={`${num(s.wins)} wins · ${num(s.losses)} losses`} />
      <Stat big label="BBLR" icon="ui:bed" value={ratio(s.beds, s.bedsLost, d)} sub={`${num(s.beds)} broken · ${num(s.bedsLost)} lost`} />
      <Stat big label="KDR" icon="ui:iron_sword" value={ratio(s.kills, s.deaths, d)} sub={`${num(s.kills)} kills · ${num(s.deaths)} deaths`} />
      <Stat label="Win rate" icon="ui:star" value={pct(s.wins, (s.wins || 0) + (s.losses || 0))} />
      <Stat label="Games" icon="ui:clock" value={num(games)} />
      {period === 'lifetime' && <Stat label="Winstreak" icon="ui:fireball" value={s.winstreak === null || s.winstreak === undefined ? 'Hidden' : num(s.winstreak)} />}
      <Stat label="Finals per game" icon="ui:sword" value={games ? ((s.finals || 0) / games).toFixed(2) : '—'} />
      <Stat label="Beds per game" icon="ui:bed" value={games ? ((s.beds || 0) / games).toFixed(2) : '—'} />
      {s.iron !== null && <Stat label="Iron" icon="res:iron" value={num(s.iron)} />}
      {s.gold !== null && <Stat label="Gold" icon="res:gold" value={num(s.gold)} />}
      {s.diamonds !== null && <Stat label="Diamonds" icon="res:diamond" value={num(s.diamonds)} />}
      {s.emeralds !== null && <Stat label="Emeralds" icon="res:emerald" value={num(s.emeralds)} />}
    </div>
  );
}

function Stats({ data }) {
  const p = useSignal(prefs);
  const [mode, setMode] = useParam('mode', p.mode);
  const [period, setPeriod] = useParam('period', 'lifetime');
  const bw = (data.player && data.player.bedwars) || null;
  const periods = useAsync(signal => get(`/site/periods/${data.uuid}?period=${period}`, { signal, maxAge: 10 * 60_000 }), [data.uuid, period], { skip: period === 'lifetime' });
  const source = period === 'lifetime' ? bw : periodBw(periods.data && periods.data.data);
  const m = MODES.find(x => x.id === mode) || MODES[0];
  const s = source ? modeStats(source, m.prefix) : null;
  const modeOptions = MODES.map(x => [x.id, x.label, period === 'lifetime' && bw && !hasPlayed(modeStats(bw, x.prefix))]);
  return (
    <section class="panel pad reveal" aria-labelledby="stats-h">
      <h2 class="panel-title" id="stats-h"><Icon name="sword" />Bed Wars</h2>
      <div class="stat-tabs">
        <Tabs label="Period" value={period} onChange={setPeriod} options={[['lifetime', 'Lifetime'], ['daily', 'Day'], ['weekly', 'Week'], ['monthly', 'Month']]} />
        <Tabs label="Mode" value={mode} onChange={setMode} options={modeOptions} />
      </div>
      {period !== 'lifetime' && periods.loading && <Loading lines={3} />}
      {period !== 'lifetime' && <ErrorBox error={periods.error} onRetry={periods.reload} what="period stats" />}
      {period !== 'lifetime' && periods.data && periods.data.off && <p class="dim">Period stats aren't switched on yet.</p>}
      {(period === 'lifetime' || (periods.data && !periods.data.off && !periods.loading)) && <StatGrid s={s} period={period} />}
      {period !== 'lifetime' && periods.data && !periods.data.off && <p class="source-note">Changes over the past {period === 'daily' ? '24 hours' : period === 'weekly' ? '7 days' : '28 days'}, from Aurora.</p>}
      {period === 'lifetime' && !bw && <Empty>This player has never played Bed Wars.</Empty>}
    </section>
  );
}

function Dreams({ bw }) {
  const rows = DREAMS.map(([prefix, label]) => ({ label, s: modeStats(bw, prefix) })).filter(r => hasPlayed(r.s));
  if (!rows.length) return null;
  const d = prefs.value.decimals;
  return (
    <section class="panel pad reveal" aria-labelledby="dreams-h">
      <h2 class="panel-title" id="dreams-h"><Icon name="sparkle" />Dreams modes</h2>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Mode</th><th class="num">Wins</th><th class="num">WLR</th><th class="num">Finals</th><th class="num">FKDR</th><th class="num">Beds</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label}>
                <td>{r.label}</td><td class="num">{num(r.s.wins)}</td><td class="num">{ratio(r.s.wins, r.s.losses, d)}</td>
                <td class="num">{num(r.s.finals)}</td><td class="num">{ratio(r.s.finals, r.s.finalDeaths, d)}</td><td class="num">{num(r.s.beds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------- quickbuy ----------
// Hypixel's favorite_slots names -> icon and label.
const HOTBAR = {
  BLOCKS: ['wool', 'Blocks'], MELEE: ['stone_sword', 'Melee'], TOOLS: ['wooden_pickaxe', 'Tools'], PICKAXE: ['wooden_pickaxe', 'Pickaxe'],
  AXE: ['wooden_axe', 'Axe'], SHEARS: ['shears', 'Shears'], RANGED: ['bow', 'Ranged'], BOW: ['bow', 'Bow'],
  POTIONS: ['speed_ii_potion_(45_seconds)', 'Potions'], POTION: ['speed_ii_potion_(45_seconds)', 'Potions'],
  UTILITY: ['fireball', 'Utility'], COMPASS: ['compass', 'Compass'], TRACKER: ['compass', 'Compass']
};
function Quickbuy({ bw }) {
  const qb = quickbuy(bw);
  const hb = hotbar(bw);
  if (!qb && !hb) return null;
  return (
    <section class="panel pad reveal" aria-labelledby="qb-h">
      <h2 class="panel-title" id="qb-h"><Icon name="list" />Quick buy</h2>
      {qb && (
        <ol class="qb inv" aria-label="Quick buy slots">
          {qb.map((it, i) => (
            <li key={i} class={`slot ${it ? '' : 'blank'}`} title={it ? it.name : 'Empty'}>
              {it ? <><ItemIcon id={it.id} /><span class="sr-only">{it.name}</span></> : <span class="sr-only">Empty</span>}
            </li>
          ))}
        </ol>
      )}
      {hb && (
        <>
          <h3 class="sub-title">Hotbar</h3>
          <ol class="qb hotbar inv" aria-label="Hotbar slots">
            {hb.map((cat, i) => {
              const [icon, label] = (cat && HOTBAR[cat.toUpperCase()]) || [null, cat ? cat.charAt(0) + cat.slice(1).toLowerCase() : null];
              return (
                <li key={i} class={`slot ${cat ? '' : 'blank'}`} title={label || 'Empty'}>
                  {icon && <ItemIcon id={icon} />}
                  {label && <span class="slot-label" aria-hidden="true">{label}</span>}
                  <span class="sr-only">{label || 'Empty'}</span>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}

// ---------- cosmetics ----------
let cosmeticsLib = null;
const loadCosmetics = () => cosmeticsLib || (cosmeticsLib = import('../data/cosmetics.json').then(m => {
  const byId = {};
  for (const cat of Object.values(m.default)) for (const it of cat.items) byId[it.id.toLowerCase()] = it;
  return byId;
}));
function Cosmetics({ bw }) {
  const [lib, setLib] = useState(null);
  useEffect(() => { loadCosmetics().then(setLib, () => setLib({})); }, []);
  const rows = COSMETIC_FIELDS.filter(([field]) => field !== 'activeSprays').map(([field, label, cat, prefix]) => {
    const id = bw && bw[field];
    const name = cosmeticName(id, prefix);
    return name ? { field, label, cat, id, name, item: lib && lib[String(id).toLowerCase()] } : null;
  }).filter(Boolean);
  if (!rows.length) return null;
  return (
    <section class="panel pad reveal" aria-labelledby="cos-h">
      <h2 class="panel-title" id="cos-h"><Icon name="palette" />Cosmetics in use<span class="grow" /><a class="link small" href="cosmetics.html">Library<Icon name="chevron" /></a></h2>
      <ul class="cosmetics">
        {rows.map(r => {
          const inner = (
            <>
              <CosmeticThumb item={r.item || { id: r.id }} cat={r.cat} size={48} />
              <span class="cos-text"><small>{r.label}</small><strong>{(r.item && r.item.name) || r.name}</strong>{r.item && r.item.line && <em class="cos-line">{killLine(r.item.line)}</em>}</span>
            </>
          );
          return <li key={r.field}>{r.item && r.item.lib ? <a class="cos" href={`cosmetics.html#${r.item.lib}`} title="Open in the library">{inner}</a> : <span class="cos">{inner}</span>}</li>;
        })}
      </ul>
    </section>
  );
}

// ---------- name and skin history ----------
function Holders({ name }) {
  const { data, error, loading, reload } = useAsync(signal => get(`/site/holders/${enc(name)}`, { signal, maxAge: 30 * 60_000 }), [name]);
  if (loading) return <Loading lines={1} />;
  if (error) return <ErrorBox error={error} onRetry={reload} what="past owners" />;
  const list = (data && data.holders) || [];
  if (!list.length) return <p class="faint small holders-none">No one else is known to have had {name}.</p>;
  return (
    <ul class="holders">
      {list.map(h => (
        <li key={h.uuid}><a href={playerUrl(h.uuid)} class="person"><Avatar id={h.uuid} size={20} />{h.name}</a>{h.current && <span class="chip accent">Now</span>}{h.at && <span class="faint small">{date(h.at)}</span>}</li>
      ))}
    </ul>
  );
}

const SHOW_NAMES = 6;
function History({ data, hist, view, onSkin }) {
  const { data: h, error, loading, reload } = hist;
  const [open, setOpen] = useState(null);
  const [all, setAll] = useState(false);
  const names = (h && h.names) || [];
  const shown = all ? names : names.slice(0, SHOW_NAMES);
  return (
    <section class="panel pad reveal" aria-labelledby="hist-h">
      <h2 class="panel-title" id="hist-h"><Icon name="history" />Names and skins<span class="grow" />{h && <span class="chip">{names.length} name{names.length === 1 ? '' : 's'}</span>}</h2>
      {loading && <Loading lines={4} />}
      <ErrorBox error={error} onRetry={reload} what="name history" />
      {h && (
        <div class="history">
          {h.skins.length > 0 && (
            <ul class="skins" aria-label="Skins">
              {h.skins.map((sk, i) => {
                const on = view.id === sk.hash || (!view.picked && i === 0);
                return (
                  <li key={sk.hash}>
                    <button type="button" class={`skin-pick ${on ? 'on' : ''}`} onClick={() => onSkin(i === 0 && sk.current ? null : sk.hash)} aria-pressed={on ? 'true' : 'false'}
                      aria-label={`Show ${sk.current ? 'current skin' : `old skin ${i + 1}`}`}>
                      <img src={`https://mc-heads.net/body/${sk.hash}/72`} alt="" width="30" height="72" loading="lazy" />
                      <span>{sk.current ? 'Now' : `#${h.skins.length - i}`}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <ol class="names">
            {shown.map((n, i) => {
              const next = names[i - 1];           // the name they changed to after this one
              const held = n.at && (i === 0 ? Date.now() - n.at : next && next.at ? next.at - n.at : null);
              const key = `${n.name}-${i}`;
              return (
                <li key={key} class={i === 0 ? 'current' : ''}>
                  <span class="name-dot" aria-hidden="true" />
                  <div class="name-row">
                    <strong class="mono">{n.name}</strong>
                    {i === 0 && <span class="chip accent">Now</span>}
                    <span class="grow" />
                    <span class="name-when">
                      {n.at ? <span>{n.estimated ? '~' : ''}{date(n.at)}</span> : <span class="faint">{i === names.length - 1 && names.length > 1 ? 'First name' : i === 0 ? '' : 'Date unknown'}</span>}
                      {held > 0 && <small class="faint">{span(held)}</small>}
                    </span>
                    <button type="button" class="btn icon ghost small" aria-expanded={open === key ? 'true' : 'false'} onClick={() => setOpen(open === key ? null : key)}
                      aria-label={`Who else had ${n.name}`} title="Who else had this name"><Icon name="users" /></button>
                  </div>
                  {open === key && <Holders name={n.name} />}
                </li>
              );
            })}
          </ol>
          {names.length > SHOW_NAMES && <button type="button" class="btn ghost small show-all" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${names.length}`}<Icon name={all ? 'chevron' : 'down'} /></button>}
        </div>
      )}
      {h && <SourceNote sources={h.sources} />}
    </section>
  );
}

// ---------- page ----------
function Profile({ name, setName }) {
  const { data, error, loading, reload } = useAsync(signal => get(`/site/player/${enc(name)}`, { signal, maxAge: 60_000 }), [name]);
  const uuid = data && data.uuid;
  const hist = useAsync(signal => get(`/site/history/${uuid}`, { signal, maxAge: 30 * 60_000 }), [uuid], { skip: !uuid });
  const [skin, setSkin] = useState(null);
  useEffect(() => {
    if (!data) return;
    addRecent(data.name, data.uuid);
    document.title = `${data.name} · Prism`;
    if (data.name !== name && name.length <= 16) setName(data.name);
  }, [data]);
  useEffect(() => setSkin(null), [name]);

  if (loading && !data) {
    return (
      <div class="page wrap">
        <div class="panel pad head"><div class="skel head-skin-skel" /><div class="head-main"><Loading lines={4} label="Loading player" /></div></div>
      </div>
    );
  }
  if (error) {
    return (
      <div class="page wrap">
        {error.notFound ? <div class="panel pad"><Empty icon="user">No player called <strong>{name}</strong>.</Empty></div> : <ErrorBox error={error} onRetry={reload} what="this player" />}
      </div>
    );
  }
  if (!data) return null;
  const bw = data.player && data.player.bedwars;
  const h = hist.data;
  // The skin on show: the one they wear now (with its real model and their
  // cape), or an older one picked from the list (model read from the skin).
  const view = skin
    ? { id: skin, model: 'auto-detect', cape: null, picked: true }
    : { id: data.uuid, model: h ? (h.skinModel === 'slim' ? 'slim' : 'default') : 'auto-detect', cape: (h && h.cape) || null, picked: false };
  return (
    <div class="page wrap player-page">
      <ProfileHead data={data} view={view} />
      <div class="player-grid">
        <div class="col">
          <Stats data={data} />
          {bw && <Dreams bw={bw} />}
        </div>
        <div class="col">
          <Tags uuid={data.uuid} />
          <History data={data} hist={hist} view={view} onSkin={setSkin} />
          {bw && <Quickbuy bw={bw} />}
          {bw && <Cosmetics bw={bw} />}
        </div>
      </div>
    </div>
  );
}

function Landing() {
  const favs = useSignal(favourites);
  const rec = useSignal(recent);
  const list = [...favs, ...rec.filter(r => !favs.some(f => f.name === r.name))].slice(0, 12);
  return (
    <div class="page wrap landing">
      <header class="page-head"><div class="grow"><p class="eyebrow"><ItemIcon id="ui:nametag" />Player lookup</p><h1>Look up a player</h1><p>Stats by mode and period, quick buy, cosmetics, tags, and past names and skins.</p></div><HeadArt items={['block:diamond', 'ui:sword', 'cat:bed']} /></header>
      <div class="landing-search"><PlayerSearch big autofocus placeholder="Player name or UUID" /></div>
      {list.length > 0 && <ul class="people-list">{list.map(p => <li key={p.name}><a class="person" href={playerUrl(p.name)}><Avatar id={p.uuid || p.name} size={22} />{p.name}</a></li>)}</ul>}
    </div>
  );
}

function PlayerPage() {
  const [name, setName] = useParam('name', '');
  const clean = String(name || '').trim();
  return <Shell bg="player">{clean ? <Profile key={clean.toLowerCase()} name={clean} setName={setName} /> : <Landing />}</Shell>;
}

// Also accept player.html#Name and player.html?Name
(() => {
  const q = new URLSearchParams(location.search);
  if (q.get('name')) return;
  const bare = location.hash.slice(1) || (location.search.slice(1).includes('=') ? '' : location.search.slice(1));
  if (/^[A-Za-z0-9_]{1,16}$|^[0-9a-fA-F-]{32,36}$/.test(bare)) history.replaceState(null, '', `player.html?name=${encodeURIComponent(bare)}`);
})();

mount(<PlayerPage />);
