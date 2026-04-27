'use client'

import { useLoader } from '@react-three/fiber'
import { TextureLoader } from 'three'
import layout from '@/config/layouts/default-layout.json'

const { width, height } = layout.plane

export function Ground() {
  const texture = useLoader(TextureLoader, '/layout_map.png')
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial map={texture} />
    </mesh>
  )
}
