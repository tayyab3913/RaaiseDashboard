'use client'

import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Vector3, Group } from 'three'
import layout from '@/config/layouts/default-layout.json'

const H = layout.avatar.figureHeight

const HEAD_R = H * 0.125
const HEAD_Y = H * 0.875

const TORSO_H = H * 0.34
const TORSO_W = H * 0.22
const TORSO_D = H * 0.12
const TORSO_Y = HEAD_Y - HEAD_R - TORSO_H * 0.5

const ARM_H = H * 0.28
const ARM_R = H * 0.042
const ARM_X = H * 0.155
const ARM_Y = TORSO_Y + TORSO_H * 0.5 - ARM_H * 0.5

const LEG_H = H * 0.4
const LEG_R = H * 0.055
const LEG_X = H * 0.075
const LEG_Y = LEG_H * 0.5

const LABEL_Y = H + 0.12

export type UserFor3D = {
  USERID: string
  PREDICTED_LOCATION: string
  status: 'Active' | 'Inactive' | 'Offline'
  IS_REGISTERED: boolean
  authorized: boolean
}

function resolveColors(status: string, isRegistered: boolean, authorized: boolean) {
  if (status === 'Offline') return { primary: '#4b5563', secondary: '#6b7280' }
  const dim = status === 'Inactive'
  if (!isRegistered)
    return dim
      ? { primary: '#991b1b', secondary: '#b91c1c' }
      : { primary: '#dc2626', secondary: '#ef4444' }
  if (!authorized)
    return dim
      ? { primary: '#9d174d', secondary: '#be185d' }
      : { primary: '#db2777', secondary: '#ec4899' }
  return dim
    ? { primary: '#1e40af', secondary: '#1d4ed8' }
    : { primary: '#2563eb', secondary: '#3b82f6' }
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

  const { primary, secondary } = resolveColors(user.status, user.IS_REGISTERED, user.authorized)
  const label = resolveLabel(user)

  return (
    <group
      ref={groupRef}
      position={posRef.current.toArray() as [number, number, number]}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <mesh position={[0, HEAD_Y, 0]}>
        <sphereGeometry args={[HEAD_R, 10, 10]} />
        <meshStandardMaterial color={secondary} />
      </mesh>

      <mesh position={[0, TORSO_Y, 0]}>
        <boxGeometry args={[TORSO_W, TORSO_H, TORSO_D]} />
        <meshStandardMaterial color={primary} />
      </mesh>

      <mesh position={[-ARM_X, ARM_Y, 0]}>
        <cylinderGeometry args={[ARM_R, ARM_R * 0.85, ARM_H, 6]} />
        <meshStandardMaterial color={primary} />
      </mesh>

      <mesh position={[ARM_X, ARM_Y, 0]}>
        <cylinderGeometry args={[ARM_R, ARM_R * 0.85, ARM_H, 6]} />
        <meshStandardMaterial color={primary} />
      </mesh>

      <mesh position={[-LEG_X, LEG_Y, 0]}>
        <cylinderGeometry args={[LEG_R, LEG_R * 0.8, LEG_H, 6]} />
        <meshStandardMaterial color={secondary} />
      </mesh>

      <mesh position={[LEG_X, LEG_Y, 0]}>
        <cylinderGeometry args={[LEG_R, LEG_R * 0.8, LEG_H, 6]} />
        <meshStandardMaterial color={secondary} />
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
