'use client'

import { MutableRefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Vector3, Group, Mesh, MeshStandardMaterial, DoubleSide } from 'three'
import layout from '@/config/layouts/default-layout.json'
import { findPath, type Point } from '@/lib/pathfinding'

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

// Local Y positions inside the per-leg <group> (pivot at the hip). The thigh
// + knee sphere stay parented to this group; the shin/foot live in a NESTED
// <group> at the knee, which is what allows the knee to actually flex.
const THIGH_LOCAL_Y = -THIGH_H * 0.5
const KNEE_LOCAL_Y = -THIGH_H

// Local Y positions inside the shin <group> (pivot at the knee). The shin
// extends downward from the knee; the foot sits at the bottom of the shin.
const SHIN_RELATIVE_Y = -SHIN_H * 0.5
const FOOT_RELATIVE_Y = -SHIN_H - FOOT_H * 0.5

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
// Elbow position inside the arm group — also where the forearm <group> is
// anchored. Forearm + hand are NESTED in that sub-group so the elbow can
// actually flex; upper arm + elbow sphere stay parented to the arm group.
const ELBOW_LOCAL_Y = -U_ARM_H

const F_ARM_H = H * 0.17                     // 5% shorter than before
const F_ARM_R_TOP = H * 0.044
const F_ARM_R_BOT = H * 0.038
// Forearm + hand positions inside the forearm <group> (pivot at the elbow).
const F_ARM_RELATIVE_Y = -F_ARM_H * 0.5

// Hand sphere is slightly smaller than the wrist (F_ARM_R_BOT = 0.038H) so
// it tucks into the forearm rather than ballooning out as a separate ball.
const HAND_R = H * 0.034
const HAND_RELATIVE_Y = -F_ARM_H - HAND_R * 0.5

// Label ---------------------------------------------------------------------
const LABEL_Y = H + 0.12

export type UserFor3D = {
  USERID: string
  PREDICTED_LOCATION: string
  status: 'Active' | 'Inactive' | 'Offline'
  IS_REGISTERED: boolean
  authorized: boolean
  // True once this user has been confirmed as having actually left the
  // building (last seen near an entry/exit sensor, then went stale). Avatar
  // shrinks out over DESPAWN_FADE_RATE seconds instead of just vanishing.
  despawning?: boolean
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

// Selection ring — gold outer halo, rendered when this avatar is being followed.
const SEL_RING_INNER = H * 0.34
const SEL_RING_OUTER = H * 0.46
const SEL_RING_Y = 0.008

function resolveLabel(user: UserFor3D) {
  if (!user.IS_REGISTERED) return 'Intruder'
  if (!user.authorized) return 'Unauthorized'
  return `User-${user.USERID}`
}

type Props = {
  user: UserFor3D
  targetPosition: [number, number, number]
  debugMode?: boolean
  isSelected?: boolean
  followPosRef?: MutableRefObject<Vector3 | null>
  onSelect?: () => void
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

// Joint-flex tuning ---------------------------------------------------------
// Knees and elbows now have real pivots (the shin/forearm groups). These
// constants drive how much they bend during the walk cycle.
//   • Knees flex during swing-through (foot lifting back→front), peak at
//     mid-swing, straight at toe-off and heel-strike.
//   • Elbows carry a small base flex while walking and gain a touch more
//     at the forward swing peak (hand drawn slightly toward the chest).
const KNEE_BEND_MAX = 0.85                   // ~49° at mid-swing peak
const ELBOW_BASE_BEND = 0.20                 // ~11° baseline while walking
const ELBOW_VARY_BEND = 0.20                 // ~11° extra at forward swing peak

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

// Waypoint-following tuning ---------------------------------------------
// When a new sensor reading places the user somewhere else, a route through
// doors/pathways is computed once (see src/lib/pathfinding.ts) — a polyline
// through however many waypoints it takes to go via doors instead of
// through walls. That whole route (not each individual leg) is walked over
// one fixed wall-clock duration: position is parametrized by arc-length
// along the polyline, and arc-length traveled is driven by elapsed time /
// TOTAL_TRAVEL_SECONDS, so the avatar always reaches the destination in
// (about) this many seconds regardless of how many doors it passes through
// or how long the route is — this is the one constant to change if travel
// should be faster or slower.
const TOTAL_TRAVEL_SECONDS = 2.0

// Finds the point at the given arc-length distance `d` along a polyline
// (`points`, with precomputed cumulative segment distances `cumDist`,
// cumDist[0] === 0 and cumDist[i] = length of points[0..i]). Also returns
// the direction of the segment currently being walked, for facing.
function samplePolylineAtDistance(
  points: Point[],
  cumDist: number[],
  d: number,
): { x: number; z: number; dirX: number; dirZ: number } {
  const total = cumDist[cumDist.length - 1]
  const clamped = Math.max(0, Math.min(d, total))
  let i = 0
  while (i < cumDist.length - 2 && cumDist[i + 1] < clamped) i++
  const [sx, sz] = points[i]
  const [ex, ez] = points[i + 1] ?? points[i]
  const segLen = cumDist[i + 1] - cumDist[i]
  const segT = segLen > 1e-6 ? (clamped - cumDist[i]) / segLen : 1
  return { x: sx + (ex - sx) * segT, z: sz + (ez - sz) * segT, dirX: ex - sx, dirZ: ez - sz }
}

// Despawn tuning -----------------------------------------------------------
// Once a user is confirmed to have actually left (see Map.tsx), the avatar
// shrinks out instead of just disappearing.
const DESPAWN_SHRINK_RATE = 2.2              // 1/s — exponential scale-to-zero speed

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

export function AvatarMesh({ user, targetPosition, debugMode = false, isSelected = false, followPosRef, onSelect }: Props) {
  const groupRef = useRef<Group>(null)
  const ringMeshRef = useRef<Mesh>(null)
  const selRingRef  = useRef<Mesh>(null)
  const hitboxRef   = useRef<Mesh>(null)
  const posRef = useRef(new Vector3(...targetPosition))
  const lastPosRef = useRef(new Vector3(...targetPosition))
  const [hovered, setHovered] = useState(false)

  // Tooltip fade state. `tooltipMounted` keeps the Html in the DOM during the
  // fade-out; `tooltipVisible` drives CSS opacity so the transition actually
  // plays. A close timer provides the hover-away window before it starts fading.
  const [tooltipMounted,  setTooltipMounted]  = useState(false)
  const [tooltipVisible,  setTooltipVisible]  = useState(false)
  const closeTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Limb groups. The outer ref pivots the whole limb at the hip/shoulder.
  // The shin/forearm refs are NESTED inside their parent limb — they pivot
  // at the knee/elbow so we get real joint flex, not a rigid rotation.
  const leftLegRef = useRef<Group>(null)
  const rightLegRef = useRef<Group>(null)
  const leftShinRef = useRef<Group>(null)
  const rightShinRef = useRef<Group>(null)
  const leftArmRef = useRef<Group>(null)
  const rightArmRef = useRef<Group>(null)
  const leftForearmRef = useRef<Group>(null)
  const rightForearmRef = useRef<Group>(null)

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

  // Route-following state. `lastTargetKeyRef` detects when the incoming
  // targetPosition actually moved (a real relocation) vs. an unrelated
  // re-render, so the route through pathfinding.ts is only (re)computed on
  // real changes. `pathPointsRef` is [positionWhenRouteStarted, ...waypoints]
  // with `pathCumDistRef` the cumulative arc-length at each point — together
  // they let position be sampled directly from elapsed time (see
  // samplePolylineAtDistance) instead of chasing a moving lerp target.
  const lastTargetKeyRef = useRef<string | null>(null)
  const pathPointsRef = useRef<Point[]>([])
  const pathCumDistRef = useRef<number[]>([0])
  const pathTotalDistRef = useRef(0)
  const pathElapsedRef = useRef(0)

  // Despawn shrink state — 1 = full size, lerps to 0 while despawning.
  const despawnScaleRef = useRef(1)

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
      if (obj instanceof Mesh && obj !== ringMeshRef.current && obj !== hitboxRef.current) {
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

      // Recompute the route whenever the destination actually changes (a
      // fresh sensor reading placed the user somewhere new). Routing through
      // pathfinding.ts means the walk goes via doors/pathways instead of
      // straight through walls — this matters most after a signal gap,
      // where the avatar was frozen in place and then jumps to wherever it
      // was last seen. The whole resulting route — however many waypoints
      // it takes — becomes one polyline walked as a single arc-length
      // parametrized path, so the avatar always reaches the destination in
      // TOTAL_TRAVEL_SECONDS regardless of how many legs the route has.
      const targetKey = `${targetPosition[0].toFixed(2)}|${targetPosition[2].toFixed(2)}`
      if (targetKey !== lastTargetKeyRef.current) {
        lastTargetKeyRef.current = targetKey
        const waypoints = findPath(
          [posRef.current.x, posRef.current.z],
          [targetPosition[0], targetPosition[2]],
        )
        const points: Point[] = [[posRef.current.x, posRef.current.z], ...waypoints]
        const cumDist: number[] = [0]
        for (let i = 1; i < points.length; i++) {
          cumDist.push(
            cumDist[i - 1] +
              Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]),
          )
        }
        pathPointsRef.current = points
        pathCumDistRef.current = cumDist
        pathTotalDistRef.current = cumDist[cumDist.length - 1]
        pathElapsedRef.current = 0
      }

      // Sample the route at the arc-length distance implied by elapsed
      // walking time. Eased so it settles into the destination instead of
      // stopping on a hard cut. `pathElapsedRef` only advances while
      // actually translating (see below), so an in-place turn doesn't eat
      // into the travel budget.
      const rawProgress = Math.min(pathElapsedRef.current / TOTAL_TRAVEL_SECONDS, 1)
      const easedProgress = 1 - (1 - rawProgress) * (1 - rawProgress)
      const sample = samplePolylineAtDistance(
        pathPointsRef.current,
        pathCumDistRef.current,
        pathTotalDistRef.current * easedProgress,
      )
      const distRemaining = pathTotalDistRef.current * (1 - rawProgress)

      // Desired yaw: face the direction of the route segment currently
      // being walked; otherwise keep current heading (avoids spinning
      // randomly when essentially stopped).
      const desiredYaw =
        distRemaining > 0.05 ? Math.atan2(sample.dirX, sample.dirZ) : yawRef.current
      const yawDiff = wrapAngle(desiredYaw - yawRef.current)

      // Trigger TURNING state only when the change is meaningful AND we have
      // enough distance left to walk AND we're not in cooldown from a recent
      // turn. This is the anti-jitter gate.
      if (
        !turningRef.current &&
        Math.abs(yawDiff) > TURN_THRESHOLD &&
        distRemaining > TURN_MIN_DISTANCE &&
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
        if (distRemaining > 0.05) {
          const blend = 1 - Math.exp(-TRACK_RATE * delta)
          yawRef.current = wrapAngle(yawRef.current + yawDiff * blend)
        }
        turnCooldownRef.current = Math.max(0, turnCooldownRef.current - delta)
      }

      groupRef.current.rotation.y = yawRef.current

      if (!turningRef.current) {
        // Advance the walking-time budget and re-sample the route at the
        // resulting arc-length — this is what actually moves the avatar.
        // Elapsed only accrues here (not during an in-place turn), so
        // TOTAL_TRAVEL_SECONDS always means "seconds of walking," regardless
        // of frame rate or machine speed.
        pathElapsedRef.current += delta
        const p = Math.min(pathElapsedRef.current / TOTAL_TRAVEL_SECONDS, 1)
        const eased = 1 - (1 - p) * (1 - p)
        const moved = samplePolylineAtDistance(
          pathPointsRef.current,
          pathCumDistRef.current,
          pathTotalDistRef.current * eased,
        )
        posRef.current.set(moved.x, targetPosition[1], moved.z)
        groupRef.current.position.copy(posRef.current)
      }
    }

    // Keep the camera ref in sync with the avatar's actual rendered position.
    if (followPosRef) followPosRef.current = posRef.current

    // ===== Despawn shrink ===============================================
    // Confirmed-left users (see Map.tsx) shrink out instead of popping away.
    // The parent keeps the user mounted for a bit longer than this so the
    // shrink actually finishes before removal.
    const wantScale = user.despawning ? 0 : 1
    despawnScaleRef.current +=
      (wantScale - despawnScaleRef.current) * (1 - Math.exp(-DESPAWN_SHRINK_RATE * delta))
    groupRef.current.scale.setScalar(despawnScaleRef.current)

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
    const sinPhase = Math.sin(phase)
    const cosPhase = Math.cos(phase)

    // Hip / shoulder swing (whole-limb rotation around its top pivot).
    const legSwing = sinPhase * LEG_SWING * blend
    const armSwing = sinPhase * ARM_SWING * blend

    // Knee flex. With rightLeg.rotation.x = +sin(phase), the right leg is at
    // the back of its arc when sin>0 and at the front when sin<0; the swing-
    // through (back→front) phase therefore happens while sin is decreasing,
    // i.e. cos<0 — that's where the knee flexes most. Left leg uses opposite
    // hip swing, so its swing-through is at cos>0. max(0,...) keeps the knee
    // flexing only one direction (backwards toward the butt).
    const rightKneeBend = Math.max(0, -cosPhase) * KNEE_BEND_MAX * blend
    const leftKneeBend = Math.max(0, cosPhase) * KNEE_BEND_MAX * blend

    // Elbow flex. rightArm.rotation.x = -sin(phase), so the right arm is
    // forward when sin>0 (matched to right-leg-back, opposite-limb gait).
    // We add a small base bend during walk + a touch more at the forward
    // swing peak. Negative rotation.x flexes the forearm forward (hand
    // toward chest) since the forearm hangs in -Y from the elbow.
    const rightElbowBend = (ELBOW_BASE_BEND + Math.max(0, sinPhase) * ELBOW_VARY_BEND) * blend
    const leftElbowBend = (ELBOW_BASE_BEND + Math.max(0, -sinPhase) * ELBOW_VARY_BEND) * blend

    if (rightLegRef.current) rightLegRef.current.rotation.x = legSwing
    if (leftLegRef.current) leftLegRef.current.rotation.x = -legSwing
    if (rightShinRef.current) rightShinRef.current.rotation.x = rightKneeBend
    if (leftShinRef.current) leftShinRef.current.rotation.x = leftKneeBend
    if (rightArmRef.current) rightArmRef.current.rotation.x = -armSwing
    if (leftArmRef.current) leftArmRef.current.rotation.x = armSwing
    if (rightForearmRef.current) rightForearmRef.current.rotation.x = -rightElbowBend
    if (leftForearmRef.current) leftForearmRef.current.rotation.x = -leftElbowBend

    // ===== Floor ring pulse ============================================
    if (ringMeshRef.current) {
      const pulse =
        1 + Math.sin(state.clock.elapsedTime * Math.PI + pulsePhase) * 0.08
      ringMeshRef.current.scale.set(pulse, pulse, pulse)
    }

    // ===== Selection ring pulse (faster, larger) ========================
    if (selRingRef.current) {
      const pulse =
        1 + Math.sin(state.clock.elapsedTime * Math.PI * 2.4 + pulsePhase) * 0.14
      selRingRef.current.scale.set(pulse, pulse, pulse)
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

  // Gold selection ring — only created when this avatar is being followed.
  const selRingMaterial = useMemo(() => {
    if (!isSelected) return null
    return new MeshStandardMaterial({
      color: '#fbbf24',
      emissive: '#f59e0b',
      emissiveIntensity: 1.6,
      metalness: 0.1,
      roughness: 0.3,
      transparent: true,
      opacity: 0.92,
      side: DoubleSide,
    })
  }, [isSelected])

  useEffect(() => {
    if (!selRingMaterial) return
    return () => selRingMaterial.dispose()
  }, [selRingMaterial])

  useEffect(() => () => {
    if (closeTimerRef.current)   clearTimeout(closeTimerRef.current)
    if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current)
  }, [])

  return (
    <group
      ref={groupRef}
      position={posRef.current.toArray() as [number, number, number]}
      onPointerEnter={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'pointer'
        if (closeTimerRef.current)   clearTimeout(closeTimerRef.current)
        if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current)
        setTooltipMounted(true)
        // Mount first (opacity 0), then flip visible on the next frame so the
        // CSS transition has a start state to animate from.
        requestAnimationFrame(() => setTooltipVisible(true))
      }}
      onPointerLeave={() => {
        setHovered(false)
        document.body.style.cursor = 'auto'
        // Small window before the panel starts closing so brief cursor
        // exits don't cause a flicker.
        closeTimerRef.current = setTimeout(() => {
          setTooltipVisible(false)
          unmountTimerRef.current = setTimeout(() => setTooltipMounted(false), 220)
        }, 400)
      }}
      onClick={(e) => { e.stopPropagation(); onSelect?.() }}
    >
      {/* Invisible hitbox — a generous cylinder that makes the avatar easy to
          hover and click regardless of camera angle or which body part the
          cursor happens to be nearest. Excluded from shadows. */}
      <mesh ref={hitboxRef} position={[0, H * 0.5, 0]}>
        <cylinderGeometry args={[H * 0.4, H * 0.4, H * 1.1, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

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

      {/* Gold selection ring — shown only while this avatar is being followed. */}
      {selRingMaterial && (
        <mesh
          ref={selRingRef}
          position={[0, SEL_RING_Y, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={selRingMaterial}
          renderOrder={2}
        >
          <ringGeometry args={[SEL_RING_INNER, SEL_RING_OUTER, 64]} />
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

      {/* Right arm. Two-tier rig:
            • outer group  → shoulder pivot (Z tilt for relaxed pose, X for swing)
              ├─ shoulder + upper arm + elbow sphere (rigid w/ shoulder)
              └─ inner group → elbow pivot (X for forearm flex)
                  ├─ forearm
                  └─ hand */}
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
        <group ref={rightForearmRef} position={[0, ELBOW_LOCAL_Y, 0]}>
          <mesh position={[0, F_ARM_RELATIVE_Y, 0]} material={material}>
            <cylinderGeometry args={[F_ARM_R_TOP, F_ARM_R_BOT, F_ARM_H, 10]} />
          </mesh>
          <mesh position={[0, HAND_RELATIVE_Y, 0]} material={material}>
            <sphereGeometry args={[HAND_R, 10, 8]} />
          </mesh>
        </group>
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
        <group ref={leftForearmRef} position={[0, ELBOW_LOCAL_Y, 0]}>
          <mesh position={[0, F_ARM_RELATIVE_Y, 0]} material={material}>
            <cylinderGeometry args={[F_ARM_R_TOP, F_ARM_R_BOT, F_ARM_H, 10]} />
          </mesh>
          <mesh position={[0, HAND_RELATIVE_Y, 0]} material={material}>
            <sphereGeometry args={[HAND_R, 10, 8]} />
          </mesh>
        </group>
      </group>

      {/* Right leg. Two-tier rig:
            • outer group  → hip pivot (rotation.x = leg swing)
              ├─ thigh + knee sphere (rigid w/ thigh)
              └─ inner group → knee pivot (rotation.x = knee flex)
                  ├─ shin
                  └─ foot */}
      <group ref={rightLegRef} position={[THIGH_X, HIP_Y, 0]}>
        <mesh position={[0, THIGH_LOCAL_Y, 0]} material={material}>
          <cylinderGeometry args={[THIGH_R_TOP, THIGH_R_BOT, THIGH_H, 10]} />
        </mesh>
        <mesh position={[0, KNEE_LOCAL_Y, 0]} material={material}>
          <sphereGeometry args={[KNEE_R, 10, 8]} />
        </mesh>
        <group ref={rightShinRef} position={[0, KNEE_LOCAL_Y, 0]}>
          <mesh position={[0, SHIN_RELATIVE_Y, 0]} material={material}>
            <cylinderGeometry args={[SHIN_R_TOP, SHIN_R_BOT, SHIN_H, 10]} />
          </mesh>
          <mesh position={[0, FOOT_RELATIVE_Y, FOOT_Z]} material={material}>
            <boxGeometry args={[FOOT_W, FOOT_H, FOOT_D]} />
          </mesh>
        </group>
      </group>

      {/* Left leg: mirror via negative X position. */}
      <group ref={leftLegRef} position={[-THIGH_X, HIP_Y, 0]}>
        <mesh position={[0, THIGH_LOCAL_Y, 0]} material={material}>
          <cylinderGeometry args={[THIGH_R_TOP, THIGH_R_BOT, THIGH_H, 10]} />
        </mesh>
        <mesh position={[0, KNEE_LOCAL_Y, 0]} material={material}>
          <sphereGeometry args={[KNEE_R, 10, 8]} />
        </mesh>
        <group ref={leftShinRef} position={[0, KNEE_LOCAL_Y, 0]}>
          <mesh position={[0, SHIN_RELATIVE_Y, 0]} material={material}>
            <cylinderGeometry args={[SHIN_R_TOP, SHIN_R_BOT, SHIN_H, 10]} />
          </mesh>
          <mesh position={[0, FOOT_RELATIVE_Y, FOOT_Z]} material={material}>
            <boxGeometry args={[FOOT_W, FOOT_H, FOOT_D]} />
          </mesh>
        </group>
      </group>

      {/* Persistent name label — only for authorized registered users.
          Intruder / Unauthorized roles are conveyed by the floor ring color,
          and full details stay accessible via the hover tooltip below.
          Hovering any avatar (including Intruders) also surfaces its label. */}
      {(user.IS_REGISTERED && user.authorized) || hovered ? (
        <Html position={[0, LABEL_Y, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
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

      {tooltipMounted && (
        <Html position={[0, LABEL_Y + 0.42, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              width: 196,
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              boxShadow: '0 8px 24px rgba(15,23,42,0.14), 0 2px 6px rgba(15,23,42,0.08)',
              overflow: 'hidden',
              pointerEvents: 'none',
              fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
              opacity: tooltipVisible ? 1 : 0,
              transform: tooltipVisible ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.96)',
              transition: 'opacity 0.18s ease, transform 0.18s ease',
              userSelect: 'none',
            }}
          >
            {/* ── Header ── */}
            <div
              style={{
                background: 'rgba(248,250,252,0.95)',
                borderBottom: '1px solid #f1f5f9',
                padding: '8px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 6,
              }}
            >
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#0f172a',
                letterSpacing: '0.01em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {user.USERID}
              </span>
              {/* Status pill — emerald / amber / slate */}
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.07em',
                padding: '2px 7px',
                borderRadius: 999,
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                ...(user.status === 'Active'
                  ? { background: '#ecfdf5', color: '#047857', boxShadow: 'inset 0 0 0 1px #a7f3d0' }
                  : user.status === 'Inactive'
                  ? { background: '#fffbeb', color: '#b45309', boxShadow: 'inset 0 0 0 1px #fde68a' }
                  : { background: '#f1f5f9', color: '#64748b', boxShadow: 'inset 0 0 0 1px #e2e8f0' }),
              }}>
                {user.status === 'Active' && (
                  <span style={{
                    display: 'inline-block',
                    width: 5, height: 5,
                    borderRadius: '50%',
                    background: '#10b981',
                    flexShrink: 0,
                  }} />
                )}
                {user.status}
              </span>
            </div>

            {/* ── Body rows ── */}
            <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>
              {/* Role */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.09em',
                  color: '#94a3b8',
                  flexShrink: 0,
                }}>
                  Role
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 999,
                  ...(!user.IS_REGISTERED
                    ? { background: '#fff1f2', color: '#be123c', boxShadow: 'inset 0 0 0 1px #fecdd3' }
                    : !user.authorized
                    ? { background: '#fff7ed', color: '#c2410c', boxShadow: 'inset 0 0 0 1px #fed7aa' }
                    : { background: '#eff6ff', color: '#1d4ed8', boxShadow: 'inset 0 0 0 1px #bfdbfe' }),
                }}>
                  {!user.IS_REGISTERED ? 'Intruder' : !user.authorized ? 'Unauthorized' : 'Authorized'}
                </span>
              </div>

              {/* Divider */}
              <div style={{ borderTop: '1px solid #f1f5f9', margin: '0 -2px' }} />

              {/* Location */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.09em',
                  color: '#94a3b8',
                  flexShrink: 0,
                  paddingTop: 1,
                }}>
                  Location
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#334155',
                  textAlign: 'right',
                  wordBreak: 'break-word' as const,
                }}>
                  {user.PREDICTED_LOCATION}
                </span>
              </div>
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}
