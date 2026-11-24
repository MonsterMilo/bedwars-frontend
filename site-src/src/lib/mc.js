// Minecraft text: colour codes, Hypixel ranks and Bed Wars prestige tags,
// as segments [{ text, c }] the <Mc> component draws with --mc-<code> colours.

export const COLOR_NAMES = {
  BLACK: '0', DARK_BLUE: '1', DARK_GREEN: '2', DARK_AQUA: '3', DARK_RED: '4', DARK_PURPLE: '5', GOLD: '6', GRAY: '7',
  DARK_GRAY: '8', BLUE: '9', GREEN: 'a', AQUA: 'b', RED: 'c', LIGHT_PURPLE: 'd', YELLOW: 'e', WHITE: 'f'
};

// "§c[OWNER] " -> segments. Formatting codes (k-o, r) are dropped.
export function parseCodes(text, start = 'f') {
  const out = [];
  let c = start;
  let buf = '';
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '§' && i + 1 < s.length) {
      const code = s[i + 1].toLowerCase();
      if (/[0-9a-f]/.test(code)) { if (buf) out.push({ text: buf, c }); buf = ''; c = code; }
      else if (code === 'r') { if (buf) out.push({ text: buf, c }); buf = ''; c = start; }
      i++;
      continue;
    }
    buf += s[i];
  }
  if (buf) out.push({ text: buf, c });
  return out;
}

const STAFF = {
  ADMIN: [{ text: '[ADMIN]', c: 'c' }],
  GAME_MASTER: [{ text: '[GM]', c: '2' }],
  MODERATOR: [{ text: '[MOD]', c: '2' }],
  HELPER: [{ text: '[HELPER]', c: '9' }],
  YOUTUBER: [{ text: '[', c: 'c' }, { text: 'YOUTUBE', c: 'f' }, { text: ']', c: 'c' }]
};

// A Hypixel player (or the rank fields of one) -> { prefix: segments, nameColor }
export function rankOf(p) {
  if (!p) return { prefix: [], nameColor: '7' };
  if (p.prefix) {
    const seg = parseCodes(p.prefix);
    const last = seg.length ? seg[seg.length - 1].c : '7';
    return { prefix: seg.map(s => ({ ...s, text: s.text.trimEnd() })).filter(s => s.text), nameColor: last };
  }
  if (p.rank && STAFF[p.rank]) return { prefix: STAFF[p.rank], nameColor: STAFF[p.rank][0].c };
  const plus = COLOR_NAMES[p.rankPlusColor] || 'c';
  if (p.monthlyPackageRank === 'SUPERSTAR') {
    const c = p.monthlyRankColor === 'AQUA' ? 'b' : '6';
    return { prefix: [{ text: '[MVP', c }, { text: '++', c: plus }, { text: ']', c }], nameColor: c };
  }
  const pkg = p.newPackageRank || p.packageRank;
  switch (pkg) {
    case 'MVP_PLUS': return { prefix: [{ text: '[MVP', c: 'b' }, { text: '+', c: plus }, { text: ']', c: 'b' }], nameColor: 'b' };
    case 'MVP': return { prefix: [{ text: '[MVP]', c: 'b' }], nameColor: 'b' };
    case 'VIP_PLUS': return { prefix: [{ text: '[VIP', c: 'a' }, { text: '+', c: '6' }, { text: ']', c: 'a' }], nameColor: 'a' };
    case 'VIP': return { prefix: [{ text: '[VIP]', c: 'a' }], nameColor: 'a' };
    default: return { prefix: [], nameColor: '7' };
  }
}

// Bed Wars prestige tag "[1636✪]", coloured per character the way the game
// does (the same tables as the tracker).
const PRESTIGE_BASE = '7f6b2349d5';
const PRESTIGE_PATTERNS = {
  20: '877ff78', 21: 'ffee666', 22: '66ffb33', 23: '55dd6ee', 24: 'bbff778', 25: 'ffaa222', 26: '44ccdd5', 27: 'eeff888',
  28: 'aa2266e', 29: 'bb33991', 30: 'ee66cc4', 31: '993366e', 32: 'c4774cc', 33: '999dcc4', 34: '2add552', 35: 'cc442aa',
  36: 'aaab991', 37: '44ccb33', 38: '11955d1', 39: 'ccaa399', 40: '55cc66e'
};
export function prestigeSegments(starRaw) {
  const star = Math.max(0, Math.floor(Number(starRaw) || 0));
  const tier = Math.floor(star / 100);
  const glyph = star >= 1100 ? '✪' : '✫';
  const chars = ['[', ...String(star), glyph, ']'];
  let codes;
  if (tier < 10) codes = chars.map(() => PRESTIGE_BASE[tier]);
  else if (tier === 10) codes = chars.map((_, i) => 'c6eabd5'[i % 7]);
  else if (tier < 20) { const base = PRESTIGE_BASE[tier - 10]; codes = chars.map((_, i) => (i === 0 || i === chars.length - 1 ? '7' : base)); }
  else { const pat = PRESTIGE_PATTERNS[tier] || 'c6eab9d'; codes = chars.map((_, i) => pat[Math.round(i * (pat.length - 1) / (chars.length - 1))]); }
  return chars.map((text, i) => ({ text, c: codes[i] }));
}
// The prestige's main colour (for accents around the tag).
export const prestigeColor = star => prestigeSegments(star)[1].c;
