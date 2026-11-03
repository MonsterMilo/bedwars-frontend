// Checks the replay reader on a tiny hand-made recording.
const test = require('node:test')
const assert = require('node:assert/strict')
const { zipSync } = require('fflate')
const { readMcpr, buildTimeline } = require('../src/model')

const varint = (v) => { const out = []; do { let b = v & 0x7f; v >>>= 7; if (v) b |= 0x80; out.push(b) } while (v); return out }
const i32 = (v) => { const b = Buffer.alloc(4); b.writeInt32BE(v); return [...b] }
const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16BE(v); return [...b] }
const str = (s) => { const b = Buffer.from(s); return [...varint(b.length), ...b] }
const blockPos = (x, y, z) => { const v = (BigInt(x & 0x3ffffff) << 38n) | (BigInt(y & 0xfff) << 26n) | BigInt(z & 0x3ffffff); const b = Buffer.alloc(8); b.writeBigUInt64BE(v); return [...b] }

function mcpr (packets) {
  const parts = []
  for (const [t, id, body] of packets) {
    const data = Buffer.from([...varint(id), ...body])
    parts.push(Buffer.from([...i32(t), ...i32(data.length)]), data)
  }
  return zipSync({ 'metaData.json': Buffer.from(JSON.stringify({ duration: 5000, selfId: 9 })), 'recording.tmcpr': Buffer.concat(parts) })
}

function chunk (cx, cz, fill) {
  // One section (y 0-15) of `fill`, full column.
  const blocks = Buffer.alloc(8192); for (let k = 0; k < 4096; k++) blocks.writeUInt16LE(fill, k * 2)
  const data = Buffer.concat([blocks, Buffer.alloc(2048), Buffer.alloc(2048, 0xff), Buffer.alloc(256, 1)])
  return [...i32(cx), ...i32(cz), 1, ...u16(1), ...varint(data.length), ...data]
}

const STONE = 1 << 4; const WOOL = 35 << 4
const uuid4 = Buffer.from('0123456789ab4def0123456789abcdef', 'hex')
const uuidNpc = Buffer.from('0123456789ab2def0123456789abcdef', 'hex')

test('blocks, players, teams, chat and markers come out of a recording', () => {
  const file = mcpr([
    [0, 0x21, chunk(0, 0, STONE)],
    [0, 0x38, [...varint(0), ...varint(1), ...uuid4, ...str('Steve'), ...varint(0), ...varint(0), ...varint(0), 0]],
    [0, 0x3e, [...str('Red8'), 0, ...str('Red'), ...str('§cR '), ...str(''), 0, ...str('always'), 12, ...varint(1), ...str('Steve')]],
    [100, 0x0c, [...varint(5), ...uuid4, ...i32(32), ...i32(64 * 32), ...i32(0), 0, 0, 0, 0, 0x7f]],
    [100, 0x0c, [...varint(6), ...uuidNpc, ...i32(0), ...i32(0), ...i32(0), 0, 0, 0, 0, 0x7f]],
    [150, 0x15, [...varint(5), 32, 0, 0, 1]],
    [1000, 0x23, [...blockPos(3, 4, 5), ...varint(WOOL)]],
    [2000, 0x02, [...str(JSON.stringify({ text: 'Alex was killed by Steve. FINAL KILL!' })), 0]],
    [2100, 0x02, [...str(JSON.stringify({ text: 'From [MVP+] Friend: secret' })), 0]],
    [3000, 0x21, chunk(0, 0, 0)], // sent again, now all air
    [4000, 0x13, [...varint(1), ...varint(5)]]
  ])
  const tl = buildTimeline(readMcpr(file))
  assert.equal(tl.columns.size, 1)
  assert.equal(tl.columns.get('0,0').sections[0][0], STONE)
  // The block change records before and after.
  assert.equal(tl.changes.to[0], WOOL)
  assert.equal(tl.changes.from[0], STONE)
  // Re-sent column: every differing block becomes a change at 3000.
  assert.equal(tl.changes.n, 1 + 4096)
  assert.equal(tl.changes.t[tl.changes.n - 1], 3000)
  // The NPC (version-2 uuid) is left out; Steve is in, on Red.
  assert.equal(tl.tracks.size, 1)
  const steve = tl.tracks.get(5)
  assert.equal(steve.name, 'Steve')
  assert.equal(steve.team.label, 'Red')
  assert.equal(steve.stateAt(120).x > 1 && steve.stateAt(120).x < 2, true)
  // Like the game, a move is glided to over 3 ticks.
  assert.equal(steve.stateAt(150).x < 2, true)
  assert.ok(Math.abs(steve.stateAt(400).x - 2) < 1e-6)
  assert.equal(steve.stateAt(4500), null)
  // Private messages never reach the chat; kills become markers.
  assert.equal(tl.chat.length, 1)
  assert.equal(tl.markers[0].kind, 'final')
})
