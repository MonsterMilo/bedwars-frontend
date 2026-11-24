import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starFromXp, modeStats, hasPlayed, quickbuy, hotbar, cosmeticName } from '../src/lib/bedwars.js';
import { prestigeSegments, rankOf, parseCodes } from '../src/lib/mc.js';
import { ratio, num } from '../src/lib/format.js';

test('stars from Bed Wars XP', () => {
  assert.deepEqual(starFromXp(0), { star: 0, into: 0, need: 500, progress: 0 });
  assert.equal(starFromXp(500).star, 1);
  assert.equal(starFromXp(7000).star, 4);
  assert.equal(starFromXp(487000).star, 100);
  assert.equal(starFromXp(487000 * 16 + 500 + 1000).star, 1602);
});

test('mode stats read the prefixed fields and keep gaps as null', () => {
  const bw = { eight_two_wins_bedwars: 10, eight_two_losses_bedwars: 2, wins_bedwars: 50 };
  const s = modeStats(bw, 'eight_two_');
  assert.equal(s.wins, 10);
  assert.equal(s.finals, null);
  assert.ok(hasPlayed(s));
  assert.ok(!hasPlayed(modeStats(bw, 'four_four_')));
});

test('quick buy and hotbar', () => {
  const qb = quickbuy({ favourites_2: 'wool,null,stone_sword' });
  assert.equal(qb.length, 21);
  assert.deepEqual(qb[0], { id: 'wool', name: 'Wool' });
  assert.equal(qb[1], null);
  assert.equal(qb[20], null);
  assert.equal(quickbuy({}), null);
  assert.deepEqual(hotbar({ favorite_slots: 'Melee,null' }).slice(0, 2), ['Melee', null]);
});

test('cosmetic names', () => {
  assert.equal(cosmeticName('killeffect_head_rocket', 'killeffect_'), 'Head Rocket');
  assert.equal(cosmeticName('random_cosmetic', 'killeffect_'), null);
  assert.equal(cosmeticName('glyph_none', 'glyph_'), null);
});

test('prestige tags and ranks', () => {
  assert.equal(prestigeSegments(1636).map(s => s.text).join(''), '[1636✪]');
  assert.equal(prestigeSegments(223).map(s => s.text).join(''), '[223✫]');
  assert.equal(prestigeSegments(223)[1].c, '6');
  assert.deepEqual(rankOf({ newPackageRank: 'MVP_PLUS', rankPlusColor: 'DARK_PURPLE' }).prefix.map(s => s.c), ['b', '5', 'b']);
  assert.equal(rankOf({ monthlyPackageRank: 'SUPERSTAR', monthlyRankColor: 'AQUA' }).nameColor, 'b');
  assert.deepEqual(parseCodes('§c[OWNER] §fx'), [{ text: '[OWNER] ', c: 'c' }, { text: 'x', c: 'f' }]);
});

test('ratios treat 0 deaths as 1', () => {
  assert.equal(ratio(10, 0, 2), '10.00');
  assert.equal(ratio(0, 0, 2), '—');
  assert.equal(num(null), '—');
  assert.equal(num(12345), '12,345');
});
