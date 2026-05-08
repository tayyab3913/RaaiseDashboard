'use client'

import { useMemo } from 'react'
import { pctToWorld } from '@/lib/coordMapper'
import layout from '@/config/layouts/default-layout.json'

type SegmentProps = {
  from: [number, number]
  to: [number, number]
  height: number
  thickness: number
  color: string
  opacity: number
}

// Architectural trim cap drawn on top of every wall. Crisp, opaque, slightly
// emissive — gives the otherwise translucent wall body a clean defined edge
// (especially useful since the body's opacity is 0.6 and the silhouette would
// otherwise dissolve into the background). Sized a touch wider than the wall
// itself for a subtle lipped/coping look.
const TRIM_HEIGHT = 0.04
const TRIM_OVERHANG = 1.15
const OUTER_WALL_HEIGHT_MULTIPLIER = 1.2
const BOUNDARY_EPS = 0.2

function WallSegment({ from, to, height, thickness, color, opacity }: SegmentProps) {
  const [fx, fz] = from
  const [tx, tz] = to
  const dx = tx - fx
  const dz = tz - fz
  const length = Math.sqrt(dx * dx + dz * dz)
  if (length < 0.001) return null

  const cx = (fx + tx) / 2
  const cz = (fz + tz) / 2
  const angle = Math.atan2(dz, dx)

  const lift = 0.02
  return (
    <group position={[cx, lift, cz]} rotation={[0, -angle, 0]}>
      <mesh
        position={[0, height / 2, 0]}
        renderOrder={1}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[length, height, thickness]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={opacity}
          roughness={0.8}
          metalness={0.05}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>

      <mesh
        position={[0, height + TRIM_HEIGHT / 2, 0]}
        renderOrder={2}
        castShadow
      >
        <boxGeometry
          args={[length + thickness * 0.4, TRIM_HEIGHT, thickness * TRIM_OVERHANG]}
        />
        <meshStandardMaterial
          color="#f1efe8"
          roughness={0.55}
          metalness={0.08}
          emissive="#fff5dd"
          emissiveIntensity={0.18}
        />
      </mesh>
    </group>
  )
}

export function Walls() {
  const segments = useMemo(() => {
    const { enabled, height, thickness, color, opacity, polylines } = layout.walls as typeof layout.walls & {
      enabled?: boolean
    }
    if (enabled === false) return []

    // Compute the world-space bounding box of all wall points once. Segments
    // that run along this box are treated as outer/boundary walls.
    const worldPts = polylines.flatMap((polyline) =>
      polyline.points.map((pt) => pctToWorld(pt[0], pt[1]))
    )
    const xs = worldPts.map(([x]) => x)
    const zs = worldPts.map(([, z]) => z)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minZ = Math.min(...zs)
    const maxZ = Math.max(...zs)
    const near = (a: number, b: number) => Math.abs(a - b) <= BOUNDARY_EPS

    return polylines.flatMap((polyline) =>
      polyline.points.slice(0, -1).map((pt, i) => {
        const next = polyline.points[i + 1]
        const from = pctToWorld(pt[0], pt[1])
        const to = pctToWorld(next[0], next[1])
        const [fx, fz] = from
        const [tx, tz] = to

        const isBoundarySegment =
          (near(fx, minX) && near(tx, minX)) ||
          (near(fx, maxX) && near(tx, maxX)) ||
          (near(fz, minZ) && near(tz, minZ)) ||
          (near(fz, maxZ) && near(tz, maxZ))

        return (
          <WallSegment
            key={`${polyline.id}-${i}`}
            from={from}
            to={to}
            height={isBoundarySegment ? height * OUTER_WALL_HEIGHT_MULTIPLIER : height}
            thickness={thickness}
            color={color}
            opacity={opacity}
          />
        )
      })
    )
  }, [])

  return <>{segments}</>
}
