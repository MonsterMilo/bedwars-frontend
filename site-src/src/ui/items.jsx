// Minecraft item icons (one sprite, built by tools/item-icons.py) and the
// picture for a cosmetic: its library preview, or an icon for its kind.
import itemIcons from '../data/item-icons.json';

export const hasIcon = id => itemIcons.index[id] !== undefined;

export function ItemIcon({ id, class: cls = '' }) {
  const i = itemIcons.index[id];
  if (i === undefined) return null;
  return <span class={`item-icon ${cls}`} aria-hidden="true" style={{ '--i': i, '--n': itemIcons.count }} />;
}

// woodSkin_dark_oak -> wood:dark_oak
const woodIcon = item => {
  const m = /^woodskin_(.+)$/i.exec((item && item.id) || '');
  const key = m && `wood:${m[1].toLowerCase()}`;
  return key && hasIcon(key) ? key : null;
};

// cat is the library category (final, dance, msg, topper, ...).
export function CosmeticThumb({ item, cat, size = 44, class: cls = '' }) {
  const rar = (item && item.rar) || 'none';
  const style = { width: `${size}px`, height: `${size}px` };
  if (item && item.thumb && item.lib) {
    return <span class={`cos-pic rar-${rar} ${cls}`} style={style}><img src={`cosmetics/thumbs/${item.lib}.webp`} alt="" loading="lazy" width={size} height={size} /></span>;
  }
  const icon = woodIcon(item) || (hasIcon(`cat:${cat}`) ? `cat:${cat}` : null);
  return <span class={`cos-pic icon rar-${rar} ${cls}`} style={style}>{icon && <ItemIcon id={icon} />}</span>;
}

// A kill message's first line, with example names in.
export function killLine(line) {
  return String(line || '').replace(/\{V\}/g, 'Steve').replace(/\{K\}/g, 'you').replace(/\{MOB\}/g, 'Iron Golem').replace(/\{BED\}/g, 'Red Bed');
}
