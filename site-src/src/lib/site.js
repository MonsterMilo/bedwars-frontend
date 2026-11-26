// The site map: what the nav, home page and footer list.
export const SECTIONS = [
  { id: 'stats', hue: 'var(--accent)', title: 'Stats', blurb: 'Look players up', pages: [
    { href: 'player.html', item: 'ui:nametag', label: 'Player lookup', icon: 'user', desc: 'Bed Wars stats, name history, skins and tags.' },
    { href: 'leaderboards.html', item: 'block:gold', label: 'Leaderboards', icon: 'trophy', desc: 'Top players for lifetime, weekly and daily.' },
    { href: 'guild.html', item: 'ui:helmet', label: 'Guilds', icon: 'users', desc: 'Guild members ranked by stars, FKDR or guild XP.' }
  ] },
  { id: 'tools', hue: 'var(--accent-2)', title: 'Tools', blurb: 'Work things out', pages: [
    { href: 'nicks.html', item: 'ui:eye', label: 'Nick Finder', icon: 'mask', desc: 'Find who is behind a nick.' },
    { href: 'cosmetics.html', item: 'ui:rocket', label: 'Cosmetics', icon: 'sparkle', desc: 'Every Bed Wars cosmetic, previewed.' },
    { href: 'atlas.html', item: 'ui:map', label: 'Atlas', icon: 'map', desc: 'Every map, from above.' },
    { href: 'download.html', item: 'block:enchanting', label: 'Download Prism', icon: 'download', desc: 'Our plugin client for Lunar 1.8.9.', featured: true,
      also: { href: 'plugins.html', item: 'block:crafting', label: 'Plugins', icon: 'code', desc: 'Plugins for Prism, each one reviewed.' } }
  ] },
  { id: 'private', hue: 'var(--accent-3)', title: 'Private', blurb: 'Needs a key', locked: true, pages: [
    { href: 'tracker.html', item: 'ui:book', label: 'Tracker', icon: 'list', desc: 'Our tracked players, notes and denicks.' },
    { href: 'recordings.html', item: 'block:jukebox', label: 'Recordings', icon: 'film', desc: 'Recorded games, clips and the Replay Theater.' },
    { href: 'hall-of-fame.html', item: 'ui:totem', label: 'Hall of Fame', icon: 'crown', desc: 'The 20 best players we beat, in 3D.' }
  ] }
];
// Pages listed inside another page's row (Plugins sits with Download Prism).
export const ALL_PAGES = SECTIONS.flatMap(s => s.pages.flatMap(p => [p, ...(p.also ? [p.also] : [])]).map(p => ({ ...p, section: s.id, locked: !!s.locked })));
export function currentPage() {
  const file = location.pathname.split('/').pop() || 'index.html';
  return ALL_PAGES.find(p => p.href === file) || null;
}
