'use client'

import { useMemo } from 'react'
import { pctToWorld } from '@/lib/coordMapper'
import layout from '@/config/layouts/default-layout.json'

type DoorSide = 'N' | 'S' | 'E' | 'W'
type Corner = 'NE' | 'NW' | 'SE' | 'SW'

// Config cast from the JSON (may not exist in older layout builds).
const furnitureConfig = (layout as Record<string, unknown>).roomFurniture as {
  enabled: boolean
  tableColor: string
  tableTopColor: string
  chairColor: string
  chairSeatColor: string
  rooms: Array<{
    id: string
    bounds: [[number, number], [number, number]]
    doorSide: DoorSide
    doorPos: [number, number]
    // Meeting rooms get one chair on EACH long edge (facing each other
    // across the table) instead of the usual single chair. Defaults to 1.
    chairCount?: number
    // How many chairs line up along each occupied long edge. Defaults to 1
    // (centred, per rule 1). >1 spaces them evenly along the table's length.
    chairsPerSide?: number
    // Multiplies the table's long dimension after the usual room-fit sizing
    // — for a bigger meeting table than the standard "medium" one. Defaults
    // to 1. Still clamped to the room's available space as a safety net.
    tableLongScale?: number
    // Adds an L-shaped table/chair run hugging the two walls that meet at
    // this corner, IN ADDITION to the room's usual centre table (unless
    // noCenterTable is set). Set drop*CornerChair to remove just the chair
    // nearest the L's join from that segment, leaving the rest exactly
    // where they already are (no respacing).
    cornerTable?: { corner: Corner; dropVerticalCornerChair?: boolean; dropHorizontalCornerChair?: boolean }
    // Skips the usual centre table + chairs entirely — for rooms that only
    // want the corner table.
    noCenterTable?: boolean
  }>
} | undefined

// Overall furniture scale — applied to every size below (not to wall
// clearance/fit tolerances, which stay independent of how big the pieces are).
const FURNITURE_SCALE = 0.7

// Table sizing — a consistent "medium" desk footprint that only shrinks
// (never grows) to stay clear of the walls in a smaller room, so every room
// gets the same reasonably-sized table rather than one scaled to fill it.
const TABLE_LONG = 1.15 * FURNITURE_SCALE
const TABLE_SHORT = 0.68 * FURNITURE_SCALE
const WALL_MARGIN = 0.4          // clearance kept from every wall
const MIN_TABLE_SCALE = 0.4
const TABLE_HEIGHT = 0.32 * FURNITURE_SCALE
const TOP_THICKNESS = 0.018 * FURNITURE_SCALE
const TOP_INSET = 0.04 * FURNITURE_SCALE
const LEG_SIZE = 0.045 * FURNITURE_SCALE
const LEG_INSET = 0.06 * FURNITURE_SCALE

// Chair sizing/placement
const CHAIR_SEAT_SIZE = 0.34 * FURNITURE_SCALE
const CHAIR_SEAT_HEIGHT = 0.2 * FURNITURE_SCALE
const CHAIR_BACK_HEIGHT = 0.32 * FURNITURE_SCALE
const CHAIR_BACK_THICKNESS = 0.038 * FURNITURE_SCALE
const CHAIR_POST_RADIUS = 0.036 * FURNITURE_SCALE
const CHAIR_BASE_RADIUS = 0.15 * FURNITURE_SCALE
const CHAIR_BASE_HEIGHT = 0.026 * FURNITURE_SCALE
const CHAIR_GAP_FROM_TABLE = 0.14 * FURNITURE_SCALE  // clearance between table edge and chair
const CHAIR_FOOTPRINT_RADIUS = 0.19 * FURNITURE_SCALE // half the seat's diagonal, roughly

// Corner ("L-shaped") table run — two straight segments, each flush against
// one of the two walls meeting at a corner, sized to use most of each
// wall's length (clipped only by CORNER_END_MARGIN at the far end and the
// gap at the corner itself). Chairs line the room-facing side of each
// segment, spaced generously rather than packed tight.
const CORNER_TABLE_DEPTH = TABLE_SHORT   // how far each segment sticks out from its wall
const CORNER_WALL_GAP = 0.05
const CORNER_END_MARGIN = 0.3            // clearance from the far (perpendicular) wall
const CORNER_CHAIR_SPACING = 0.9         // target centre-to-centre spacing along a segment
// Cushion so chairs don't crowd either end of a segment. The far end (away
// from the L's corner, i.e. toward the room's OTHER two corners) gets a
// visibly generous gap so the row reads as centred/balanced rather than
// pushed flush into the corner.
const CORNER_CHAIR_END_MARGIN = 0.45
// Extra clearance from the corner-side end specifically — bigger again,
// because the OTHER segment's nearest chair sits just around that corner
// too; without this the two rows' end chairs would land almost on top of
// each other.
const CORNER_CHAIR_CORNER_MARGIN = 0.65

type TableProps = {
  posX: number
  posZ: number
  width: number
  depth: number
  color: string
  topColor: string
}

function TableMesh({ posX, posZ, width, depth, color, topColor }: TableProps) {
  const legHalfX = Math.max(width / 2 - LEG_INSET, 0.02)
  const legHalfZ = Math.max(depth / 2 - LEG_INSET, 0.02)
  const legPositions: [number, number][] = [
    [legHalfX, legHalfZ], [-legHalfX, legHalfZ],
    [legHalfX, -legHalfZ], [-legHalfX, -legHalfZ],
  ]

  return (
    <group position={[posX, 0, posZ]}>
      {legPositions.map(([lx, lz], i) => (
        <mesh key={i} position={[lx, TABLE_HEIGHT / 2, lz]} castShadow receiveShadow>
          <boxGeometry args={[LEG_SIZE, TABLE_HEIGHT, LEG_SIZE]} />
          <meshStandardMaterial color={color} roughness={0.6} metalness={0.15} />
        </mesh>
      ))}

      <mesh position={[0, TABLE_HEIGHT, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, TOP_THICKNESS, depth]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.1} />
      </mesh>

      {/* Slightly inset top surface — reads as the desk's writing surface
          instead of one flat-shaded slab. */}
      <mesh position={[0, TABLE_HEIGHT + TOP_THICKNESS / 2 + 0.002, 0]}>
        <boxGeometry
          args={[Math.max(width - TOP_INSET * 2, 0.02), 0.006, Math.max(depth - TOP_INSET * 2, 0.02)]}
        />
        <meshStandardMaterial color={topColor} roughness={0.4} metalness={0.05} />
      </mesh>
    </group>
  )
}

type ChairProps = {
  posX: number
  posZ: number
  yaw: number
  color: string
  seatColor: string
}

function ChairMesh({ posX, posZ, yaw, color, seatColor }: ChairProps) {
  return (
    <group position={[posX, 0, posZ]} rotation={[0, yaw, 0]}>
      {/* Round base + central post */}
      <mesh position={[0, CHAIR_BASE_HEIGHT / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[CHAIR_BASE_RADIUS, CHAIR_BASE_RADIUS, CHAIR_BASE_HEIGHT, 16]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, CHAIR_SEAT_HEIGHT / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[CHAIR_POST_RADIUS, CHAIR_POST_RADIUS, CHAIR_SEAT_HEIGHT, 10]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />
      </mesh>

      {/* Seat — faces +Z before the group's yaw rotation is applied */}
      <mesh position={[0, CHAIR_SEAT_HEIGHT, 0]} castShadow receiveShadow>
        <boxGeometry args={[CHAIR_SEAT_SIZE, 0.06, CHAIR_SEAT_SIZE]} />
        <meshStandardMaterial color={seatColor} roughness={0.7} metalness={0.05} />
      </mesh>

      {/* Backrest — sits behind the seat (the -Z side, away from where the
          chair faces) and rises above it. */}
      <mesh
        position={[0, CHAIR_SEAT_HEIGHT + CHAIR_BACK_HEIGHT / 2, -(CHAIR_SEAT_SIZE / 2 - CHAIR_BACK_THICKNESS / 2)]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[CHAIR_SEAT_SIZE, CHAIR_BACK_HEIGHT, CHAIR_BACK_THICKNESS]} />
        <meshStandardMaterial color={seatColor} roughness={0.7} metalness={0.05} />
      </mesh>
    </group>
  )
}

// Builds the two straight table segments (and their chairs) that make up an
// L-shaped run in one corner of a room. `bounds` is the room's world-space
// bounding box; `corner` picks which two walls the L hugs.
function buildCornerTable(
  bounds: { x0: number; x1: number; z0: number; z1: number },
  corner: Corner,
  tableColor: string,
  tableTopColor: string,
  chairColor: string,
  chairSeatColor: string,
  dropVerticalCornerChair?: boolean,
  dropHorizontalCornerChair?: boolean,
) {
  const isEast = corner.includes('E')
  const isSouth = corner.includes('S')
  // Unit direction from each wall INTO the room, along that wall's axis.
  const intoRoomX = isEast ? -1 : 1
  const intoRoomZ = isSouth ? -1 : 1

  // The corner point both segments' CENTRELINES would meet at, inset from
  // both walls.
  const segX = (isEast ? bounds.x1 : bounds.x0) + intoRoomX * (CORNER_TABLE_DEPTH / 2 + CORNER_WALL_GAP)
  const segZ = (isSouth ? bounds.z1 : bounds.z0) + intoRoomZ * (CORNER_TABLE_DEPTH / 2 + CORNER_WALL_GAP)

  // The vertical (E/W-wall) segment is the one that actually fills the
  // corner square — it runs all the way to the wall itself (minus just the
  // gap), not just up to the horizontal segment's centreline. The
  // horizontal segment then stops at the vertical one's near face, so the
  // two butt together with the corner covered exactly once and no gap.
  const vCornerZ = (isSouth ? bounds.z1 : bounds.z0) + intoRoomZ * CORNER_WALL_GAP
  const hCornerX = segX + intoRoomX * (CORNER_TABLE_DEPTH / 2)

  const vFarZ = isSouth ? bounds.z0 + CORNER_END_MARGIN : bounds.z1 - CORNER_END_MARGIN
  const vLen = Math.abs(vCornerZ - vFarZ)
  const vCenterZ = (vCornerZ + vFarZ) / 2

  const hFarX = isEast ? bounds.x0 + CORNER_END_MARGIN : bounds.x1 - CORNER_END_MARGIN
  const hLen = Math.abs(hCornerX - hFarX)
  const hCenterX = (hCornerX + hFarX) / 2

  const tables: TableProps[] = [
    { posX: segX, posZ: vCenterZ, width: CORNER_TABLE_DEPTH, depth: vLen, color: tableColor, topColor: tableTopColor },
    { posX: hCenterX, posZ: segZ, width: hLen, depth: CORNER_TABLE_DEPTH, color: tableColor, topColor: tableTopColor },
  ]

  // Evenly space as many chairs as fit at roughly CORNER_CHAIR_SPACING
  // apart, between `lo` and `hi` (absolute world coordinates along the
  // segment's long axis) — never fewer than 1.
  const spacedBetween = (lo: number, hi: number) => {
    const usable = Math.max(hi - lo, 0)
    const count = Math.max(1, Math.floor(usable / CORNER_CHAIR_SPACING) + 1)
    if (count === 1) return [(lo + hi) / 2]
    return Array.from({ length: count }, (_, i) => lo + (usable * i) / (count - 1))
  }

  const chairDist = CORNER_TABLE_DEPTH / 2 + CHAIR_GAP_FROM_TABLE + CHAIR_FOOTPRINT_RADIUS

  // Vertical segment's chairs sit further into the room (continuing along
  // intoRoomX past the table) and face back toward the wall. The end nearer
  // the corner gets extra clearance (CORNER_CHAIR_CORNER_MARGIN, bigger than
  // the plain end margin) so it can't collide with the horizontal segment's
  // own nearest chair, which sits in roughly the same spot from the other
  // direction.
  const vChairX = segX + intoRoomX * chairDist
  const vYaw = Math.atan2(-intoRoomX, 0)
  const vDir = Math.sign(vCornerZ - vFarZ) || 1
  const [vLo, vHi] = [
    vFarZ + vDir * CORNER_CHAIR_END_MARGIN,
    vCornerZ - vDir * CORNER_CHAIR_CORNER_MARGIN,
  ].sort((a, b) => a - b)
  const vChairs: ChairProps[] = spacedBetween(vLo, vHi).map((z) => ({
    posX: vChairX,
    posZ: z,
    yaw: vYaw,
    color: chairColor,
    seatColor: chairSeatColor,
  }))
  if (dropVerticalCornerChair && vChairs.length > 0) {
    const nearestIdx = vChairs.reduce(
      (best, c, i) => (Math.abs(c.posZ - vCornerZ) < Math.abs(vChairs[best].posZ - vCornerZ) ? i : best),
      0,
    )
    vChairs.splice(nearestIdx, 1)
  }

  // Horizontal segment's chairs, same idea along X instead.
  const hChairZ = segZ + intoRoomZ * chairDist
  const hYaw = Math.atan2(0, -intoRoomZ)
  const hDir = Math.sign(hCornerX - hFarX) || 1
  const [hLo, hHi] = [
    hFarX + hDir * CORNER_CHAIR_END_MARGIN,
    hCornerX - hDir * CORNER_CHAIR_CORNER_MARGIN,
  ].sort((a, b) => a - b)
  const hChairs: ChairProps[] = spacedBetween(hLo, hHi).map((x) => ({
    posX: x,
    posZ: hChairZ,
    yaw: hYaw,
    color: chairColor,
    seatColor: chairSeatColor,
  }))
  if (dropHorizontalCornerChair && hChairs.length > 0) {
    const nearestIdx = hChairs.reduce(
      (best, c, i) => (Math.abs(c.posX - hCornerX) < Math.abs(hChairs[best].posX - hCornerX) ? i : best),
      0,
    )
    hChairs.splice(nearestIdx, 1)
  }

  return { tables, chairs: [...vChairs, ...hChairs] }
}

export function RoomFurniture() {
  const items = useMemo(() => {
    if (!furnitureConfig?.enabled) return []
    const { tableColor, tableTopColor, chairColor, chairSeatColor, rooms } = furnitureConfig

    return rooms.map((room) => {
      const [x0w, z0w] = pctToWorld(room.bounds[0][0], room.bounds[0][1])
      const [x1w, z1w] = pctToWorld(room.bounds[1][0], room.bounds[1][1])

      const tables: TableProps[] = []
      let chairs: ChairProps[] = []

      if (!room.noCenterTable) {
        const roomW = Math.abs(x1w - x0w)
        const roomD = Math.abs(z1w - z0w)
        const centerX = (x0w + x1w) / 2
        const centerZ = (z0w + z1w) / 2

        const longAxisIsX = roomW >= roomD
        const availableLong = (longAxisIsX ? roomW : roomD) - WALL_MARGIN * 2
        const availableShort = (longAxisIsX ? roomD : roomW) - WALL_MARGIN * 2
        const scale = Math.min(
          1,
          Math.max(MIN_TABLE_SCALE, availableLong / TABLE_LONG),
          Math.max(MIN_TABLE_SCALE, availableShort / TABLE_SHORT),
        )
        const tableLong = Math.min(TABLE_LONG * scale * (room.tableLongScale ?? 1), availableLong)
        const tableShort = TABLE_SHORT * scale
        const tableW = longAxisIsX ? tableLong : tableShort
        const tableD = longAxisIsX ? tableShort : tableLong

        // Rule 1 (always wins): the chair sits centred on one of the table's
        // LONG edges — i.e. offset from the table's centre along the SHORT
        // axis, at zero offset along the long axis. That gives exactly two
        // candidate spots, on opposite sides of the table.
        // Rule 2 / 3: pick whichever candidate is actually farther from the
        // door's real position. When the door sits on that same short axis,
        // the farther candidate is also the one directly opposite the door —
        // so facing back across the table (below) coincides with facing the
        // door. When the door is instead off one end of the table (on the
        // long axis), rule 1 still pins the axis; this is what decides which
        // of the two sides wins, per rule 3.
        const chairDist = tableShort / 2 + CHAIR_GAP_FROM_TABLE + CHAIR_FOOTPRINT_RADIUS
        const candidates: [number, number][] = !longAxisIsX
          ? [[chairDist, 0], [-chairDist, 0]]
          : [[0, chairDist], [0, -chairDist]]

        // A meeting room gets a chair on BOTH long edges — one per candidate —
        // each facing back across the table toward the centre, which means
        // they end up facing each other. The door doesn't decide anything
        // here since both sides are already occupied.
        const sideOffsets: [number, number][] =
          room.chairCount === 2
            ? candidates
            : [
                (() => {
                  const [doorX, doorZ] = pctToWorld(room.doorPos[0], room.doorPos[1])
                  return candidates.reduce((farther, cand) => {
                    const [fx, fz] = farther
                    const [cx, cz] = cand
                    const dFarther = Math.hypot(centerX + fx - doorX, centerZ + fz - doorZ)
                    const dCand = Math.hypot(centerX + cx - doorX, centerZ + cz - doorZ)
                    return dCand > dFarther ? cand : farther
                  })
                })(),
              ]

        // When more than one chair lines up along a side, space them evenly
        // along the table's LENGTH (not its width) within a comfortable span
        // well short of the ends. A single chair per side still sits centred,
        // per rule 1.
        const perSide = Math.max(1, room.chairsPerSide ?? 1)
        const longSpan = tableLong * 0.6
        const longOffsets =
          perSide === 1 ? [0] : Array.from({ length: perSide }, (_, i) => (i / (perSide - 1) - 0.5) * longSpan)

        // Face back across the table toward its centre — coincides with
        // facing the door in the single-chair case whenever the farther side
        // is also the opposite side; in the meeting-room case this is what
        // makes opposing chairs face each other. Facing direction only
        // depends on which side a chair is on, not its position along it.
        chairs = sideOffsets.flatMap(([sideX, sideZ]) =>
          longOffsets.map((along) => {
            const offsetX = longAxisIsX ? along : sideX
            const offsetZ = longAxisIsX ? sideZ : along
            return {
              posX: centerX + offsetX,
              posZ: centerZ + offsetZ,
              yaw: Math.atan2(-sideX, -sideZ),
              color: chairColor,
              seatColor: chairSeatColor,
            }
          }),
        )

        tables.push({ posX: centerX, posZ: centerZ, width: tableW, depth: tableD, color: tableColor, topColor: tableTopColor })
      }

      // Extra L-shaped table run hugging one corner — either alongside the
      // room's centre table, or on its own when noCenterTable is set.
      if (room.cornerTable) {
        const corner = buildCornerTable(
          { x0: x0w, x1: x1w, z0: z0w, z1: z1w },
          room.cornerTable.corner,
          tableColor,
          tableTopColor,
          chairColor,
          chairSeatColor,
          room.cornerTable.dropVerticalCornerChair,
          room.cornerTable.dropHorizontalCornerChair,
        )
        tables.push(...corner.tables)
        chairs.push(...corner.chairs)
      }

      return { id: room.id, tables, chairs }
    })
  }, [])

  return (
    <>
      {items.map((item) => (
        <group key={item.id}>
          {item.tables.map((table, i) => (
            <TableMesh key={i} {...table} />
          ))}
          {item.chairs.map((chair, i) => (
            <ChairMesh key={i} {...chair} />
          ))}
        </group>
      ))}
    </>
  )
}
