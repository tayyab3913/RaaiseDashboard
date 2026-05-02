'use client'

import { Suspense, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows } from '@react-three/drei'
import { ACESFilmicToneMapping } from 'three'
import { Ground } from './Ground'
import { Walls } from './Walls'
import { Labels } from './Labels'
import { AvatarMesh, UserFor3D } from './Avatar'
import { locationToVector3, spreadOffset } from '@/lib/coordMapper'
import type { CameraDirection } from '@/components/CameraDirectionPicker'
import layout from '@/config/layouts/default-layout.json'

const [cx, cy, cz] = layout.camera.position
const { fov, near, far } = layout.camera
const { spreadRadius } = layout.avatar
const { width: planeW, height: planeH } = layout.plane

// Camera orbit parameters. Y stays fixed at the layout's configured height,
// and the horizontal radius is derived from the initial position so any
// existing camera tweak in default-layout.json is preserved.
const ORBIT_RADIUS = Math.hypot(cx, cz)
const ORBIT_Y = cy

// Azimuth of each compass direction, measured by `atan2(x, z)`.
//   atan2(0, +R) = 0       → S (camera south of origin, looking north)
//   atan2(+R, 0) = +π/2    → E
//   atan2(0, -R) = ±π      → N
//   atan2(-R, 0) = -π/2    → W
const DIR_AZIMUTH: Record<CameraDirection, number> = {
  S: 0,
  SE: Math.PI / 4,
  E: Math.PI / 2,
  NE: (3 * Math.PI) / 4,
  N: Math.PI,
  NW: -(3 * Math.PI) / 4,
  W: -Math.PI / 2,
  SW: -Math.PI / 4,
}

// Smoothly orbits the camera to whichever direction is selected. The radius
// and height are constant so the path is a true arc around origin (the camera
// doesn't briefly zoom in by lerping straight through the centre). lookAt
// keeps the centre framed at all times.
function CameraController({ direction }: { direction: CameraDirection }) {
  const targetAzimuth = DIR_AZIMUTH[direction]
  useFrame((state, delta) => {
    const cam = state.camera
    const currentAz = Math.atan2(cam.position.x, cam.position.z)
    let azDelta = targetAzimuth - currentAz
    // Wrap to [-π, π] so we always rotate the short way around.
    if (azDelta > Math.PI) azDelta -= 2 * Math.PI
    if (azDelta < -Math.PI) azDelta += 2 * Math.PI
    const t = 1 - Math.pow(0.001, delta)
    const newAz = currentAz + azDelta * t
    cam.position.set(
      ORBIT_RADIUS * Math.sin(newAz),
      ORBIT_Y,
      ORBIT_RADIUS * Math.cos(newAz)
    )
    cam.lookAt(0, 0, 0)
  })
  return null
}

type Props = {
  users: UserFor3D[]
  debugMode?: boolean
  cameraDirection?: CameraDirection
}

export default function Scene({
  users,
  debugMode = false,
  cameraDirection = 'S',
}: Props) {
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

      {/* Smoothly orbits the camera to whichever direction the picker
          selected. Driven each frame so transitions look like a fly-around
          rather than a jump-cut. */}
      <CameraController direction={cameraDirection} />

      <Suspense fallback={null}>
        <Ground />
        <Walls />
        <Labels />

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
              debugMode={debugMode}
            />
          )
        })}
      </Suspense>
    </Canvas>
  )
}
