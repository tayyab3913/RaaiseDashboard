'use client'

import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows } from '@react-three/drei'
import { ACESFilmicToneMapping } from 'three'
import { Ground } from './Ground'
import { Walls } from './Walls'
import { AvatarMesh, UserFor3D } from './Avatar'
import { locationToVector3, spreadOffset } from '@/lib/coordMapper'
import layout from '@/config/layouts/default-layout.json'

const [cx, cy, cz] = layout.camera.position
const { fov, near, far } = layout.camera
const { spreadRadius } = layout.avatar
const { width: planeW, height: planeH } = layout.plane

type Props = {
  users: UserFor3D[]
}

export default function Scene({ users }: Props) {
  const locationGroups = useMemo(() => {
    const groups = new Map<string, UserFor3D[]>()
    for (const user of users) {
      const key = user.PREDICTED_LOCATION
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(user)
    }
    return groups
  }, [users])

  return (
    <Canvas
      camera={{ position: [cx, cy, cz], fov, near, far }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true, toneMapping: ACESFilmicToneMapping }}
    >
      {/* Soft neutral backdrop instead of the default black void. Reads as
          a "viewport" framing the building. */}
      <color attach="background" args={['#e8eaed']} />

      {/* Studio-style 3-light setup:
          • hemisphere — natural sky/ground tint over everything
          • key directional — primary highlight from above-front-right
          • fill directional — softens shadows from the opposite side
          • small ambient — keeps deep shadows from going pitch black */}
      <hemisphereLight args={['#dde6f0', '#7a7a7a', 0.55]} />
      <directionalLight position={[6, 12, 6]} intensity={0.9} />
      <directionalLight position={[-6, 8, -4]} intensity={0.35} />
      <ambientLight intensity={0.25} />

      <Suspense fallback={null}>
        <Ground />
        <Walls />

        {/* Soft baked contact shadows under every moving object.
            Grounds the avatars so they read as standing on the floor instead
            of hovering. Updates every frame because avatars move. */}
        <ContactShadows
          position={[0, 0.005, 0]}
          scale={[planeW + 4, planeH + 4]}
          resolution={1024}
          blur={2.4}
          far={4}
          opacity={0.45}
        />

        {users.map((user) => {
          const group = locationGroups.get(user.PREDICTED_LOCATION) ?? []
          const idx = group.indexOf(user)
          const [ox, oz] = spreadOffset(idx, group.length, spreadRadius)
          const [bx, , bz] = locationToVector3(user.PREDICTED_LOCATION)

          return (
            <AvatarMesh
              key={user.USERID}
              user={user}
              targetPosition={[bx + ox, 0, bz + oz]}
            />
          )
        })}
      </Suspense>
    </Canvas>
  )
}
