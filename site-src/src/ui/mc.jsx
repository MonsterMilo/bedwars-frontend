// Minecraft-coloured text: rank + name, prestige tags.
import { rankOf, prestigeSegments } from '../lib/mc.js';

export function Segments({ segs, class: cls = '', label }) {
  return (
    <span class={`mc ${cls}`} aria-label={label}>
      {segs.map((s, i) => <span key={i} style={{ '--c': `var(--mc-${s.c})` }} aria-hidden={label ? 'true' : undefined}>{s.text}</span>)}
    </span>
  );
}
// [MVP+] Name, coloured like Hypixel shows it.
export function PlayerName({ player, name, rank = true, class: cls = '' }) {
  const r = rankOf(player);
  const display = name || (player && player.displayname) || '?';
  const segs = [...(rank ? r.prefix.flatMap((s, i) => (i === r.prefix.length - 1 ? [s, { text: ' ', c: s.c }] : [s])) : []), { text: display, c: r.nameColor }];
  return <Segments segs={segs} class={cls} label={`${rank && r.prefix.length ? r.prefix.map(s => s.text).join('') + ' ' : ''}${display}`} />;
}
export function Star({ star, class: cls = '' }) {
  return <Segments segs={prestigeSegments(star)} class={`star ${cls}`} label={`${Math.floor(Number(star) || 0)} stars`} />;
}
