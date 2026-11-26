// Bed Wars maths: modes, per-mode stats, star progress, quickbuy.

export const MODES = [
  { id: 'overall', label: 'Overall', prefix: '' },
  { id: 'solo', label: 'Solos', prefix: 'eight_one_' },
  { id: 'doubles', label: 'Doubles', prefix: 'eight_two_' },
  { id: 'threes', label: '3v3v3v3', prefix: 'four_three_' },
  { id: 'fours', label: '4v4v4v4', prefix: 'four_four_' },
  { id: '4v4', label: '4v4', prefix: 'two_four_' }
];
// Dreams modes, shown in the extra table when the player has played them.
export const DREAMS = [
  ['eight_two_rush_', 'Doubles Rush'], ['four_four_rush_', '4s Rush'], ['eight_two_ultimate_', 'Doubles Ultimate'],
  ['four_four_ultimate_', '4s Ultimate'], ['eight_two_lucky_', 'Doubles Lucky'], ['four_four_lucky_', '4s Lucky'],
  ['eight_two_voidless_', 'Doubles Voidless'], ['four_four_voidless_', '4s Voidless'], ['eight_two_armed_', 'Doubles Armed'],
  ['four_four_armed_', '4s Armed'], ['eight_two_swap_', 'Doubles Swap'], ['four_four_swap_', '4s Swap'],
  ['eight_two_underworld_', 'Doubles Underworld'], ['four_four_underworld_', '4s Underworld'], ['castle_', 'Castle']
];

// One mode's numbers from the Bedwars stats object. Missing = null (the
// keyless copy of a profile doesn't carry every field).
export function modeStats(bw, prefix) {
  const g = k => {
    const v = bw && bw[`${prefix}${k}`];
    return typeof v === 'number' ? v : null;
  };
  const games = g('games_played_bedwars');
  return {
    wins: g('wins_bedwars'), losses: g('losses_bedwars'),
    finals: g('final_kills_bedwars'), finalDeaths: g('final_deaths_bedwars'),
    kills: g('kills_bedwars'), deaths: g('deaths_bedwars'),
    beds: g('beds_broken_bedwars'), bedsLost: g('beds_lost_bedwars'),
    games, winstreak: bw ? (prefix ? bw[`${prefix}winstreak`] : bw.winstreak) ?? null : null,
    iron: g('iron_resources_collected_bedwars'), gold: g('gold_resources_collected_bedwars'),
    diamonds: g('diamond_resources_collected_bedwars'), emeralds: g('emerald_resources_collected_bedwars'),
    items: g('items_purchased_bedwars')
  };
}
export const hasPlayed = s => (s.wins || 0) + (s.losses || 0) + (s.games || 0) > 0;

// Bed Wars XP -> star with progress. Each prestige (100 stars) costs
// 487,000 XP: the first four stars 500, 1000, 2000, 3500, then 5000 each.
const EASY = [500, 1000, 2000, 3500];
const PRESTIGE_XP = 487000;
export function starFromXp(xp) {
  const x = Math.max(0, Number(xp) || 0);
  const prestiges = Math.floor(x / PRESTIGE_XP);
  let rest = x - prestiges * PRESTIGE_XP;
  let level = prestiges * 100;
  for (let i = 0; i < 100; i++) {
    const need = i < 4 ? EASY[i] : 5000;
    if (rest < need) return { star: level, into: rest, need, progress: rest / need };
    rest -= need;
    level++;
  }
  return { star: level, into: 0, need: EASY[0], progress: 0 };
}
// Total Bed Wars XP at the start of a star.
export function xpAtStar(star) {
  const n = Math.max(0, Math.floor(Number(star) || 0));
  let xp = Math.floor(n / 100) * PRESTIGE_XP;
  for (let i = 0; i < n % 100; i++) xp += i < 4 ? EASY[i] : 5000;
  return xp;
}
export function starInfo(player) {
  const xp = player && player.bedwars && player.bedwars.Experience;
  if (typeof xp === 'number') return starFromXp(xp);
  const star = (player && player.bedwarsLevel) || 0;
  return { star, into: null, need: null, progress: null };
}

// Quickbuy: Hypixel's favourites_2 (21 shop item ids) -> display names.
export const SHOP_ITEMS = {
  wool: 'Wool', hardened_clay: 'Hardened Clay', 'blast-proof_glass': 'Blast-Proof Glass', end_stone: 'End Stone', ladder: 'Ladder',
  oak_wood_planks: 'Wood', obsidian: 'Obsidian', stone_sword: 'Stone Sword', iron_sword: 'Iron Sword', diamond_sword: 'Diamond Sword',
  'stick_(knockback_i)': 'Knockback Stick', chainmail_boots: 'Chainmail Armor', iron_boots: 'Iron Armor', diamond_boots: 'Diamond Armor',
  shears: 'Shears', wooden_pickaxe: 'Pickaxe', wooden_axe: 'Axe', arrow: 'Arrows', bow: 'Bow', 'bow_(power_i)': 'Bow (Power I)',
  'bow_(power_i__punch_i)': 'Bow (Power I, Punch I)', 'speed_ii_potion_(45_seconds)': 'Speed II Potion',
  'jump_v_potion_(45_seconds)': 'Jump V Potion', 'invisibility_potion_(30_seconds)': 'Invisibility Potion', golden_apple: 'Golden Apple',
  bedbug: 'Bedbug', dream_defender: 'Dream Defender', fireball: 'Fireball', tnt: 'TNT', ender_pearl: 'Ender Pearl',
  water_bucket: 'Water Bucket', bridge_egg: 'Bridge Egg', magic_milk: 'Magic Milk', sponge: 'Sponge',
  'compact_pop-up_tower': 'Compact Pop-up Tower', popup_tower: 'Compact Pop-up Tower'
};
export function quickbuy(bw) {
  const raw = bw && typeof bw.favourites_2 === 'string' ? bw.favourites_2.split(',') : null;
  if (!raw) return null;
  return Array.from({ length: 21 }, (_, i) => {
    const id = (raw[i] || 'null').trim();
    return id === 'null' || !id ? null : { id, name: SHOP_ITEMS[id] || id.replace(/[_()-]+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase()) };
  });
}
export function hotbar(bw) {
  const raw = bw && typeof bw.favorite_slots === 'string' ? bw.favorite_slots.split(',') : null;
  if (!raw) return null;
  return Array.from({ length: 9 }, (_, i) => (raw[i] && raw[i] !== 'null' ? raw[i] : null));
}

// Active cosmetics: Hypixel field -> label + the library category.
export const COSMETIC_FIELDS = [
  ['activeKillEffect', 'Final kill effect', 'final', 'killeffect_'],
  ['activeVictoryDance', 'Victory dance', 'dance', 'victorydance_'],
  ['activeKillMessages', 'Kill messages', 'msg', 'killmessages_'],
  ['activeIslandTopper', 'Island topper', 'topper', 'islandtopper_'],
  ['activeProjectileTrail', 'Projectile trail', 'trail', 'projectileTrail_'],
  ['activeBedDestroy', 'Bed destroy', 'bed', 'beddestroy_'],
  ['activeDeathCry', 'Death cry', 'cry', 'deathcry_'],
  ['activeSprays', 'Spray', 'spray', 'sprays_'],
  ['activeGlyph', 'Glyph', 'glyph', 'glyph_'],
  ['activeNPCSkin', 'Shopkeeper skin', 'shop', 'npcskin_'],
  ['activeWoodType', 'Wood skin', 'wood', 'woodSkin_'],
  ['active_figurine', 'Figurine', 'figurine', 'figurine_']
];
// "killeffect_head_rocket" -> "Head Rocket"; random picks and none -> null.
export function cosmeticName(id, prefix) {
  const s = String(id || '');
  if (!s || /^random_|_none$/i.test(s)) return null;
  const bare = prefix && s.toLowerCase().startsWith(prefix.toLowerCase()) ? s.slice(prefix.length) : s.replace(/^[a-zA-Z]+_/, '');
  return bare.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
