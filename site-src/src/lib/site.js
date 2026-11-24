// The site map: what the nav, home page and footer list.
export const SECTIONS = [
  { id: 'stats', title: 'Stats', blurb: 'Look players up', pages: [
    { href: 'player.html', label: 'Player lookup', icon: 'user', desc: 'Bed Wars stats, name history, skins and tags.' },
    { href: 'leaderboards.html', label: 'Leaderboards', icon: 'trophy', desc: 'Top players for lifetime, weekly and daily.' }
  ] },
  { id: 'tools', title: 'Tools', blurb: 'Work things out', pages: [
    { href: 'nicks.html', label: 'Nick Finder', icon: 'mask', desc: 'Find who is behind a nick.' },
    { href: 'cosmetics.html', label: 'Cosmetics', icon: 'sparkle', desc: 'Every Bed Wars cosmetic, previewed.' },
    { href: 'atlas.html', label: 'Atlas', icon: 'map', desc: 'Every map, from above.' }
  ] },
  { id: 'prism', title: 'Prism', blurb: 'Get the client', pages: [
    { href: 'download.html', label: 'Download Prism', icon: 'download', desc: 'The Prism injectable for Lunar Client 1.8.9.' }
  ] },
  { id: 'private', title: 'Private', blurb: 'Needs a key', locked: true, pages: [
    { href: 'tracker.html', label: 'Tracker', icon: 'list', desc: 'Our tracked players, notes and denicks.' },
    { href: 'recordings.html', label: 'Recordings', icon: 'film', desc: 'Recorded games, clips and the Replay Theater.' },
    { href: 'hall-of-fame.html', label: 'Hall of Fame', icon: 'crown', desc: 'The 20 biggest sweats we beat, in 3D.' }
  ] }
];
export const ALL_PAGES = SECTIONS.flatMap(s => s.pages.map(p => ({ ...p, section: s.id, locked: !!s.locked })));
export function currentPage() {
  const file = location.pathname.split('/').pop() || 'index.html';
  return ALL_PAGES.find(p => p.href === file) || null;
}
