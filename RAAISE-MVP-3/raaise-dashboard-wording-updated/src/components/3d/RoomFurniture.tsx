'use client'

import { useMemo } from 'react'
import { pctToWorld } from '@/lib/coordMapper'
import layout from '@/config/layouts/default-layout.json'

type DoorSide = 'N' | 'S' | 'E' | 'W'

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
  }>
} | undefined

// Table sizing — a consistent "medium" desk footprint that only shrinks
// (never grows) to stay clear of the walls in a smaller room, so every room
// gets the same reasonably-sized table rather than one scaled to fill it.
const TABLE_LONG = 1.15
const TABLE_SHORT = 0.68
const WALL_MARGIN = 0.4          // clearance kept from every wall
const MIN_TABLE_SCALE = 0.4
const TABLE_HEIGHT = 0.32
const TOP_THICKNESS = 0.018
const TOP_INSET = 0.04
const LEG_SIZE = 0.045
const LEG_INSET = 0.06

// Chair sizing/placement
const CHAIR_SEAT_SIZE = 0.34
const CHAIR_SEAT_HEIGHT = 0.2
const CHAIR_BACK_HEIGHT = 0.32
const CHAIR_BACK_THICKNESS = 0.038
const CHAIR_POST_RADIUS = 0.036
const CHAIR_BASE_RADIUS = 0.15
const CHAIR_BASE_HEIGHT = 0.026
const CHAIR_GAP_FROM_TABLE = 0.14   // clearance between table edge and chair
const CHAIR_FOOTPRINT_RADIUS = 0.19 // half the seat's diagonal, roughly

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

export function RoomFurniture() {
  const items = useMemo(() => {
    if (!furnitureConfig?.enabled) return []
    const { tableColor, tableTopColor, chairColor, chairSeatColor, rooms } = furnitureConfig

    return rooms.map((room) => {
      const [x0w, z0w] = pctToWorld(room.bounds[0][0], room.bounds[0][1])
      const [x1w, z1w] = pctToWorld(room.bounds[1][0], room.bounds[1][1])
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
      const tableLong = TABLE_LONG * scale
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
      const offsets: [number, number][] =
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

      // Face back across the table toward its centre — coincides with
      // facing the door in the single-chair case whenever the farther side
      // is also the opposite side; in the meeting-room case this is what
      // makes the two chairs face each other.
      const chairs = offsets.map(([offsetX, offsetZ]) => ({
        posX: centerX + offsetX,
        posZ: centerZ + offsetZ,
        yaw: Math.atan2(-offsetX, -offsetZ),
        color: chairColor,
        seatColor: chairSeatColor,
      }))

      return {
        id: room.id,
        table: { posX: centerX, posZ: centerZ, width: tableW, depth: tableD, color: tableColor, topColor: tableTopColor },
        chairs,
      }
    })
  }, [])

  return (
    <>
      {items.map((item) => (
        <group key={item.id}>
          <TableMesh {...item.table} />
          {item.chairs.map((chair, i) => (
            <ChairMesh key={i} {...chair} />
          ))}
        </group>
      ))}
    </>
  )
}
