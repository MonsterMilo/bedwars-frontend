// A player's team comes from the scoreboard team's prefix colour, not its
// name: Hypixel sometimes puts the Yellow team in teams named "Blue1".
const test = require('node:test')
const assert = require('node:assert/strict')
const { teamOfScoreboard } = require('../src/model')

test('team from the prefix colour, not the team name', () => {
  assert.equal(teamOfScoreboard({ name: 'Blue1', prefix: '§e§lY §r§e' }).label, 'Yellow')
  assert.equal(teamOfScoreboard({ name: 'Blue25', prefix: '§9§lB §r§9' }).label, 'Blue')
  assert.equal(teamOfScoreboard({ name: 'Red30', prefix: '§a§lG §r§a' }).label, 'Green')
  // The prefix it first had wins over a later change.
  assert.equal(teamOfScoreboard({ name: 'Blue2', firstPrefix: '§e§lY ', prefix: '§7' }).label, 'Yellow')
})

test('falls back to the name, and ignores teams that are not Bed Wars teams', () => {
  assert.equal(teamOfScoreboard({ name: 'Red8' }).label, 'Red')
  assert.equal(teamOfScoreboard({ name: 'team_3', prefix: '§c' }), null)
  assert.equal(teamOfScoreboard(null), null)
})
