'use client'

import { useMemo } from 'react'
import { DataTexture, RGBAFormat, RepeatWrapping, DoubleSide } from 'three'
import { pctToWorld } from '@/lib/coordMapper'
import layout from '@/config/layouts/default-layout.json'

// Polka-dot alpha texture: white ring around a black (transparent) circle.
// Created once per wall segment with per-segment repeat settings so each
// wall tiles at the correct real-world hole pitch.
const TEX_SIZE = 64

function buildHoleAlphaTexture(
  holeRadius: number,
  holePitch: number,
  segmentLength: number,
  segmentHeight: number,
): DataTexture {
  // Radius as a fraction of the tile, mapped to pixel space.
  const rPx = (holeRadius / holePitch) * TEX_SIZE
  const cx = TEX_SIZE / 2
  const cy = TEX_SIZE / 2
  const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4)

  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const dx = x - cx
      const dy = y - cy
      // Inside the circle → hole (black = transparent in alphaMap)
      const v = Math.sqrt(dx * dx + dy * dy) <= rPx ? 0 : 255
      const i = (y * TEX_SIZE + x) * 4
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255
    }
  }

  const tex = new DataTexture(data, TEX_SIZE, TEX_SIZE, RGBAFormat)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  // Repeat so one texture tile = one holePitch in world space.
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

function PerforatedWallSegment({
  from, to, height, thickness, color, holeRadius, holePitch,
}: SegmentProps) {
  const [fx, fz] = from
  const [tx, tz] = to
  const dx = tx - fx
  const dz = tz - fz
  const length = Math.sqrt(dx * dx + dz * dz)
  if (length < 0.001) return null

  const cx = (fx + tx) / 2
  const cz = (fz + tz) / 2
  const angle = Math.atan2(dz, dx)

  // Per-segment texture: independent repeat so every wall tiles at the
  // correct real-world pitch regardless of segment length.
  const alphaMap = useMemo(
    () => buildHoleAlphaTexture(holeRadius, holePitch, length, height),
    // length and height uniquely identify the tile repeat; rebuild only on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [length, height, holeRadius, holePitch],
  )

  const lift = 0.025  // sit fractionally above normal walls to avoid z-fight

  return (
    <group position={[cx, lift, cz]} rotation={[0, -angle, 0]}>
      {/* Slim perforated wall body — DoubleSide so holes are visible from both
          directions. alphaTest clips pixels inside holes cleanly without the
          translucency blending artefacts that opacity would introduce. */}
      <mesh position={[0, height / 2, 0]} castShadow>
        <boxGeometry args={[length, height, thickness]} />
        <meshStandardMaterial
          color={color}
          roughness={0.45}
          metalness={0.35}
          side={DoubleSide}
          alphaMap={alphaMap}
          alphaTest={0.5}
          transparent
        />
      </mesh>

      {/* Thin top rail — solid strip across the top like a header beam, giving
          the perforated panel a finished architectural look. */}
      <mesh position={[0, height + 0.012, 0]}>
        <boxGeometry args={[length, 0.024, thickness * 1.2]} />
        <meshStandardMaterial
          color="#e8e0d0"
          roughness={0.4}
          metalness={0.4}
          emissive="#fff8ee"
          emissiveIntensity={0.12}
        />
      </mesh>
    </group>
  )
}

export function PerforatedWalls() {
  const perforatedWalls = (layout as Record<string, unknown>).perforatedWalls as {
    enabled: boolean
    height: number
    thickness: number
    color: string
    holeRadius: number
    holePitch: number
    polylines: Array<{ id: string; points: [number, number][] }>
  } | undefined

  const segments = useMemo(() => {
    if (!perforatedWalls?.enabled) return []
    const { height, thickness, color, holeRadius, holePitch, polylines } = perforatedWalls

    return polylines.flatMap((polyline) =>
      polyline.points.slice(0, -1).map((pt, i) => {
        const next = polyline.points[i + 1]
        const from = pctToWorld(pt[0], pt[1])
        const to = pctToWorld(next[0], next[1])
        return (
          <PerforatedWallSegment
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
  }, [perforatedWalls])

  return <>{segments}</>
}
