import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  routeEdge,
  routeOrthogonal,
  orthogonalThrough,
  simplify,
  pointAlong,
  polylinePath,
  MinHeap,
} from '../src/routing.js'
import { segmentCrossesRect, sideVector } from '../src/geometry.js'

const box = (x, y, w = 100, h = 60) => ({ x, y, w, h })
const anchor = (x, y, side) => ({ x, y, side })

function assertOrthogonal(points) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    assert.ok(
      a.x === b.x || a.y === b.y,
      `segment ${i} (${a.x},${a.y})→(${b.x},${b.y}) is diagonal`
    )
  }
}

function onPolyline(points, p) {
  return points.some((a, i) => {
    const b = points[i + 1]
    if (!b) return a.x === p.x && a.y === p.y
    const within = (v, lo, hi) => v >= Math.min(lo, hi) && v <= Math.max(lo, hi)
    return (
      (a.x === b.x && a.x === p.x && within(p.y, a.y, b.y)) ||
      (a.y === b.y && a.y === p.y && within(p.x, a.x, b.x))
    )
  })
}

function assertAvoids(points, obstacles) {
  // The first and last segments leave and enter their own nodes; check everything between.
  for (let i = 2; i < points.length - 1; i++) {
    for (const r of obstacles)
      assert.ok(
        !segmentCrossesRect(points[i - 1], points[i], r),
        `segment ${i} crosses an obstacle`
      )
  }
}

test('side by side: a straight horizontal route', () => {
  const pts = routeOrthogonal(anchor(100, 30, 'right'), anchor(300, 30, 'left'), [
    box(0, 0),
    box(300, 0),
  ])
  assert.deepEqual(pts, [
    { x: 100, y: 30 },
    { x: 300, y: 30 },
  ])
})

test('offset ports: an orthogonal Z that leaves and enters along the port sides', () => {
  const source = anchor(100, 30, 'right')
  const target = anchor(300, 130, 'left')
  const pts = routeOrthogonal(source, target, [box(0, 0), box(300, 100)])
  assertOrthogonal(pts)
  assert.equal(pts[1].y, 30, 'leaves horizontally')
  assert.ok(pts[1].x > 100)
  assert.equal(pts.at(-2).y, 130, 'arrives horizontally')
  assert.ok(pts.at(-2).x < 300)
  assert.equal(pts.length, 4, 'two bends')
})

test('routes around an obstacle in the way', () => {
  const blocker = box(180, -40, 60, 140)
  const pts = routeOrthogonal(anchor(100, 30, 'right'), anchor(320, 30, 'left'), [
    box(0, 0),
    box(320, 0),
    blocker,
  ])
  assertOrthogonal(pts)
  assertAvoids(pts, [blocker])
  assert.ok(
    pts.some(p => p.y < -40 || p.y > 100),
    'goes over or under the blocker'
  )
})

test('ports facing away from each other wrap around the nodes', () => {
  // Source port faces left, target is to the right: the route must leave left, then turn.
  const nodes = [box(0, 0), box(300, 0)]
  const pts = routeOrthogonal(anchor(0, 30, 'left'), anchor(400, 30, 'right'), nodes)
  assertOrthogonal(pts)
  assert.ok(pts[1].x < 0, 'leaves to the left')
  assert.ok(pts.at(-2).x > 400, 'enters from the right')
  assertAvoids(
    pts,
    nodes.map(r => ({ x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 }))
  )
})

test('vertical ports', () => {
  const pts = routeOrthogonal(anchor(50, 60, 'bottom'), anchor(250, 200, 'top'), [
    box(0, 0),
    box(200, 200),
  ])
  assertOrthogonal(pts)
  const v = sideVector('bottom')
  assert.equal(Math.sign(pts[1].y - pts[0].y), v.y, 'leaves downward')
  assert.equal(pts.at(-1).y - pts.at(-2).y > 0, true, 'enters downward into the top port')
})

test('routeEdge: straight, orthogonal through waypoints, curved', () => {
  const s = anchor(0, 0, 'right')
  const t = anchor(200, 100, 'left')
  const straight = routeEdge({ source: s, target: t, routing: 'straight' })
  assert.equal(straight.path, 'M0,0 L200,100')
  assert.deepEqual(straight.label, { x: 100, y: 50 })

  const through = routeEdge({
    source: s,
    target: t,
    routing: 'orthogonal',
    waypoints: [{ x: 100, y: 50 }],
  })
  assertOrthogonal(through.points)
  assert.ok(onPolyline(through.points, { x: 100, y: 50 }), 'passes through the waypoint')
  assert.equal(through.points.at(-2).y, 100, 'arrives horizontally into the left port')
  const twoWaypoints = routeEdge({
    source: s,
    target: anchor(300, 0, 'top'),
    waypoints: [
      { x: 100, y: 50 },
      { x: 200, y: -80 },
    ],
  })
  assertOrthogonal(twoWaypoints.points)
  assert.equal(twoWaypoints.points.at(-2).x, 300, 'arrives vertically into the top port')

  const curved = routeEdge({ source: s, target: t, routing: 'curved' })
  assert.match(curved.path, /^M0,0 C/)
  assert.ok(Math.abs(curved.endAngle) < Math.PI / 2, 'arrives heading right into a left port')
  const curvedWaypoints = routeEdge({
    source: s,
    target: t,
    routing: 'curved',
    waypoints: [{ x: 50, y: 200 }],
  })
  assert.equal((curvedWaypoints.path.match(/C/g) ?? []).length, 2)
})

test('rounded corners and polyline helpers', () => {
  assert.equal(
    polylinePath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      10
    ),
    'M0,0 L90,0 Q100,0 100,10 L100,100'
  )
  assert.deepEqual(
    simplify([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 10 },
    ]),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 10 },
    ]
  )
  assert.deepEqual(
    pointAlong(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      0.75
    ),
    { x: 100, y: 50 }
  )
  assert.deepEqual(
    orthogonalThrough(
      [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
      ],
      'right'
    ),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]
  )
  assert.deepEqual(
    orthogonalThrough(
      [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
      ],
      'bottom'
    ),
    [
      { x: 0, y: 0 },
      { x: 0, y: 50 },
      { x: 100, y: 50 },
    ]
  )
})

test('the router stays fast in a crowded diagram', () => {
  const obstacles = []
  for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) obstacles.push(box(i * 160, j * 120))
  const start = performance.now()
  let routes = 0
  for (let k = 0; k < 50; k++) {
    const pts = routeOrthogonal(
      anchor(100, 30 + ((k * 120) % 2400), 'right'),
      anchor(2980, 90 + ((k * 7) % 20) * 120, 'left'),
      obstacles
    )
    assertOrthogonal(pts)
    routes++
  }
  const perRoute = (performance.now() - start) / routes
  assert.ok(perRoute < 50, `${perRoute.toFixed(1)} ms per route`)
})

test('min-heap orders by priority', () => {
  const heap = new MinHeap()
  for (const v of [5, 1, 4, 2, 3, 0]) heap.push(v, `v${v}`)
  const out = []
  while (heap.size) out.push(heap.pop())
  assert.deepEqual(out, ['v0', 'v1', 'v2', 'v3', 'v4', 'v5'])
  assert.equal(heap.pop(), undefined)
})
