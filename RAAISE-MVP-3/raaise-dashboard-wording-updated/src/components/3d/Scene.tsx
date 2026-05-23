'use client'

import { MutableRefObject, Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ContactShadows } from '@react-three/drei'
import { ACESFilmicToneMapping, PCFSoftShadowMap, Vector3 } from 'three'
import { Ground } from './Ground'
import { Walls } from './Walls'
import { PerforatedWalls } from './PerforatedWalls'
import { Labels } from './Labels'
import { AvatarMesh, UserFor3D } from './Avatar'
import { Sensors } from './Sensors'
import { locationToVector3, spreadOffset } from '@/lib/coordMapper'
import type { SensorWithStatus } from '@/lib/sensors'
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

// Follow-camera orbit parameters — much tighter than the overview orbit so
// the selected avatar fills a useful portion of the viewport.
const FOLLOW_ORBIT_RADIUS = 3.5   // world units from the followed avatar
const FOLLOW_ORBIT_Y = 4.2        // camera height while following
const FOLLOW_TOP_SCALE = 0.22     // fraction of floor-plan used for TOP altitude

// Smoothly orbits the camera to whichever direction is selected, OR lifts it
// directly overhead for the TOP view.
//   • Orbit modes:  fixed radius + height, true arc around the look-target so
//                   the camera never cuts through the scene centre.
//   • TOP mode:     position lerps above the look-target; altitude shrinks when
//                   following a user so the avatar stays centred in view.
//   • Follow mode:  all parameters (radius, height, look-target, top-scale)
//                   lerp smoothly so entering/leaving follow is never a jump.
function CameraController({
  direction,
  followPositionRef,
}: {
  direction: CameraDirection
  followPositionRef?: MutableRefObject<Vector3 | null>
}) {
  // Reuse these vectors every frame — avoids per-frame heap allocations.
  const lookRef      = useRef(new Vector3(0, 0, 0))
  const targetLookRef = useRef(new Vector3(0, 0, 0))
  // Smoothly lerped orbit parameters so entering/leaving follow is gradual.
  const orbitRadiusRef = useRef(ORBIT_RADIUS)
  const orbitYRef      = useRef(ORBIT_Y)
  const topScaleRef    = useRef(1.0)

  useFrame((state, delta) => {
    const cam = state.camera
    const t = 1 - Math.pow(0.001, delta)

    const fp = followPositionRef?.current ?? null

    // Lerp the orbit/look centre toward the followed avatar (or back to origin).
    targetLookRef.current.set(
      fp ? fp.x : 0,
      0,
      fp ? fp.z : 0
    )
    lookRef.current.lerp(targetLookRef.current, t)
    const lx = lookRef.current.x
    const lz = lookRef.current.z

    // Lerp orbit parameters so mode transitions are smooth.
    const wantRadius   = fp ? FOLLOW_ORBIT_RADIUS : ORBIT_RADIUS
    const wantY        = fp ? FOLLOW_ORBIT_Y      : ORBIT_Y
    const wantTopScale = fp ? FOLLOW_TOP_SCALE    : 1.0
    orbitRadiusRef.current += (wantRadius   - orbitRadiusRef.current) * t
    orbitYRef.current      += (wantY        - orbitYRef.current)      * t
    topScaleRef.current    += (wantTopScale - topScaleRef.current)    * t
    const curRadius   = orbitRadiusRef.current
    const curY        = orbitYRef.current
    const curTopScale = topScaleRef.current

    if (direction === 'TOP') {
      const aspect = state.size.width / Math.max(state.size.height, 1)
      const fovRad = (fov * Math.PI) / 180
      const halfTan = Math.tan(fovRad / 2)
      const altByH = (planeH * curTopScale / 2) / halfTan
      const altByW = (planeW * curTopScale / 2) / (aspect * halfTan)
      const topTargetY = Math.max(altByH, altByW) * TOP_FIT_MARGIN

      cam.position.x += (lx       - cam.position.x) * t
      cam.position.y += (topTargetY - cam.position.y) * t
      cam.position.z += (lz + 0.001 - cam.position.z) * t

      cam.up.x += (0  - cam.up.x) * t
      cam.up.y += (0  - cam.up.y) * t
      cam.up.z += (-1 - cam.up.z) * t
      cam.up.normalize()
    } else {
      cam.up.x += (0 - cam.up.x) * t
      cam.up.y += (1 - cam.up.y) * t
      cam.up.z += (0 - cam.up.z) * t
      cam.up.normalize()

      const targetAzimuth = DIR_AZIMUTH[direction]
      const horizDist = Math.hypot(cam.position.x - lx, cam.position.z - lz)
      const onOrbit =
        Math.abs(horizDist - curRadius) < curRadius * 0.15 &&
        Math.abs(cam.position.y - curY) < Math.max(curY * 0.2, 0.5)

      if (onOrbit) {
        const currentAz = Math.atan2(cam.position.x - lx, cam.position.z - lz)
        let azDelta = targetAzimuth - currentAz
        if (azDelta > Math.PI)  azDelta -= 2 * Math.PI
        if (azDelta < -Math.PI) azDelta += 2 * Math.PI
        const newAz = currentAz + azDelta * t
        cam.position.set(
          lx + curRadius * Math.sin(newAz),
          curY,
          lz + curRadius * Math.cos(newAz)
        )
      } else {
        const targetX = lx + curRadius * Math.sin(targetAzimuth)
        const targetZ = lz + curRadius * Math.cos(targetAzimuth)
        cam.position.x += (targetX - cam.position.x) * t
        cam.position.y += (curY    - cam.position.y) * t
        cam.position.z += (targetZ - cam.position.z) * t
      }
    }

    cam.lookAt(lx, 0, lz)
  })
  return null
}

type Props = {
  users: UserFor3D[]
  sensors?: SensorWithStatus[]
  showSensors?: boolean
  debugMode?: boolean
  cameraDirection?: CameraDirection
  selectedUserId?: string | null
  onSelectUser?: (userId: string | null) => void
}

export default function Scene({
  users,
  sensors,
  showSensors = false,
  debugMode = false,
  cameraDirection = 'S',
  selectedUserId = null,
  onSelectUser,
}: Props) {
  // Written by the selected AvatarMesh every frame so the camera tracks the
  // avatar's actual rendered position — not the static sensor location. This
  // matters in debug-wander mode where the two diverge.
  const followPosRef = useRef<Vector3 | null>(null)

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

      <CameraController direction={cameraDirection} followPositionRef={selectedUserId ? followPosRef : undefined} />

      <Suspense fallback={null}>
        <Ground />
        <Walls />
        <PerforatedWalls />
        <Labels />
        {showSensors && sensors && <Sensors sensors={sensors} />}

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

        {/* Click-away plane — transparent, covers the whole floor so clicking
            empty space deselects any followed user. Avatars stop propagation
            so their own click fires instead of this one. */}
        <mesh
          position={[0, -0.02, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={() => onSelectUser?.(null)}
        >
          <planeGeometry args={[planeW + 20, planeH + 20]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

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
              isSelected={user.USERID === selectedUserId}
              followPosRef={user.USERID === selectedUserId ? followPosRef : undefined}
              onSelect={() => onSelectUser?.(
                user.USERID === selectedUserId ? null : user.USERID
              )}
            />
          )
        })}
      </Suspense>
    </Canvas>
  )
}
