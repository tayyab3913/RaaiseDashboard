// Indoor pathfinding over the real floorplan geometry. Builds a visibility
// graph once from the wall/door polylines already in default-layout.json
// (the same data Walls.tsx/Doors.tsx render from) and finds shortest routes
// between two world-space points that go through doorways instead of
// cutting straight through walls.
//
// Graph nodes: every named location (sensor position) + the midpoint of
// every door opening. An edge exists between two nodes if the straight line
// between them doesn't cross any wall or perforated-wall segment. This is a
// restricted visibility graph — cheap (tens of nodes, not the full polygon
// vertex set) because rooms are visually simple and doors are the only real
// chokepoints.
import layout from '@/config/layouts/default-layout.json'
import { pctToWorld } from './coordMapper'

export type Point = [number, number] // world-space [x, z]

// JSON-inferred point tuples come through as `number[]`, not the stricter
// `[number, number]` — cast loosely here rather than fighting TS about it.
type Polyline = { id: string; points: number[][] }

type Segment = [Point, Point]

function dist(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function polylinesToSegments(polylines: Polyline[]): Segment[] {
  const segs: Segment[] = []
  for (const pl of polylines) {
    for (let i = 0; i < pl.points.length - 1; i++) {
      const a = pctToWorld(pl.points[i][0], pl.points[i][1])
      const b = pctToWorld(pl.points[i + 1][0], pl.points[i + 1][1])
      segs.push([a, b])
    }
  }
  return segs
}

// Orientation-based segment intersection (handles the collinear/touching
// cases too, within EPS). Used both to build the graph's edges and to test
// ad-hoc start/end points against the same wall geometry.
const EPS = 1e-4

function orient(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.min(a[0], b[0]) - EPS <= p[0] && p[0] <= Math.max(a[0], b[0]) + EPS &&
    Math.min(a[1], b[1]) - EPS <= p[1] && p[1] <= Math.max(a[1], b[1]) + EPS
  )
}

function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = orient(p3, p4, p1)
  const d2 = orient(p3, p4, p2)
  const d3 = orient(p1, p2, p3)
  const d4 = orient(p1, p2, p4)

  if (
    ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
    ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))
  ) {
    return true
  }
  if (Math.abs(d1) <= EPS && onSegment(p3, p4, p1)) return true
  if (Math.abs(d2) <= EPS && onSegment(p3, p4, p2)) return true
  if (Math.abs(d3) <= EPS && onSegment(p1, p2, p3)) return true
  if (Math.abs(d4) <= EPS && onSegment(p1, p2, p4)) return true
  return false
}

let cachedSegments: Segment[] | null = null

function getBlockingSegments(): Segment[] {
  if (!cachedSegments) {
    const wallPolylines = (layout.walls as { polylines: Polyline[] }).polylines
    const perforatedPolylines = (layout.perforatedWalls as { polylines: Polyline[] }).polylines
    cachedSegments = [
      ...polylinesToSegments(wallPolylines),
      ...polylinesToSegments(perforatedPolylines),
    ]
  }
  return cachedSegments
}

function hasLineOfSight(a: Point, b: Point): boolean {
  for (const [c, d] of getBlockingSegments()) {
    if (segmentsIntersect(a, b, c, d)) return false
  }
  return true
}

type NodeId = string
type Edge = { to: NodeId; w: number }

type Graph = {
  ids: NodeId[]
  pos: Map<NodeId, Point>
  adj: Map<NodeId, Edge[]>
}

let cachedGraph: Graph | null = null

// How far past a wall segment's endpoint to place a routing node. Rooms in
// this floorplan aren't closed polygons — many "walls" are short partition
// stubs (a divider, a pillar) with open space just past their tip. A pure
// location+door visibility graph can't route around those stubs (the ray to
// any other node clips the stub), so every wall/perforated-wall segment also
// contributes two tip nodes just beyond its ends — enough for a walker to
// see past the corner into the open space beyond, not enough to meaningfully
// shortcut real distances.
const TIP_EPS = 0.1

function buildGraph(): Graph {
  const pos = new Map<NodeId, Point>()

  const locations = layout.locations as Record<string, { x: number; y: number }>
  for (const code of Object.keys(locations)) {
    const loc = locations[code]
    pos.set(`loc:${code}`, pctToWorld(loc.x, loc.y))
  }

  const doorPolylines = (layout.doors as { polylines: Polyline[] }).polylines
  for (const pl of doorPolylines) {
    const first = pl.points[0]
    const last = pl.points[pl.points.length - 1]
    const midPct: [number, number] = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2]
    pos.set(`door:${pl.id}`, pctToWorld(midPct[0], midPct[1]))
  }

  let tipIdx = 0
  for (const [a, b] of getBlockingSegments()) {
    const dx = a[0] - b[0]
    const dy = a[1] - b[1]
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    pos.set(`tip:${tipIdx++}`, [a[0] + ux * TIP_EPS, a[1] + uy * TIP_EPS])
    pos.set(`tip:${tipIdx++}`, [b[0] - ux * TIP_EPS, b[1] - uy * TIP_EPS])
  }

  const ids = Array.from(pos.keys())
  const adj = new Map<NodeId, Edge[]>()
  for (const id of ids) adj.set(id, [])

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = pos.get(ids[i])!
      const b = pos.get(ids[j])!
      if (hasLineOfSight(a, b)) {
        const w = dist(a, b)
        adj.get(ids[i])!.push({ to: ids[j], w })
        adj.get(ids[j])!.push({ to: ids[i], w })
      }
    }
  }

  return { ids, pos, adj }
}

function getGraph(): Graph {
  if (!cachedGraph) cachedGraph = buildGraph()
  return cachedGraph
}

// Small graph (tens of nodes) — plain O(n^2) Dijkstra is plenty fast and
// keeps this dependency-free.
function dijkstra(neighborsOf: (id: NodeId) => Edge[], start: NodeId, goal: NodeId): NodeId[] | null {
  const distMap = new Map<NodeId, number>([[start, 0]])
  const prev = new Map<NodeId, NodeId>()
  const visited = new Set<NodeId>()

  for (;;) {
    let u: NodeId | null = null
    let best = Infinity
    distMap.forEach((d, id) => {
      if (!visited.has(id) && d < best) {
        best = d
        u = id
      }
    })
    if (u === null || u === goal) break
    visited.add(u)
    for (const e of neighborsOf(u)) {
      if (visited.has(e.to)) continue
      const nd = best + e.w
      if (nd < (distMap.get(e.to) ?? Infinity)) {
        distMap.set(e.to, nd)
        prev.set(e.to, u)
      }
    }
  }

  if (!distMap.has(goal)) return null
  const path: NodeId[] = []
  let cur: NodeId | undefined = goal
  while (cur !== undefined) {
    path.unshift(cur)
    if (cur === start) break
    cur = prev.get(cur)
  }
  return path[0] === start ? path : null
}

// Finds a walkable route from `from` to `to`, routing through doorways.
// Returns the list of waypoints to walk through IN ORDER, always ending
// with `to` itself. Returns just `[to]` when there's a clear direct line
// (the common case inside a single room) or when no route can be found
// through the graph (better to walk straight than get stuck).
export function findPath(from: Point, to: Point): Point[] {
  if (hasLineOfSight(from, to)) return [to]

  const graph = getGraph()

  const startEdges: Edge[] = []
  const endEdges: Edge[] = []
  for (const id of graph.ids) {
    const p = graph.pos.get(id)!
    if (hasLineOfSight(from, p)) startEdges.push({ to: id, w: dist(from, p) })
    if (hasLineOfSight(to, p)) endEdges.push({ to: id, w: dist(to, p) })
  }

  const neighborsOf = (id: NodeId): Edge[] => {
    if (id === 'start') return startEdges
    if (id === 'end') return endEdges
    const base = graph.adj.get(id) ?? []
    const extra: Edge[] = []
    for (const e of startEdges) if (e.to === id) extra.push({ to: 'start', w: e.w })
    for (const e of endEdges) if (e.to === id) extra.push({ to: 'end', w: e.w })
    return base.concat(extra)
  }

  const nodeIds = dijkstra(neighborsOf, 'start', 'end')
  if (!nodeIds) return [to]

  const posOf = (id: NodeId): Point => (id === 'start' ? from : id === 'end' ? to : graph.pos.get(id)!)
  return nodeIds.slice(1).map(posOf)
}
