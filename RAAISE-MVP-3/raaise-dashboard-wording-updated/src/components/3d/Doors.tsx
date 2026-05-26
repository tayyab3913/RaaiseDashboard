'use client'

import { useMemo } from 'react'
import { DataTexture, RGBAFormat, RepeatWrapping, DoubleSide } from 'three'
import { pctToWorld } from '@/lib/coordMapper'
import layout from '@/config/layouts/default-layout.json'

// Same polka-dot alpha texture used in PerforatedWalls, built per-segment so
// each door panel tiles holes at the correct real-world pitch.
const TEX_SIZE = 64

function buildHoleAlphaTexture(
  holeRadius: number,
  holePitch: number,
  segmentLength: number,
  segmentHeight: number,
): DataTexture {
  const rPx = (holeRadius / holePitch) * TEX_SIZE
  const cx = TEX_SIZE / 2
  const cy = TEX_SIZE / 2
  const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4)
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const dx = x - cx
      const dy = y - cy
      const v = Math.sqrt(dx * dx + dy * dy) <= rPx ? 0 : 255
      const i = (y * TEX_SIZE + x) * 4
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255
    }
  }
  const tex = new DataTexture(data, TEX_SIZE, TEX_SIZE, RGBAFormat)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.repeat.set(segmentLength / holePitch, segmentHeight / holePitch)
  tex.needsUpdate = true
  return tex
}

type SegmentProps = {
  from: [number, number]
  to: [number, number]
  height: number
  thickness: number
  color: string
  holeRadius: number
  holePitch: number
}

function DoorSegment({ from, to, height, thickness, color, holeRadius, holePitch }: SegmentProps) {
  const [fx, fz] = from
  const [tx, tz] = to
  const dx = tx - fx
  const dz = tz - fz
  const length = Math.sqrt(dx * dx + dz * dz)
  if (length < 0.001) return null

  const cx = (fx + tx) / 2
  const cz = (fz + tz) / 2
  const angle = Math.atan2(dz, dx)

  const alphaMap = useMemo(
    () => buildHoleAlphaTexture(holeRadius, holePitch, length, height),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [length, height, holeRadius, holePitch],
  )

  const lift = 0.025

  return (
    <group position={[cx, lift, cz]} rotation={[0, -angle, 0]}>
      <mesh position={[0, height / 2, 0]} castShadow>
        <boxGeometry args={[length, height, thickness]} />
        <meshStandardMaterial
          color={color}
          roughness={0.35}
          metalness={0.45}
          side={DoubleSide}
          alphaMap={alphaMap}
          alphaTest={0.5}
          transparent
        />
      </mesh>

      {/* Thin top rail matching the perforated wall style */}
      <mesh position={[0, height + 0.012, 0]}>
        <boxGeometry args={[length, 0.024, thickness * 1.2]} />
        <meshStandardMaterial
          color={color}
          roughness={0.3}
          metalness={0.5}
          emissive={color}
          emissiveIntensity={0.08}
        />
      </mesh>
    </group>
  )
}

export function Doors() {
  const doorsConfig = (layout as Record<string, unknown>).doors as {
    enabled: boolean
    height: number
    thickness: number
    color: string
    holeRadius: number
    holePitch: number
    polylines: Array<{ id: string; points: [number, number][] }>
  } | undefined

  const segments = useMemo(() => {
    if (!doorsConfig?.enabled) return []
    const { height, thickness, color, holeRadius, holePitch, polylines } = doorsConfig

    return polylines.flatMap((polyline) =>
      polyline.points.slice(0, -1).map((pt, i) => {
        const next = polyline.points[i + 1]
        const from = pctToWorld(pt[0], pt[1])
        const to   = pctToWorld(next[0], next[1])
        return (
          <DoorSegment
            key={`${polyline.id}-${i}`}
            from={from}
            to={to}
            height={height}
            thickness={thickness}
            color={color}
            holeRadius={holeRadius}
            holePitch={holePitch}
          />
        )
      }),
    )
  }, [doorsConfig])

  return <>{segments}</>
}
