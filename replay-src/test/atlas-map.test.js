// The Atlas map file reader (atlas-map.js) against a file laid out like the
// backend writes them (bedwars-backend atlas-core.js encodeMap).
const test = require('node:test')
const assert = require('node:assert/strict')
const { gzipSync } = require('fflate')
const { decodeMap } = require('../src/atlas-map')

function file (header, sections) {
  const head = new TextEncoder().encode(JSON.stringify(header))
  const out = new Uint8Array(8 + head.length + sections.length * 8192)
  out.set([80, 65, 84, 76]) // PATL
  new DataView(out.buffer).setUint32(4, head.length)
  out.set(head, 8)
  sections.forEach((s, k) => { const o = 8 + head.length + k * 8192; for (let i = 0; i < 4096; i++) { out[o + i * 2] = s[i] & 255; out[o + i * 2 + 1] = s[i] >> 8 } })
  return gzipSync(out)
}

test('reads columns and their sections from a map file', () => {
  const s = new Uint16Array(4096); s[(5 << 8) | (2 << 4) | 3] = (35 << 4) | 14
  const s2 = new Uint16Array(4096); s2[0] = 1 << 4
  const header = { v: 1, name: 'Test Isle', sources: [{ id: 'a' }], stats: { complete: true }, columns: [[-1, 2, 1 << 4, 0, 0], [0, 0, 1, 2, 0]] }
  const m = decodeMap(file(header, [s, s2]))
  assert.equal(m.header.name, 'Test Isle')
  assert.equal(m.columns.length, 2)
  assert.deepEqual([m.columns[0].x, m.columns[0].z, m.columns[0].kind], [-1, 2, 0])
  assert.equal(m.columns[0].sections[4][(5 << 8) | (2 << 4) | 3], (35 << 4) | 14)
  assert.equal(m.columns[0].sections[0], null)
  assert.equal(m.columns[1].sections[0][0], 16)
  assert.equal(m.columns[1].kind, 2)
})

test('turns away other files and newer formats', () => {
  assert.throws(() => decodeMap(gzipSync(new TextEncoder().encode('nope....'))), /isn't an Atlas map file/)
  assert.throws(() => decodeMap(file({ v: 2, columns: [] }, [])), /newer version/)
})
