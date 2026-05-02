'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Vector3, Group, Mesh, MeshStandardMaterial, DoubleSide } from 'three'
import layout from '@/config/layouts/default-layout.json'

const H = layout.avatar.figureHeight
const PLANE_W = layout.plane.width
const PLANE_H = layout.plane.height

// Stylised humanoid proportions tuned for a top-down 3D dashboard view.
// Vertical stack from the floor up:
//   foot · shin · knee · thigh · torso · neck · head
// Horizontal pairs (left/right) for shoulders, arms, hands & legs.

// Foot ----------------------------------------------------------------------
const FOOT_W = H * 0.07                      // narrower
const FOOT_H = H * 0.045
const FOOT_D = H * 0.13                      // shorter (heel → toe)
const FOOT_X = H * 0.075
const FOOT_Z = H * 0.02

// Lower leg / shin ----------------------------------------------------------
const SHIN_H = H * 0.21
const SHIN_R_TOP = H * 0.05
const SHIN_R_BOT = H * 0.04

// Knee ----------------------------------------------------------------------
const KNEE_R = H * 0.052

// Upper leg / thigh ---------------------------------------------------------
const THIGH_H = H * 0.22
const THIGH_R_TOP = H * 0.07
const THIGH_R_BOT = H * 0.05
const THIGH_X = FOOT_X
const HIP_Y = FOOT_H + SHIN_H + THIGH_H

// Local Y positions inside the per-leg <group> whose pivot sits at the hip.
// These let the whole leg rotate around the hip joint for the walk cycle.
const THIGH_LOCAL_Y = -THIGH_H * 0.5
const KNEE_LOCAL_Y = -THIGH_H
const SHIN_LOCAL_Y = -THIGH_H - SHIN_H * 0.5
const FOOT_LOCAL_Y = -THIGH_H - SHIN_H - FOOT_H * 0.5

// Torso ---------------------------------------------------------------------
const TORSO_H = H * 0.30
const TORSO_W = H * 0.26
const TORSO_D = H * 0.13
const TORSO_Y = HIP_Y + TORSO_H * 0.5
const TORSO_TOP = HIP_Y + TORSO_H

// Neck ----------------------------------------------------------------------
const NECK_H = H * 0.05
const NECK_R = H * 0.035
const NECK_Y = TORSO_TOP + NECK_H * 0.5

// Head ----------------------------------------------------------------------
const HEAD_R = H * 0.095
const HEAD_Y = TORSO_TOP + NECK_H + HEAD_R
// Subtle forward offset so the face leads the torso (the back of the skull
// extends behind the spine, not the centerline). Shows up nicely when the
// avatar turns and walks — gives a clearer "where am I looking" read.
const HEAD_Z = H * 0.02

// Arms ----------------------------------------------------------------------
// Each arm is wrapped in a <group> at the shoulder pivot and tilted slightly
// outward so the body reads as "relaxed standing" — hands subtly off the
// hips, not glued to them and not in a T-pose.
const ARM_Z = H * 0.03                       // forward offset for visibility
const ARM_TILT = 0.12                        // ≈ 7°, natural relaxed posture

const SHOULDER_R = H * 0.06
const SHOULDER_X = TORSO_W * 0.5 + H * 0.04  // outer side of torso
const SHOULDER_Y = TORSO_TOP - SHOULDER_R * 0.35

const U_ARM_H = H * 0.18                     // 5% shorter than before
const U_ARM_R_TOP = H * 0.05
const U_ARM_R_BOT = H * 0.044
const U_ARM_LOCAL_Y = -U_ARM_H * 0.5         // y-offset inside arm group

const ELBOW_R = H * 0.046
const ELBOW_LOCAL_Y = -U_ARM_H

const F_ARM_H = H * 0.17                     // 5% shorter than before
const F_ARM_R_TOP = H * 0.044
const F_ARM_R_BOT = H * 0.038
const F_ARM_LOCAL_Y = -U_ARM_H - F_ARM_H * 0.5

// Hand sphere is slightly smaller than the wrist (F_ARM_R_BOT = 0.038H) so
// it tucks into the forearm rather than ballooning out as a separate ball.
const HAND_R = H * 0.034
const HAND_LOCAL_Y = -U_ARM_H - F_ARM_H - HAND_R * 0.5

// Label ---------------------------------------------------------------------
const LABEL_Y = H + 0.12

export type UserFor3D = {
  USERID: string
  PREDICTED_LOCATION: string
  status: 'Active' | 'Inactive' | 'Offline'
  IS_REGISTERED: boolean
  authorized: boolean
}

type AvatarPalette = {
  color: string         // base diffuse color
  emissive: string      // glow color (usually same hue, deeper)
  intensity: number     // emissiveIntensity — 0 = no glow, 1 = strong glow
}

// ---------------------------------------------------------------------------
// ACTIVE palette — sampled from the reference render. Professional, muted,
// information conveyed primarily through the floor-ring indicator below.
// ---------------------------------------------------------------------------
function resolveColor(status: string, isRegistered: boolean, authorized: boolean): AvatarPalette {
  if (status === 'Offline') {
    return { color: '#475569', emissive: '#000000', intensity: 0 }
  }
  const dim = status === 'Inactive'
  if (isRegistered && authorized) {
    return dim
      ? { color: '#3f8aa0', emissive: '#000000', intensity: 0 }
      : { color: '#58a8c0', emissive: '#000000', intensity: 0 }
  }
  return dim
    ? { color: '#5e5e5e', emissive: '#000000', intensity: 0 }
    : { color: '#7e7e7e', emissive: '#000000', intensity: 0 }
}

// ---------------------------------------------------------------------------
// ALTERNATE palette — vivid red/blue with internal emissive glow. Swap into
// `resolveColor` above (rename and comment out the other) to use this look.
// ---------------------------------------------------------------------------
// function resolveColor(status: string, isRegistered: boolean, authorized: boolean): AvatarPalette {
//   if (status === 'Offline') {
//     return { color: '#475569', emissive: '#000000', intensity: 0 }
//   }
//   const dim = status === 'Inactive'
//   if (isRegistered && authorized) {
//     return dim
//       ? { color: '#1d4ed8', emissive: '#1e40af', intensity: 0.30 }
//       : { color: '#3b82f6', emissive: '#1d6dff', intensity: 0.55 }
//   }
//   return dim
//     ? { color: '#b91c1c', emissive: '#7f1d1d', intensity: 0.30 }
//     : { color: '#ef4444', emissive: '#dc2626', intensity: 0.55 }
// }

// Floor-ring indicator under each avatar. Red = threat (intruder /
// unauthorized), Blue = trusted (authorized user). Returns `null` for offline
// avatars (they don't get a ring).
type RingPalette = { color: string; emissive: string; intensity: number }

function resolveRing(
  status: string,
  isRegistered: boolean,
  authorized: boolean
): RingPalette | null {
  if (status === 'Offline') return null
  if (isRegistered && authorized) {
    return { color: '#3b82f6', emissive: '#1d6dff', intensity: 1.0 }
  }
  return { color: '#ef4444', emissive: '#ff4242', intensity: 1.0 }
}

// Ring geometry, in world units. Sits on the floor centered under the
// avatar's pelvis so it reads as a target/halo without overlapping feet.
const RING_INNER = H * 0.22
const RING_OUTER = H * 0.28
const RING_Y = 0.012  // just above floor — clears the white base ground

function resolveLabel(user: UserFor3D) {
  if (!user.IS_REGISTERED) return 'Intruder'
  if (!user.authorized) return 'Unauthorized'
  return `User-${user.USERID}`
}

type Props = {
  user: UserFor3D
  targetPosition: [number, number, number]
  debugMode?: boolean
}

// Walk-cycle tuning ---------------------------------------------------------
// Limb swing angles (radians) and animation gating thresholds. Tuned for
// readability from the top-down camera; smaller values look stiff, larger
// look cartoonish.
const LEG_SWING = 0.55                       // ~31°
const ARM_SWING = 0.45                       // ~26°
const WALK_FREQ = 3.0                        // base radians/s ⇒ ~0.5 Hz cycle
const WALK_SPEED_GAIN = 0.6                  // extra freq per world unit/s
const WALK_START_SPEED = 0.12                // world units/s threshold to start
const WALK_BLEND_RATE = 5                    // 1/s — how fast walk fades in/out

// Direction-change tuning ---------------------------------------------------
// "Significant" turn = avatar rotates in place first, then walks. Below the
// threshold the heading just smoothly tracks motion direction. Cooldown +
// minimum-distance gate prevent jittery flip-flops.
const TURN_THRESHOLD = Math.PI / 3           // 60°
const TURN_RATE = 6                          // rad/s during in-place turn
const TRACK_RATE = 7                         // rad/s when smoothly tracking
const TURN_MIN_DISTANCE = 0.5                // skip turning if target is right here
const TURN_COOLDOWN = 0.25                   // 250 ms after a turn before another
const TURN_DONE_TOL = 0.05                   // ~3° — close enough to settle

// Debug-wander tuning -------------------------------------------------------
// In debug mode each avatar walks at a steady speed in some heading,
// occasionally picks a new heading, and bounces off the scene's outer
// rectangle so it stays in view. This is used to drive realistic motion
// for testing the walk + turn animations — it intentionally ignores walls
// (the floor is the playable area).
const DEBUG_SPEED = 0.7                      // world units / second (~human walk)
const DEBUG_DIR_MIN_INTERVAL = 2.0           // seconds — earliest random heading change
const DEBUG_DIR_MAX_INTERVAL = 5.0           // seconds — latest random heading change
const DEBUG_BOUND_MARGIN = 0.5               // keep avatar this far inside the plane edge

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

export function AvatarMesh({ user, targetPosition, debugMode = false }: Props) {
  const groupRef = useRef<Group>(null)
  const ringMeshRef = useRef<Mesh>(null)
  const posRef = useRef(new Vector3(...targetPosition))
  const lastPosRef = useRef(new Vector3(...targetPosition))
  const [hovered, setHovered] = useState(false)

  // Limb groups so the walk cycle can rotate the whole leg/arm around its
  // hip/shoulder pivot.
  const leftLegRef = useRef<Group>(null)
  const rightLegRef = useRef<Group>(null)
  const leftArmRef = useRef<Group>(null)
  const rightArmRef = useRef<Group>(null)

  // Walk-cycle state
  const walkPhaseRef = useRef(0)
  const walkBlendRef = useRef(0)             // 0 = idle, 1 = walking

  // Direction state
  const yawRef = useRef(0)                   // current rotation.y
  const targetYawRef = useRef(0)             // yaw we're rotating toward
  const turningRef = useRef(false)           // in TURNING state (no translation)
  const turnCooldownRef = useRef(0)          // seconds remaining before next turn

  // Debug-wander state. Initialized lazily on the first debug frame so the
  // avatar starts wandering from wherever it happens to be when debug toggles
  // ON, rather than snapping to its PREDICTED_LOCATION.
  const debugStateRef = useRef({ x: 0, z: 0, heading: 0, nextDirChange: 0 })
  const debugInitRef = useRef(false)

  // Stable per-avatar phase offset so rings don't all pulse in unison.
  const pulsePhase = useMemo(() => {
    let h = 0
    for (let i = 0; i < user.USERID.length; i++) {
      h = (h * 31 + user.USERID.charCodeAt(i)) | 0
    }
    return ((h >>> 0) % 1000) / 1000 * Math.PI * 2
  }, [user.USERID])

  // Enable shadow casting on every body mesh in one pass so we don't have to
  // sprinkle `castShadow` across all 21 limb/torso elements. The floor ring
  // is excluded — it lives on the ground plane and would project a weird
  // disk shadow underneath itself.
  useLayoutEffect(() => {
    if (!groupRef.current) return
    groupRef.current.traverse((obj) => {
      if (obj instanceof Mesh && obj !== ringMeshRef.current) {
        obj.castShadow = true
        obj.receiveShadow = true
      }
    })
  }, [])

  useFrame((state, delta) => {
    if (!groupRef.current) return

    if (debugMode) {
      // ===== Debug wander =================================================
      // Each avatar walks at constant speed in some heading, picks a new
      // heading every few seconds, and bounces off the plane edges. Position
      // is set directly (no lerp) so speed is exactly DEBUG_SPEED.

      if (!debugInitRef.current) {
        debugStateRef.current = {
          x: posRef.current.x,
          z: posRef.current.z,
          heading: Math.random() * Math.PI * 2,
          nextDirChange:
            state.clock.elapsedTime +
            DEBUG_DIR_MIN_INTERVAL +
            Math.random() * (DEBUG_DIR_MAX_INTERVAL - DEBUG_DIR_MIN_INTERVAL),
        }
        debugInitRef.current = true
      }

      const ds = debugStateRef.current

      // Random heading change after the scheduled time
      if (state.clock.elapsedTime >= ds.nextDirChange) {
        ds.heading = Math.random() * Math.PI * 2
        ds.nextDirChange =
          state.clock.elapsedTime +
          DEBUG_DIR_MIN_INTERVAL +
          Math.random() * (DEBUG_DIR_MAX_INTERVAL - DEBUG_DIR_MIN_INTERVAL)
      }

      // Advance. Heading=0 → walk toward +Z (matching yaw convention).
      ds.x += Math.sin(ds.heading) * DEBUG_SPEED * delta
      ds.z += Math.cos(ds.heading) * DEBUG_SPEED * delta

      // Reflect off plane bounds and reverse the relevant axis component
      // of the heading. Mirror across X-axis for X bounces, Z-axis for Z.
      const HW = PLANE_W / 2 - DEBUG_BOUND_MARGIN
      const HH = PLANE_H / 2 - DEBUG_BOUND_MARGIN
      if (ds.x > HW) {
        ds.x = HW
        ds.heading = -ds.heading                      // sin → -sin, cos unchanged
      } else if (ds.x < -HW) {
        ds.x = -HW
        ds.heading = -ds.heading
      }
      if (ds.z > HH) {
        ds.z = HH
        ds.heading = Math.PI - ds.heading             // cos → -cos, sin unchanged
      } else if (ds.z < -HH) {
        ds.z = -HH
        ds.heading = Math.PI - ds.heading
      }

      posRef.current.set(ds.x, 0, ds.z)
      groupRef.current.position.copy(posRef.current)

      // Smoothly track the heading for facing direction. No turn-in-place
      // state — wander headings change abruptly enough that mid-stride
      // pivoting reads as natural.
      const yawDiff = wrapAngle(ds.heading - yawRef.current)
      const blendY = 1 - Math.exp(-TRACK_RATE * delta)
      yawRef.current = wrapAngle(yawRef.current + yawDiff * blendY)
      groupRef.current.rotation.y = yawRef.current

      // Make sure the normal-mode state is fresh when we switch back
      turningRef.current = false
      turnCooldownRef.current = 0
    } else {
      // ===== Normal mode: lerp + turn-first state machine =================
      debugInitRef.current = false                    // reset wander on next ON

      const tx = targetPosition[0]
      const tz = targetPosition[2]
      const dx = tx - posRef.current.x
      const dz = tz - posRef.current.z
      const distToTarget = Math.hypot(dx, dz)

      // Desired yaw: face the target if it's far enough to matter; otherwise
      // keep current heading (avoids spinning randomly when essentially stopped).
      const desiredYaw =
        distToTarget > 0.05 ? Math.atan2(dx, dz) : yawRef.current
      const yawDiff = wrapAngle(desiredYaw - yawRef.current)

      // Trigger TURNING state only when the change is meaningful AND we have
      // enough distance left to walk AND we're not in cooldown from a recent
      // turn. This is the anti-jitter gate.
      if (
        !turningRef.current &&
        Math.abs(yawDiff) > TURN_THRESHOLD &&
        distToTarget > TURN_MIN_DISTANCE &&
        turnCooldownRef.current <= 0
      ) {
        turningRef.current = true
        targetYawRef.current = desiredYaw
      }

      if (turningRef.current) {
        const remaining = wrapAngle(targetYawRef.current - yawRef.current)
        const step =
          Math.sign(remaining) *
          Math.min(Math.abs(remaining), TURN_RATE * delta)
        yawRef.current = wrapAngle(yawRef.current + step)
        if (Math.abs(remaining) < TURN_DONE_TOL) {
          yawRef.current = targetYawRef.current
          turningRef.current = false
          turnCooldownRef.current = TURN_COOLDOWN
        }
      } else {
        if (distToTarget > 0.05) {
          const blend = 1 - Math.exp(-TRACK_RATE * delta)
          yawRef.current = wrapAngle(yawRef.current + yawDiff * blend)
        }
        turnCooldownRef.current = Math.max(0, turnCooldownRef.current - delta)
      }

      groupRef.current.rotation.y = yawRef.current

      if (!turningRef.current) {
        const t = 1 - Math.pow(0.001, delta)
        posRef.current.lerp(new Vector3(tx, targetPosition[1], tz), t)
        groupRef.current.position.copy(posRef.current)
      }
    }

    // ===== Walk cycle (common to both modes) ===========================
    const speed =
      posRef.current.distanceTo(lastPosRef.current) / Math.max(delta, 1e-4)
    lastPosRef.current.copy(posRef.current)

    const wantWalk = !turningRef.current && speed > WALK_START_SPEED ? 1 : 0
    walkBlendRef.current +=
      (wantWalk - walkBlendRef.current) *
      (1 - Math.exp(-WALK_BLEND_RATE * delta))

    if (walkBlendRef.current > 0.01) {
      walkPhaseRef.current += delta * (WALK_FREQ + speed * WALK_SPEED_GAIN)
    }

    const phase = walkPhaseRef.current
    const blend = walkBlendRef.current
    const legSwing = Math.sin(phase) * LEG_SWING * blend
    const armSwing = Math.sin(phase) * ARM_SWING * blend

    if (rightLegRef.current) rightLegRef.current.rotation.x = legSwing
    if (leftLegRef.current) leftLegRef.current.rotation.x = -legSwing
    if (rightArmRef.current) rightArmRef.current.rotation.x = -armSwing
    if (leftArmRef.current) leftArmRef.current.rotation.x = armSwing

    // ===== Floor ring pulse ============================================
    if (ringMeshRef.current) {
      const pulse =
        1 + Math.sin(state.clock.elapsedTime * Math.PI + pulsePhase) * 0.08
      ringMeshRef.current.scale.set(pulse, pulse, pulse)
    }
  })

  const palette = resolveColor(user.status, user.IS_REGISTERED, user.authorized)
  const ring = resolveRing(user.status, user.IS_REGISTERED, user.authorized)
  const label = resolveLabel(user)

  // One shared material per avatar instead of per mesh — keeps the GPU's
  // material/uniform cache warm across all 21 body parts and lets us tweak
  // emissive intensity (status changes) cheaply.
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: palette.color,
        emissive: palette.emissive,
        emissiveIntensity: palette.intensity,
        metalness: 0.4,
        roughness: 0.3,
      }),
    [palette.color, palette.emissive, palette.intensity]
  )

  useEffect(() => () => material.dispose(), [material])

  // Floor-ring material — separate from the body material because it lives
  // on the floor (not on the avatar mesh) and uses a different look (always
  // glowing, slightly transparent, double-sided so it stays visible from
  // any camera tilt).
  const ringMaterial = useMemo(() => {
    if (!ring) return null
    return new MeshStandardMaterial({
      color: ring.color,
      emissive: ring.emissive,
      emissiveIntensity: ring.intensity,
      metalness: 0.1,
      roughness: 0.4,
      transparent: true,
      opacity: 0.85,
      side: DoubleSide,
    })
  }, [ring])

  useEffect(() => {
    if (!ringMaterial) return
    return () => ringMaterial.dispose()
  }, [ringMaterial])

  return (
    <group
      ref={groupRef}
      position={posRef.current.toArray() as [number, number, number]}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {/* Floor-ring role indicator — red = threat, blue = trusted user.
          Pulses gently to draw attention without being distracting. */}
      {ringMaterial && (
        <mesh
          ref={ringMeshRef}
          position={[0, RING_Y, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={ringMaterial}
          renderOrder={1}
        >
          <ringGeometry args={[RING_INNER, RING_OUTER, 48]} />
        </mesh>
      )}

      {/* Head */}
      <mesh position={[0, HEAD_Y, HEAD_Z]} material={material} castShadow>
        <sphereGeometry args={[HEAD_R, 18, 14]} />
      </mesh>

      {/* Neck */}
      <mesh position={[0, NECK_Y, 0]} material={material}>
        <cylinderGeometry args={[NECK_R, NECK_R * 1.1, NECK_H, 12]} />
      </mesh>

      {/* Torso */}
      <mesh position={[0, TORSO_Y, 0]} material={material}>
        <boxGeometry args={[TORSO_W, TORSO_H, TORSO_D]} />
      </mesh>

      {/* Right arm. Wrapped in a group at the shoulder pivot. Initial Z tilt
          gives the relaxed posture; the walk cycle drives rotation.x so the
          arm swings forward/back from this resting offset. */}
      <group
        ref={rightArmRef}
        position={[SHOULDER_X, SHOULDER_Y, ARM_Z]}
        rotation={[0, 0, ARM_TILT]}
      >
        <mesh material={material}>
          <sphereGeometry args={[SHOULDER_R, 12, 10]} />
        </mesh>
        <mesh position={[0, U_ARM_LOCAL_Y, 0]} material={material}>
          <cylinderGeometry args={[U_ARM_R_TOP, U_ARM_R_BOT, U_ARM_H, 10]} />
        </mesh>
        <mesh position={[0, ELBOW_LOCAL_Y, 0]} material={material}>
          <sphereGeometry args={[ELBOW_R, 10, 8]} />
        </mesh>
        <mesh position={[0, F_ARM_LOCAL_Y, 0]} material={material}>
          <cylinderGeometry args={[F_ARM_R_TOP, F_ARM_R_BOT, F_ARM_H, 10]} />
        </mesh>
        <mesh position={[0, HAND_LOCAL_Y, 0]} material={material}>
          <sphereGeometry args={[HAND_R, 10, 8]} />
        </mesh>
      </group>

      {/* Left arm: mirror via negative X position and opposite tilt sign */}
      <group
        ref={leftArmRef}
        position={[-SHOULDER_X, SHOULDER_Y, ARM_Z]}
        rotation={[0, 0, -ARM_TILT]}
      >
        <mesh material={material}>
          <sphereGeometry args={[SHOULDER_R, 12, 10]} />
        </mesh>
        <mesh position={[0, U_ARM_LOCAL_Y, 0]} material={material}>
          <cylinderGeometry args={[U_ARM_R_TOP, U_ARM_R_BOT, U_ARM_H, 10]} />
        </mesh>
        <mesh position={[0, ELBOW_LOCAL_Y, 0]} material={material}>
          <sphereGeometry args={[ELBOW_R, 10, 8]} />
        </mesh>
        <mesh position={[0, F_ARM_LOCAL_Y, 0]} material={material}>
          <cylinderGeometry args={[F_ARM_R_TOP, F_ARM_R_BOT, F_ARM_H, 10]} />
        </mesh>
        <mesh position={[0, HAND_LOCAL_Y, 0]} material={material}>
          <sphereGeometry args={[HAND_R, 10, 8]} />
        </mesh>
      </group>

      {/* Right leg. Whole-leg group pivots at the hip so rotation.x produces
          a clean forward/back swing. Pieces are positioned relative to the
          hip joint (top of thigh = local 0). */}
      <group ref={rightLegRef} position={[THIGH_X, HIP_Y, 0]}>
        <mesh position={[0, THIGH_LOCAL_Y, 0]} material={material}>
          <cylinderGeometry args={[THIGH_R_TOP, THIGH_R_BOT, THIGH_H, 10]} />
        </mesh>
        <mesh position={[0, KNEE_LOCAL_Y, 0]} material={material}>
          <sphereGeometry args={[KNEE_R, 10, 8]} />
        </mesh>
        <mesh position={[0, SHIN_LOCAL_Y, 0]} material={material}>
          <cylinderGeometry args={[SHIN_R_TOP, SHIN_R_BOT, SHIN_H, 10]} />
        </mesh>
        <mesh position={[0, FOOT_LOCAL_Y, FOOT_Z]} material={material}>
          <boxGeometry args={[FOOT_W, FOOT_H, FOOT_D]} />
        </mesh>
      </group>

      {/* Left leg: mirror via negative X position. */}
      <group ref={leftLegRef} position={[-THIGH_X, HIP_Y, 0]}>
        <mesh position={[0, THIGH_LOCAL_Y, 0]} material={material}>
          <cylinderGeometry args={[THIGH_R_TOP, THIGH_R_BOT, THIGH_H, 10]} />
        </mesh>
        <mesh position={[0, KNEE_LOCAL_Y, 0]} material={material}>
          <sphereGeometry args={[KNEE_R, 10, 8]} />
        </mesh>
        <mesh position={[0, SHIN_LOCAL_Y, 0]} material={material}>
          <cylinderGeometry args={[SHIN_R_TOP, SHIN_R_BOT, SHIN_H, 10]} />
        </mesh>
        <mesh position={[0, FOOT_LOCAL_Y, FOOT_Z]} material={material}>
          <boxGeometry args={[FOOT_W, FOOT_H, FOOT_D]} />
        </mesh>
      </group>

      {/* Persistent name label — only for authorized registered users.
          Intruder / Unauthorized roles are conveyed by the floor ring color,
          and full details stay accessible via the hover tooltip below.
          Hovering any avatar (including Intruders) also surfaces its label. */}
      {(user.IS_REGISTERED && user.authorized) || hovered ? (
        <Html position={[0, LABEL_Y, 0]} center zIndexRange={[10, 0]}>
          <div
            style={{
              fontSize: 10,
              whiteSpace: 'nowrap',
              color: 'white',
              textShadow: '0 0 3px black, 0 0 3px black',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            {label}
          </div>
        </Html>
      ) : null}

      {hovered && (
        <Html position={[0, LABEL_Y + 0.35, 0]} center zIndexRange={[20, 0]}>
          <div
            style={{
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 11,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            }}
          >
            <p style={{ fontWeight: 'bold', marginBottom: 2 }}>
              {label}: {user.USERID}
            </p>
            <p>Location: {user.PREDICTED_LOCATION}</p>
            <p>Status: {user.status}</p>
          </div>
        </Html>
      )}
    </group>
  )
}
