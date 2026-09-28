import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  union,
  intersects,
  containsPoint,
  containsRect,
  rectFromPoints,
  portAnchors,
  boundaryAnchor,
  segmentCrossesRect,
  slideOut,
  snap,
  expand,
  center,
} from '../src/geometry.js'
import { SpatialIndex } from '../src/spatial.js'
import { guideGaps, smartGuides, snapMove, snapRect } from '../src/snap.js'
import { align, distribute } from '../src/arrange.js'
import { fitTransform, zoomAt, screenToWorld, worldToScreen, visibleRect } from '../src/viewport.js'
import { wrapText, truncateText, estimateMeasure } from '../src/text.js'

const box = (x, y, w = 100, h = 50) => ({ x, y, w, h })

test('rectangle basics', () => {
  assert.deepEqual(union([box(0, 0), box(200, 100)]), { x: 0, y: 0, w: 300, h: 150 })
  assert.equal(union([]), null)
  assert.ok(intersects(box(0, 0), box(50, 25)))
  assert.ok(!intersects(box(0, 0), box(100, 0)), 'touching edges do not overlap')
  assert.ok(containsPoint(box(0, 0), { x: 100, y: 50 }))
  assert.ok(containsRect(box(0, 0, 500, 500), box(10, 10)))
  assert.deepEqual(rectFromPoints({ x: 10, y: 50 }, { x: 0, y: 0 }), { x: 0, y: 0, w: 10, h: 50 })
  assert.deepEqual(expand(box(10, 10), 5), { x: 5, y: 5, w: 110, h: 60 })
  assert.deepEqual(center(box(0, 0)), { x: 50, y: 25 })
  assert.equal(snap(14, 10), 10)
  assert.equal(snap(15, 10), 20)
  assert.equal(snap(14.3, 0), 14.3)
})

test('ports spread evenly along their sides unless pinned', () => {
  const anchors = portAnchors(box(0, 0, 100, 60), [
    { id: 'in', side: 'left' },
    { id: 'out', side: 'right' },
    { id: 'dlq', side: 'right' },
    { id: 'pinned', side: 'top', offset: 0.25 },
    { id: 'auto-in', direction: 'in' },
  ])
  assert.deepEqual(
    anchors.get('in'),
    { x: 0, y: 20, side: 'left' },
    'two ports on the left: at 1/3 and 2/3'
  )
  assert.deepEqual(
    anchors.get('auto-in'),
    { x: 0, y: 40, side: 'left' },
    'inputs default to the left'
  )
  assert.deepEqual(anchors.get('out'), { x: 100, y: 20, side: 'right' })
  assert.deepEqual(anchors.get('dlq'), { x: 100, y: 40, side: 'right' })
  assert.deepEqual(anchors.get('pinned'), { x: 25, y: 0, side: 'top' })
})

test('boundary anchors leave through the side facing the other end', () => {
  const r = box(0, 0, 100, 50)
  assert.deepEqual(boundaryAnchor(r, { x: 300, y: 25 }), { x: 100, y: 25, side: 'right' })
  assert.deepEqual(boundaryAnchor(r, { x: 50, y: -200 }), { x: 50, y: 0, side: 'top' })
  const diag = boundaryAnchor(r, { x: -50, y: 100 })
  assert.equal(diag.side, 'bottom')
})

test('segment and rectangle crossing ignores touching borders', () => {
  const r = box(0, 0, 100, 100)
  assert.ok(segmentCrossesRect({ x: -10, y: 50 }, { x: 110, y: 50 }, r))
  assert.ok(!segmentCrossesRect({ x: -10, y: 0 }, { x: 110, y: 0 }, r), 'along the top border')
  assert.ok(!segmentCrossesRect({ x: -10, y: -5 }, { x: 110, y: -5 }, r))
  assert.ok(segmentCrossesRect({ x: 50, y: 50 }, { x: 50, y: 200 }, r), 'starting inside')
})

test('a point slides along its segment out of a rectangle, toward the end that is outside', () => {
  const pill = { x: 80, y: 40, w: 40, h: 20 }
  const a = { x: 0, y: 50 }
  const b = { x: 200, y: 50 }
  assert.deepEqual(slideOut({ x: 100, y: 50 }, a, b, pill), { x: 120, y: 50 }, 'toward b')
  assert.deepEqual(slideOut({ x: 30, y: 50 }, a, b, pill), { x: 30, y: 50 }, 'already outside')
  assert.deepEqual(
    slideOut({ x: 100, y: 50 }, a, { x: 110, y: 50 }, pill),
    { x: 80, y: 50 },
    'toward a when b is inside'
  )
  assert.deepEqual(
    slideOut({ x: 100, y: 50 }, { x: 90, y: 50 }, { x: 110, y: 50 }, pill),
    { x: 100, y: 50 },
    'stays when the whole segment is inside'
  )
  assert.deepEqual(
    slideOut({ x: 100, y: 50 }, { x: 100, y: 0 }, { x: 100, y: 100 }, pill),
    { x: 100, y: 60 },
    'vertical segments too'
  )
})

test('spatial index: query, within, nearest, move and delete', () => {
  const index = new SpatialIndex(100)
  index.set('a', box(0, 0))
  index.set('b', box(300, 300))
  index.set('big', box(-500, -500, 2000, 2000))
  assert.deepEqual(index.query(box(50, 25, 10, 10)).sort(), ['a', 'big'])
  assert.deepEqual(index.within(box(-10, -10, 200, 200)), ['a'])
  assert.equal(
    index.nearest({ x: 110, y: 25 }, 20, id => id !== 'big'),
    'a'
  )
  assert.equal(
    index.nearest({ x: 150, y: 25 }, 20, id => id !== 'big'),
    null
  )
  index.set('a', box(1000, 1000))
  assert.deepEqual(index.query(box(0, 0, 50, 50)), ['big'])
  assert.ok(index.delete('big'))
  assert.equal(index.size, 2)
  assert.deepEqual(index.query(box(-1000, -1000, 5000, 5000)).sort(), ['a', 'b'])
})

test('smart guides align edges and centres within the threshold', () => {
  const others = [box(0, 0, 100, 50), box(0, 200, 100, 50)]
  const { dx, dy, guides } = smartGuides(box(3, 100, 100, 50), others, 6)
  assert.equal(dx, -3, 'left edges line up')
  assert.equal(dy, 0)
  assert.deepEqual(guides, [{ axis: 'x', value: 0, from: 0, to: 250 }])
  const centred = smartGuides(box(200, 22, 60, 10), others, 6)
  assert.equal(centred.dy, -2, 'vertical centres line up (25 vs 27)')
  assert.deepEqual(smartGuides(box(500, 500), others, 6), { dx: 0, dy: 0, guides: [] })
})

test('each guide measures the gap to the nearest shape on it', () => {
  const others = [box(0, 0, 100, 50), box(0, 200, 100, 50)]
  const vertical = { axis: /** @type {const} */ ('x'), value: 0, from: 0, to: 250 }
  assert.deepEqual(guideGaps(box(0, 120, 100, 50), others, [vertical]), [
    { axis: 'x', value: 0, from: 170, to: 200 },
  ])
  const horizontal = { axis: /** @type {const} */ ('y'), value: 0, from: 0, to: 220 }
  assert.deepEqual(guideGaps(box(160, 0, 60, 50), others, [horizontal]), [
    { axis: 'y', value: 0, from: 100, to: 160 },
  ])
  assert.deepEqual(guideGaps(box(50, 0, 100, 50), others, [horizontal]), [], 'overlapping')
})

test('snapMove prefers guides, falls back to the grid', () => {
  const others = [box(0, 0, 100, 50)]
  assert.deepEqual(snapMove(box(3, 133), others, { grid: 10 }), {
    x: 0,
    y: 130,
    guides: [{ axis: 'x', value: 0, from: 0, to: 183 }],
  })
  assert.deepEqual(snapMove(box(333, 133), others, { grid: 10 }), { x: 330, y: 130, guides: [] })
  assert.deepEqual(snapMove(box(3, 133), others, { grid: 10, guides: false }), {
    x: 0,
    y: 130,
    guides: [],
  })
  assert.deepEqual(snapRect(box(14, 16), 10), box(10, 20))
})

test('align and distribute', () => {
  const items = [
    { id: 'a', ...box(0, 0, 100, 40) },
    { id: 'b', ...box(150, 30, 50, 20) },
    { id: 'c', ...box(40, 90, 80, 10) },
  ]
  assert.deepEqual(
    align(items, 'left').map(p => p.x),
    [0, 0, 0]
  )
  assert.deepEqual(
    align(items, 'right').map(p => p.x),
    [100, 150, 120]
  )
  assert.deepEqual(
    align(items, 'middle').map(p => p.y),
    [30, 40, 45]
  )
  assert.deepEqual(
    align(items, 'center').map(p => p.x),
    [50, 75, 60]
  )
  const row = [
    { id: 'a', ...box(0, 0, 10, 10) },
    { id: 'b', ...box(15, 0, 30, 10) },
    { id: 'c', ...box(100, 0, 20, 10) },
  ]
  const spread = distribute(row, 'horizontal')
  assert.deepEqual(
    spread.map(p => p.x),
    [0, 40, 100],
    'equal 30-unit gaps'
  )
  assert.deepEqual(
    distribute(row.slice(0, 2), 'horizontal').map(p => p.x),
    [0, 15],
    'fewer than three: unchanged'
  )
  assert.throws(() => align(items, /** @type {any} */ ('diagonal')), /Unknown alignment/)
})

test('viewport transforms', () => {
  const t = fitTransform(
    box(0, 0, 400, 200),
    { width: 800, height: 600 },
    { padding: 0, maxScale: 4 }
  )
  assert.equal(t.k, 2)
  assert.deepEqual(worldToScreen(t, { x: 0, y: 0 }), { x: 0, y: 100 })
  assert.deepEqual(screenToWorld(t, { x: 400, y: 300 }), { x: 200, y: 100 }, 'centred')
  assert.equal(
    fitTransform(box(0, 0, 400, 200), { width: 800, height: 600 }).k,
    1,
    'default fit never zooms past 100%'
  )
  const z = zoomAt({ x: 0, y: 0, k: 1 }, 2, { x: 100, y: 100 })
  assert.deepEqual(
    screenToWorld(z, { x: 100, y: 100 }),
    { x: 100, y: 100 },
    'the point under the cursor stays put'
  )
  assert.equal(zoomAt({ x: 0, y: 0, k: 3 }, 10, { x: 0, y: 0 }).k, 4, 'clamped')
  assert.deepEqual(visibleRect({ x: -100, y: -50, k: 2 }, { width: 400, height: 300 }), {
    x: 50,
    y: 25,
    w: 200,
    h: 150,
  })
})

test('text wraps on words, breaks long words and ellipsises', () => {
  const measure = s => s.length * 10
  assert.deepEqual(wrapText('Payment service handles cards', 100, measure), [
    'Payment',
    'service',
    'handles',
    'cards',
  ])
  assert.deepEqual(wrapText('a bb ccc', 60, measure), ['a bb', 'ccc'])
  assert.deepEqual(wrapText('Supercalifragilistic', 50, measure), [
    'Super',
    'calif',
    'ragil',
    'istic',
  ])
  assert.deepEqual(wrapText('one two three four', 90, measure, { maxLines: 2 }), [
    'one two',
    'three…',
  ])
  assert.deepEqual(wrapText('line one\nline two', 200, measure), ['line one', 'line two'])
  assert.ok(estimateMeasure(12)('abc') > 0)
})

test('a one-line title is cut at a character and ends in an ellipsis', () => {
  const measure = (/** @type {string} */ s) => s.length * 10
  assert.equal(truncateText('Payment authorisation', 100, measure), 'Payment a…')
  assert.equal(truncateText('Orders', 100, measure), 'Orders', 'text that fits is kept whole')
  assert.equal(truncateText('Payment service', 80, measure), 'Payment…', 'no space before it')
  assert.equal(truncateText('Anything', 5, measure), '…')
})
