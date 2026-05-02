'use client'

import { useLayoutEffect, useMemo } from 'react'
import { useLoader, useThree } from '@react-three/fiber'
import {
  TextureLoader,
  SRGBColorSpace,
  DataTexture,
  RepeatWrapping,
  NearestFilter,
  LinearMipmapLinearFilter,
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
  // Pull the renderer's max anisotropy (16 on most desktop GPUs). Used below
  // to kill the moiré shimmer the floorplan + checker show when the camera
  // tilts down-axis past ~30°.
  const maxAnisotropy = useThree(state => state.gl.capabilities.getMaxAnisotropy())

  // Subtle 2-tone checker — barely visible up close, gives a sense of scale
  // when you pan around. Two near-white shades, ~1.5% contrast.
  // We use Linear+Mipmap minification (instead of Nearest) plus 16x anisotropy
  // so the cells fade smoothly into the distance instead of strobing.
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
    tex.minFilter = LinearMipmapLinearFilter
    tex.generateMipmaps = true
    tex.anisotropy = maxAnisotropy
    tex.colorSpace = SRGBColorSpace
    tex.repeat.set(width / (CELL_SIZE * 2), height / (CELL_SIZE * 2))
    tex.needsUpdate = true
    return tex
  }, [maxAnisotropy])

  // Use TextureLoader's default flipY=true; combined with rotation [-PI/2,0,0]
  // it puts the PNG's top-left at world (-w/2, -h/2) — same convention as
  // pctToWorld(0,0). Avoid touching flipY (it inverts the floorplan vertically).
  useLayoutEffect(() => {
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = maxAnisotropy
    texture.needsUpdate = true
  }, [texture, maxAnisotropy])

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
        <meshStandardMaterial map={checker} roughness={0.85} metalness={0.05} />
      </mesh>

      {/* 2D layout_map texture (stays visible for now; will be disabled
          later to expose the white base). receiveShadow lets the directional
          light's shadow project onto the printed floorplan. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={0} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={texture} roughness={0.9} metalness={0.05} />
      </mesh>
    </>
  )
}
