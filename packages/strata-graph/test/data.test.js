import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GraphModel, DEFAULT_NODE_SIZE } from '../src/data.js'
import { themeStyle, themeTokens, TOKENS, STYLESHEET } from '../src/theme.js'

const data = () => ({
  frames: [
    { id: 'outer', x: 0, y: 0, w: 1000, h: 800, label: 'VPC', kind: 'zone' },
    { id: 'inner', x: 100, y: 100, w: 400, h: 300, parent: 'outer', kind: 'trust-boundary' }
  ],
  nodes: [
    { id: 'a', x: 150, y: 150, label: 'A', parent: 'inner', ports: [{ id: 'out', side: 'right', direction: 'out' }] },
    { id: 'b', x: 600, y: 150, label: 'B', parent: 'outer', w: 120, h: 40 },
    { id: 'c', x: 2000, y: 0, label: 'Hidden', layer: 'infra' }
  ],
  edges: [
    { id: 'ab', source: { node: 'a', port: 'out' }, target: 'b' },
    { id: 'bad', source: 'a', target: 'nope' },
    { id: 'badport', source: { node: 'a', port: 'nope' }, target: 'b' }
  ],
  annotations: [{ id: 'note', x: 700, y: 500, text: 'Ask about retries', parent: 'outer' }],
  layers: [{ id: 'infra', hidden: true }, { id: 'ops', locked: true }]
})

test('normalises defaults and resolves ports from the shape', () => {
  const m = new GraphModel(data(), { portsOf: node => (node.id === 'b' ? [{ id: 'in', side: 'left' }] : []) })
  const a = m.nodes.get('a')
  assert.deepEqual([a.w, a.h, a.shape], [DEFAULT_NODE_SIZE.w, DEFAULT_NODE_SIZE.h, 'box'])
  assert.deepEqual(m.nodes.get('b').ports, [{ id: 'in', side: 'left' }])
  assert.deepEqual(m.edges.get('ab').target, { node: 'b', port: null }, 'a string end means the node itself')
  assert.equal(m.edges.get('ab').routing, 'orthogonal')
  assert.equal(m.annotations.get('note').kind, 'sticky')
  assert.equal(m.annotations.get('note').w, 160)
})

test('reports problems and drops what cannot be drawn', () => {
  const d = data()
  d.nodes.push({ id: 'a', x: 0, y: 0 }, { id: 'nan', x: NaN, y: 0 }, { id: 'orphan', x: 0, y: 0, parent: 'ghost-frame' })
  const m = new GraphModel(d)
  const messages = m.problems.map(p => p.message)
  assert.ok(messages.includes("Duplicate id 'a'"))
  assert.ok(messages.includes("node 'nan' has a non-numeric x"))
  assert.ok(messages.includes("Edge 'bad' connects a missing node"))
  assert.ok(messages.includes("Edge 'badport' uses an unknown port 'nope' on 'a'"))
  assert.ok(messages.some(msg => msg.includes('missing parent frame')))
  assert.equal(m.edges.has('bad'), false)
  assert.equal(m.edges.get('badport').source.port, null, 'falls back to the node')
  assert.equal(m.nodes.get('orphan').parent, undefined)
})

test('frames nest; descendants and frameAt follow the nesting', () => {
  const m = new GraphModel(data())
  assert.deepEqual(m.framesInOrder().map(f => [f.id, f.depth]), [['outer', 0], ['inner', 1]])
  assert.deepEqual(m.descendants('outer').sort(), ['a', 'b', 'inner', 'note'])
  assert.deepEqual(m.descendants('inner'), ['a'])
  assert.equal(m.frameAt({ x: 200, y: 200 }), 'inner')
  assert.equal(m.frameAt({ x: 700, y: 700 }), 'outer')
  assert.equal(m.frameAt({ x: 200, y: 200 }, new Set(['inner'])), 'outer')
  assert.equal(m.frameAt({ x: 5000, y: 5000 }), null)
})

test('layers hide and lock; bounds skip hidden items', () => {
  const m = new GraphModel(data())
  assert.ok(m.isHidden(m.nodes.get('c')))
  assert.ok(m.isLocked({ layer: 'ops' }))
  assert.ok(m.isLocked({ locked: true }))
  assert.deepEqual(m.bounds(), { x: 0, y: 0, w: 1000, h: 800 })
  assert.deepEqual(m.bounds(['a', 'b']), { x: 150, y: 150, w: 570, h: 64 })
  assert.deepEqual(m.bounds(['ab']), { x: 150, y: 150, w: 570, h: 64 }, 'an edge contributes its end nodes')
  assert.equal(m.kindOf('ab'), 'edge')
  assert.equal(m.kindOf('inner'), 'frame')
  assert.equal(m.kindOf('zzz'), null)
})

test('themes expose every token as a CSS variable', () => {
  const style = themeStyle('dark')
  for (const cssVar of Object.values(TOKENS)) assert.ok(style.includes(`${cssVar}:`), cssVar)
  assert.match(themeStyle({ accent: '#ff00ff' }), /--sg-accent: #ff00ff;/)
  assert.equal(themeTokens('dark').background, '#1c1917')
  for (const cssVar of STYLESHEET.match(/--sg-[a-z-]+/g)) assert.ok(Object.values(TOKENS).includes(cssVar), `${cssVar} is a known token`)
})
