'use client'

import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Vector3, Group } from 'three'
import layout from '@/config/layouts/default-layout.json'

const H = layout.avatar.figureHeight

// Stylised humanoid proportions tuned for a top-down 3D dashboard view.
// Vertical stack from the floor up:
//   foot · shin · knee · thigh · torso · neck · head
// Horizontal pairs (left/right) for shoulders, arms, hands & legs.

// Foot ----------------------------------------------------------------------
const FOOT_W = H * 0.07                      // narrower
const FOOT_H = H * 0.045
const FOOT_D = H * 0.13                      // shorter (heel → toe)
const FOOT_X = H * 0.075
const FOOT_Y = FOOT_H * 0.5
const FOOT_Z = H * 0.02

// Lower leg / shin ----------------------------------------------------------
const SHIN_H = H * 0.21
const SHIN_R_TOP = H * 0.05
const SHIN_R_BOT = H * 0.04
const SHIN_X = FOOT_X
const SHIN_Y = FOOT_H + SHIN_H * 0.5

// Knee ----------------------------------------------------------------------
const KNEE_R = H * 0.052
const KNEE_Y = FOOT_H + SHIN_H

// Upper leg / thigh ---------------------------------------------------------
const THIGH_H = H * 0.22
const THIGH_R_TOP = H * 0.07
const THIGH_R_BOT = H * 0.05
const THIGH_X = FOOT_X
const THIGH_Y = KNEE_Y + THIGH_H * 0.5
const HIP_Y = FOOT_H + SHIN_H + THIGH_H

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

function resolveColor(status: string, isRegistered: boolean, authorized: boolean) {
  // Vibrant palette matching the legend (red / pink / blue / gray).
  // Inactive states keep the same hue but a touch darker so the figure still
  // reads as the same role at a glance.
  if (status === 'Offline') return '#4b5563'
  const dim = status === 'Inactive'
  if (!isRegistered) return dim ? '#cc1414' : '#ff1a1a'
  if (!authorized) return dim ? '#cc1573' : '#ff1f8a'
  return dim ? '#1745cc' : '#1f6dff'
}

function resolveLabel(user: UserFor3D) {
  if (!user.IS_REGISTERED) return 'Intruder'
  if (!user.authorized) return 'Unauthorized'
  return `User-${user.USERID}`
}

type Props = {
  user: UserFor3D
  targetPosition: [number, number, number]
}

export function AvatarMesh({ user, targetPosition }: Props) {
  const groupRef = useRef<Group>(null)
  const posRef = useRef(new Vector3(...targetPosition))
  const [hovered, setHovered] = useState(false)

  useFrame((_, delta) => {
    if (!groupRef.current) return
    const t = 1 - Math.pow(0.001, delta)
    posRef.current.lerp(new Vector3(...targetPosition), t)
    groupRef.current.position.copy(posRef.current)
  })

  const color = resolveColor(user.status, user.IS_REGISTERED, user.authorized)
  const label = resolveLabel(user)

  return (
    <group
      ref={groupRef}
      position={posRef.current.toArray() as [number, number, number]}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {/* Head */}
      <mesh position={[0, HEAD_Y, 0]} castShadow>
        <sphereGeometry args={[HEAD_R, 18, 14]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>

      {/* Neck */}
      <mesh position={[0, NECK_Y, 0]}>
        <cylinderGeometry args={[NECK_R, NECK_R * 1.1, NECK_H, 12]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>

      {/* Torso */}
      <mesh position={[0, TORSO_Y, 0]}>
        <boxGeometry args={[TORSO_W, TORSO_H, TORSO_D]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>

      {/* Right arm: tilted slightly outward (around +X side). Wrapping all
          arm parts in a rotated group at the shoulder pivot keeps the joints
          aligned no matter how the tilt angle changes. */}
      <group
        position={[SHOULDER_X, SHOULDER_Y, ARM_Z]}
        rotation={[0, 0, ARM_TILT]}
      >
        <mesh>
          <sphereGeometry args={[SHOULDER_R, 12, 10]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
        <mesh position={[0, U_ARM_LOCAL_Y, 0]}>
          <cylinderGeometry args={[U_ARM_R_TOP, U_ARM_R_BOT, U_ARM_H, 10]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
        <mesh position={[0, ELBOW_LOCAL_Y, 0]}>
          <sphereGeometry args={[ELBOW_R, 10, 8]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
        <mesh position={[0, F_ARM_LOCAL_Y, 0]}>
          <cylinderGeometry args={[F_ARM_R_TOP, F_ARM_R_BOT, F_ARM_H, 10]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
        <mesh position={[0, HAND_LOCAL_Y, 0]}>
          <sphereGeometry args={[HAND_R, 10, 8]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
      </group>

      {/* Left arm: mirror via negative X position and opposite tilt sign */}
      <group
        position={[-SHOULDER_X, SHOULDER_Y, ARM_Z]}
        rotation={[0, 0, -ARM_TILT]}
      >
        <mesh>
          <sphereGeometry args={[SHOULDER_R, 12, 10]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
        <mesh position={[0, U_ARM_LOCAL_Y, 0]}>
          <cylinderGeometry args={[U_ARM_R_TOP, U_ARM_R_BOT, U_ARM_H, 10]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
        <mesh position={[0, ELBOW_LOCAL_Y, 0]}>
          <sphereGeometry args={[ELBOW_R, 10, 8]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
        <mesh position={[0, F_ARM_LOCAL_Y, 0]}>
          <cylinderGeometry args={[F_ARM_R_TOP, F_ARM_R_BOT, F_ARM_H, 10]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
        <mesh position={[0, HAND_LOCAL_Y, 0]}>
          <sphereGeometry args={[HAND_R, 10, 8]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
      </group>

      {/* Thighs */}
      <mesh position={[-THIGH_X, THIGH_Y, 0]}>
        <cylinderGeometry args={[THIGH_R_TOP, THIGH_R_BOT, THIGH_H, 10]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[THIGH_X, THIGH_Y, 0]}>
        <cylinderGeometry args={[THIGH_R_TOP, THIGH_R_BOT, THIGH_H, 10]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>

      {/* Knees */}
      <mesh position={[-THIGH_X, KNEE_Y, 0]}>
        <sphereGeometry args={[KNEE_R, 10, 8]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[THIGH_X, KNEE_Y, 0]}>
        <sphereGeometry args={[KNEE_R, 10, 8]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>

      {/* Shins */}
      <mesh position={[-SHIN_X, SHIN_Y, 0]}>
        <cylinderGeometry args={[SHIN_R_TOP, SHIN_R_BOT, SHIN_H, 10]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[SHIN_X, SHIN_Y, 0]}>
        <cylinderGeometry args={[SHIN_R_TOP, SHIN_R_BOT, SHIN_H, 10]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>

      {/* Feet */}
      <mesh position={[-FOOT_X, FOOT_Y, FOOT_Z]}>
        <boxGeometry args={[FOOT_W, FOOT_H, FOOT_D]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[FOOT_X, FOOT_Y, FOOT_Z]}>
        <boxGeometry args={[FOOT_W, FOOT_H, FOOT_D]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>

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
