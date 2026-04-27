'use client'

import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Vector3, Group } from 'three'
import layout from '@/config/layouts/default-layout.json'

const { bodyRadius: BR, bodyLength: BL, headRadius: HR } = layout.avatar

// Vertical positions derived from avatar dimensions so changing the config reflows everything
const BODY_Y = BR + BL / 2
const HEAD_Y = BR + BL + HR
const LABEL_Y = HEAD_Y + HR + 0.15

export type UserFor3D = {
  USERID: string
  PREDICTED_LOCATION: string
  status: 'Active' | 'Inactive' | 'Offline'
  IS_REGISTERED: boolean
  authorized: boolean
}

function resolveColors(status: string, isRegistered: boolean, authorized: boolean) {
  if (status === 'Offline') return { body: '#4b5563', head: '#6b7280' }
  const dim = status === 'Inactive'
  if (!isRegistered)  return dim ? { body: '#b91c1c', head: '#dc2626' } : { body: '#dc2626', head: '#ef4444' }
  if (!authorized)    return dim ? { body: '#be185d', head: '#db2777' } : { body: '#db2777', head: '#ec4899' }
  return                     dim ? { body: '#1d4ed8', head: '#2563eb' } : { body: '#2563eb', head: '#3b82f6' }
}

function resolveLabel(user: UserFor3D) {
  if (!user.IS_REGISTERED) return 'Intruder'
  if (!user.authorized)    return 'Unauthorized'
  return `User-${user.USERID}`
}

type Props = {
  user: UserFor3D
  targetPosition: [number, number, number]
}

export function AvatarMesh({ user, targetPosition }: Props) {
  const groupRef = useRef<Group>(null)
  // Start at target so the avatar doesn't fly in from the origin on first mount
  const posRef = useRef(new Vector3(...targetPosition))
  const [hovered, setHovered] = useState(false)

  useFrame((_, delta) => {
    if (!groupRef.current) return
    // Exponential smoothing — frame-rate independent, ~99% complete within 1 second
    const t = 1 - Math.pow(0.001, delta)
    posRef.current.lerp(new Vector3(...targetPosition), t)
    groupRef.current.position.copy(posRef.current)
  })

  const { body, head } = resolveColors(user.status, user.IS_REGISTERED, user.authorized)
  const label = resolveLabel(user)

  return (
    <group ref={groupRef} position={posRef.current.toArray() as [number, number, number]}>
      <mesh position={[0, BODY_Y, 0]}>
        <capsuleGeometry args={[BR, BL, 4, 8]} />
        <meshStandardMaterial color={body} />
      </mesh>
      <mesh position={[0, HEAD_Y, 0]}>
        <sphereGeometry args={[HR, 8, 8]} />
        <meshStandardMaterial color={head} />
      </mesh>

      <Html
        position={[0, LABEL_Y, 0]}
        center
        zIndexRange={[10, 0]}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <div style={{
          fontSize: 10,
          whiteSpace: 'nowrap',
          color: 'white',
          textShadow: '0 0 3px black, 0 0 3px black',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          {label}
        </div>
      </Html>

      {hovered && (
        <Html position={[0, LABEL_Y + 0.4, 0]} center zIndexRange={[20, 0]}>
          <div style={{
            background: 'rgba(255,255,255,0.92)',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            padding: '4px 8px',
            fontSize: 11,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          }}>
            <p style={{ fontWeight: 'bold', marginBottom: 2 }}>{label}: {user.USERID}</p>
            <p>Location: {user.PREDICTED_LOCATION}</p>
            <p>Status: {user.status}</p>
          </div>
        </Html>
      )}
    </group>
  )
}
