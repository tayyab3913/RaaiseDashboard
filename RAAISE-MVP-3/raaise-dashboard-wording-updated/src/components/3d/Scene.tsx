'use client'

import { Suspense, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows } from '@react-three/drei'
import { ACESFilmicToneMapping, PCFSoftShadowMap } from 'three'
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
type OrbitDirection = Exclude<CameraDirection, 'TOP'>
const DIR_AZIMUTH: Record<OrbitDirection, number> = {
  S: 0,
  SE: Math.PI / 4,
  E: Math.PI / 2,
  NE: (3 * Math.PI) / 4,
  N: Math.PI,
  NW: -(3 * Math.PI) / 4,
  W: -Math.PI / 2,
  SW: -Math.PI / 4,
}

// Margin baked into the top-down altitude calculation — keeps a comfortable
// frame around the floorplan instead of clipping the outer walls.
const TOP_FIT_MARGIN = 1.1

// Smoothly orbits the camera to whichever direction is selected, OR lifts it
// directly overhead for the TOP view.
//   • Orbit modes:  fixed radius + height, true arc around origin so the
//                   camera never cuts through the scene centre.
//   • TOP mode:     position lerps to (0, altitude, 0); altitude is computed
//                   from the canvas aspect ratio so the whole plane fits in
//                   view; camera.up swings to (0, 0, -1) so the layout map
//                   reads with north (image top) at the screen top, matching
//                   the original 2D map orientation.
//   • Returning from TOP, the camera direct-lerps onto the orbit ring before
//     resuming arc orbit, so we never see a hard teleport.
function CameraController({ direction }: { direction: CameraDirection }) {
  useFrame((state, delta) => {
    const cam = state.camera
    const t = 1 - Math.pow(0.001, delta)

    if (direction === 'TOP') {
      // Altitude that fits both plane dimensions in view, accounting for
      // current canvas aspect (vertical FOV is fixed; horizontal FOV depends
      // on aspect). We need height >= planeH/2/tan AND height >=
      // planeW/2/(aspect*tan); take the larger.
      const aspect = state.size.width / Math.max(state.size.height, 1)
      const fovRad = (fov * Math.PI) / 180
      const halfTan = Math.tan(fovRad / 2)
      const altByH = (planeH / 2) / halfTan
      const altByW = (planeW / 2) / (aspect * halfTan)
      const targetY = Math.max(altByH, altByW) * TOP_FIT_MARGIN

      // Position lerp toward (0, targetY, 0). The 0.001 z keeps the up vector
      // and view direction from being exactly collinear during the swing,
      // which would otherwise cause lookAt to flip the orientation.
      cam.position.x += (0 - cam.position.x) * t
      cam.position.y += (targetY - cam.position.y) * t
      cam.position.z += (0.001 - cam.position.z) * t

      // Up vector lerps toward -Z so map north (image top edge = world -Z)
      // appears at screen top in the plan view.
      cam.up.x += (0 - cam.up.x) * t
      cam.up.y += (0 - cam.up.y) * t
      cam.up.z += (-1 - cam.up.z) * t
      cam.up.normalize()
    } else {
      // Reset up to world up (smoothly, in case we just left TOP).
      cam.up.x += (0 - cam.up.x) * t
      cam.up.y += (1 - cam.up.y) * t
      cam.up.z += (0 - cam.up.z) * t
      cam.up.normalize()

      const targetAzimuth = DIR_AZIMUTH[direction]

      // If the camera is already orbiting the scene at roughly the right
      // height & radius, animate by interpolating azimuth (true arc). If it
      // isn't (typically just left TOP mode), direct-lerp position into the
      // orbit ring instead, otherwise the arc lerp would snap Y instantly.
      const horizDist = Math.hypot(cam.position.x, cam.position.z)
      const onOrbit =
        Math.abs(horizDist - ORBIT_RADIUS) < ORBIT_RADIUS * 0.15 &&
        Math.abs(cam.position.y - ORBIT_Y) < ORBIT_Y * 0.2

      if (onOrbit) {
        const currentAz = Math.atan2(cam.position.x, cam.position.z)
        let azDelta = targetAzimuth - currentAz
        if (azDelta > Math.PI) azDelta -= 2 * Math.PI
        if (azDelta < -Math.PI) azDelta += 2 * Math.PI
        const newAz = currentAz + azDelta * t
        cam.position.set(
          ORBIT_RADIUS * Math.sin(newAz),
          ORBIT_Y,
          ORBIT_RADIUS * Math.cos(newAz)
        )
      } else {
        const targetX = ORBIT_RADIUS * Math.sin(targetAzimuth)
        const targetZ = ORBIT_RADIUS * Math.cos(targetAzimuth)
        cam.position.x += (targetX - cam.position.x) * t
        cam.position.y += (ORBIT_Y - cam.position.y) * t
        cam.position.z += (targetZ - cam.position.z) * t
      }
    }

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
      shadows={{ type: PCFSoftShadowMap }}
      camera={{ position: [cx, cy, cz], fov, near, far }}
      style={{ width: '100%', height: '100%' }}
      // ACES Filmic gives the scene a slight cinematic curve and compresses
      // bright highlights gracefully. Exposure stays at 1.0 — the multi-light
      // rig already targets the right brightness, anything higher washes the
      // floorplan texture out.
      gl={{
        antialias: true,
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
      }}
    >
      <color attach="background" args={['#e9eef4']} />

      {/* Subtle linear fog matched to the background colour. Kicks in just past
          the camera's working distance and saturates well beyond the plane —
          gives far walls a hint of haze without smudging the foreground.
          Stable in three core; no shader patching, no compatibility risk. */}
      <fog attach="fog" args={['#e9eef4', 22, 55]} />

      {/* Studio 4-light rig (no IBL — image-based lighting was over-flooding
          the floorplan ground texture and washing out wall contrast):
          • key  — main warm directional from above-right; the only shadow caster
          • fill — cool light from opposite side, softens shadows
          • rim  — back light from below-front, separates avatars from ground
          • hemi — sky/ground bounce, lifts the whole scene gently
          • amb  — tiny floor for deep crevices */}
      <directionalLight
        position={[9, 16, 7]}
        intensity={1.1}
        color="#fff3dc"
        castShadow
        // 4k shadow map + tightened frustum (just larger than the plane's
        // half-diagonal, ~13.5u) wastes no texels outside the visible area,
        // which translates to noticeably crisper avatar/wall shadows.
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-near={0.5}
        shadow-camera-far={40}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0003}
        shadow-normalBias={0.025}
      />
      <directionalLight
        position={[-8, 10, -5]}
        intensity={0.35}
        color="#cfe0ff"
      />
      <directionalLight
        position={[0, 4, 10]}
        intensity={0.25}
        color="#ffffff"
      />
      <hemisphereLight args={['#dde6f0', '#6b6b6b', 0.45]} />
      <ambientLight intensity={0.2} />

      {/* NOTE: drei's <SoftShadows> was removed deliberately. It works by
          monkey-patching three's internal shadow GLSL chunks; on three r184
          (current installed version) those chunk names changed, the patch
          silently fails, and every MeshStandardMaterial in the scene renders
          white-washed. Three's built-in PCFSoftShadowMap (enabled on the
          Canvas above) gives soft enough edges for our top-down view. */}

      <CameraController direction={cameraDirection} />

      <Suspense fallback={null}>
        <Ground />
        <Walls />
        <Labels />

        {/* Soft baked contact shadows under every moving object. Sits in
            addition to the directional shadow — covers cases where the
            directional shadow misses (e.g. avatars under wall overhangs). */}
        <ContactShadows
          position={[0, 0.005, 0]}
          scale={[planeW + 4, planeH + 4]}
          resolution={1024}
          blur={2.4}
          far={4}
          opacity={0.4}
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
