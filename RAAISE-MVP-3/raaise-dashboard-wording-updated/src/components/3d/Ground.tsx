'use client'

import { useLayoutEffect } from 'react'
import { useLoader } from '@react-three/fiber'
import { TextureLoader, SRGBColorSpace } from 'three'
import layout from '@/config/layouts/default-layout.json'

const { width, height } = layout.plane

export function Ground() {
  const texture = useLoader(TextureLoader, '/layout_map.png')

  // Use TextureLoader's default flipY=true; combined with rotation [-PI/2,0,0]
  // it puts the PNG's top-left at world (-w/2, -h/2) — same convention as
  // pctToWorld(0,0). Avoid touching flipY (it inverts the floorplan vertically).
  useLayoutEffect(() => {
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true
  }, [texture])

  return (
    <>
      {/* White base ground. Sits just below the textured floorplan so it
          becomes the visible floor as soon as the layout_map plane is
          disabled. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 0]}
        renderOrder={-1}
      >
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#ffffff" />
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
