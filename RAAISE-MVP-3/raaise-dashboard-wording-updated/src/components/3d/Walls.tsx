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
    <mesh position={[cx, height / 2 + lift, cz]} rotation={[0, -angle, 0]} renderOrder={1}>
      <boxGeometry args={[length, height, thickness]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  )
}

export function Walls() {
  const segments = useMemo(() => {
    const { enabled, height, thickness, color, opacity, polylines } = layout.walls as typeof layout.walls & {
      enabled?: boolean
    }
    if (enabled === false) return []
    return polylines.flatMap(polyline =>
      polyline.points.slice(0, -1).map((pt, i) => {
        const next = polyline.points[i + 1]
        return (
          <WallSegment
            key={`${polyline.id}-${i}`}
            from={pctToWorld(pt[0], pt[1])}
            to={pctToWorld(next[0], next[1])}
            height={height}
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
