'use client'

import { useMemo } from 'react'
import { pctToWorld } from '@/lib/coordMapper'
import layout from '@/config/layouts/default-layout.json'

const { height, thickness, color, opacity, polylines } = layout.walls

type SegmentProps = {
  from: [number, number]
  to: [number, number]
}

function WallSegment({ from, to }: SegmentProps) {
  const [fx, fz] = from
  const [tx, tz] = to
  const dx = tx - fx
  const dz = tz - fz
  const length = Math.sqrt(dx * dx + dz * dz)
  if (length < 0.001) return null

  const cx = (fx + tx) / 2
  const cz = (fz + tz) / 2
  const angle = Math.atan2(dz, dx)

  return (
    <mesh position={[cx, height / 2, cz]} rotation={[0, -angle, 0]}>
      <boxGeometry args={[length, height, thickness]} />
      <meshStandardMaterial color={color} transparent opacity={opacity} />
    </mesh>
  )
}

export function Walls() {
  const segments = useMemo(() => {
    return polylines.flatMap(polyline =>
      polyline.points.slice(0, -1).map((pt, i) => {
        const next = polyline.points[i + 1]
        return (
          <WallSegment
            key={`${polyline.id}-${i}`}
            from={pctToWorld(pt[0], pt[1])}
            to={pctToWorld(next[0], next[1])}
          />
        )
      })
    )
  }, [])

  return <>{segments}</>
}
