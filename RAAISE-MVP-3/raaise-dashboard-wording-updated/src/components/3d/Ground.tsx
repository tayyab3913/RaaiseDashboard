'use client'

import { useLayoutEffect, useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import {
  TextureLoader,
  SRGBColorSpace,
  DataTexture,
  RepeatWrapping,
  NearestFilter,
  RGBAFormat,
} from 'three'
import layout from '@/config/layouts/default-layout.json'

const { width, height } = layout.plane

// Roughly 1 world unit per checkerboard cell. The plane's width/height in
// world units divided by 2 (each "tile" of the 2×2 source is 2 cells) gives
// the texture repeat count.
const CELL_SIZE = 1.0

export function Ground() {
  const texture = useLoader(TextureLoader, '/layout_map.png')

  // Subtle 2-tone checker — barely visible up close, gives a sense of scale
  // when you pan around. Two near-white shades, ~1.5% contrast, hard edges
  // (NearestFilter) so the cells stay crisp.
  const checker = useMemo(() => {
    const data = new Uint8Array([
      250, 250, 250, 255,
      241, 241, 241, 255,
      241, 241, 241, 255,
      250, 250, 250, 255,
    ])
    const tex = new DataTexture(data, 2, 2, RGBAFormat)
    tex.wrapS = RepeatWrapping
    tex.wrapT = RepeatWrapping
    tex.magFilter = NearestFilter
    tex.minFilter = NearestFilter
    tex.colorSpace = SRGBColorSpace
    tex.repeat.set(width / (CELL_SIZE * 2), height / (CELL_SIZE * 2))
    tex.needsUpdate = true
    return tex
  }, [])

  // Use TextureLoader's default flipY=true; combined with rotation [-PI/2,0,0]
  // it puts the PNG's top-left at world (-w/2, -h/2) — same convention as
  // pctToWorld(0,0). Avoid touching flipY (it inverts the floorplan vertically).
  useLayoutEffect(() => {
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true
  }, [texture])

  return (
    <>
      {/* White base ground with a barely-visible checker. Sits just below
          the textured floorplan so it becomes the visible floor (with the
          subtle scale grid) as soon as the layout_map plane is disabled. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 0]}
        renderOrder={-1}
        receiveShadow
      >
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={checker} />
      </mesh>

      {/* 2D layout_map texture (stays visible for now; will be disabled
          later to expose the white base). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={0}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={texture} />
      </mesh>
    </>
  )
}
