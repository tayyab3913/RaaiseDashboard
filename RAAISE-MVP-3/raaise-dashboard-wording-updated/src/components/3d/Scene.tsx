'use client'

import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { Ground } from './Ground'
import { Walls } from './Walls'
import { AvatarMesh, UserFor3D } from './Avatar'
import { locationToVector3, spreadOffset } from '@/lib/coordMapper'
import layout from '@/config/layouts/default-layout.json'

const [cx, cy, cz] = layout.camera.position
const { fov, near, far } = layout.camera
const { spreadRadius } = layout.avatar

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
      gl={{ antialias: true }}
    >
      <ambientLight intensity={1.2} />
      <directionalLight position={[5, 10, 4]} intensity={0.8} />

      <Suspense fallback={null}>
        <Ground />
        <Walls />

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
