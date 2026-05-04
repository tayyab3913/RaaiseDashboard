'use client'

import { useMemo, useState } from 'react'
import { Html } from '@react-three/drei'
import { pctToWorld } from '@/lib/coordMapper'
import {
  SENSOR_POSITIONS,
  sensorTypeOf,
  sensorVisual,
  type SensorType,
  type SensorVisual,
  type SensorWithStatus,
} from '@/lib/sensors'

type Props = {
  sensors: SensorWithStatus[]
}

// ---------------------------------------------------------------------------
// Pylon geometry. Total stack height ≈ 0.40 world units (about half an avatar
// tall) — visible from orbit views, not so tall it competes with the walls.
// ---------------------------------------------------------------------------
const FLOOR_LIFT = 0.01           // sits above the layout-map plane (y=0.005)
const BASE_R = 0.075
const BASE_H = 0.022
const POLE_R = 0.025
const POLE_H = 0.30

const BASE_CENTER_Y = FLOOR_LIFT + BASE_H * 0.5
const POLE_CENTER_Y = FLOOR_LIFT + BASE_H + POLE_H * 0.5
const HEAD_Y = FLOOR_LIFT + BASE_H + POLE_H + 0.04

// Spread radius for stacking multiple sensors at the same LOCATION code.
// A small ring separates them visually without sprawling beyond the room.
const SPREAD_RADIUS = 0.18

function spreadOffset(index: number, total: number): [number, number] {
  if (total <= 1) return [0, 0]
  const angle = (index / total) * 2 * Math.PI
  return [SPREAD_RADIUS * Math.cos(angle), SPREAD_RADIUS * Math.sin(angle)]
}

// ---------------------------------------------------------------------------
// Per-type "head" geometry. The pole + base are identical for every sensor;
// the head is what tells you *what kind* of sensor it is at a glance.
// ---------------------------------------------------------------------------
function SensorHead({
  type,
  visual,
}: {
  type: SensorType
  visual: SensorVisual
}) {
  const matProps = {
    color: visual.base,
    emissive: visual.emissive,
    emissiveIntensity: visual.emissiveIntensity,
    metalness: 0.3,
    roughness: 0.45,
  } as const

  switch (type) {
    case 'CC':
      // CCTV camera — small horizontal body tilted slightly downward, with
      // a dark lens cylinder protruding from the front.
      return (
        <group rotation={[-0.28, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.10, 0.06, 0.13]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
          <mesh
            position={[0, 0, 0.075]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
          >
            <cylinderGeometry args={[0.025, 0.025, 0.03, 16]} />
            <meshStandardMaterial
              color="#111827"
              metalness={0.7}
              roughness={0.2}
            />
          </mesh>
        </group>
      )

    case 'PS':
      // Motion-detector dome — half sphere, classic PIR/MD silhouette.
      return (
        <mesh castShadow position={[0, -0.005, 0]}>
          <sphereGeometry
            args={[0.065, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]}
          />
          <meshStandardMaterial {...matProps} />
        </mesh>
      )

    case 'RF':
      // RFID antenna — slim vertical panel.
      return (
        <mesh castShadow position={[0, 0.04, 0]}>
          <boxGeometry args={[0.09, 0.16, 0.025]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
      )

    case 'NF':
    case 'FP': {
      // Flat reader pad. FP gets a small dark dimple in the middle to
      // suggest a fingerprint sensor; NF stays flat (NFC tap zone).
      const isFp = type === 'FP'
      return (
        <group>
          <mesh castShadow>
            <boxGeometry args={[0.13, 0.025, 0.10]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
          {isFp && (
            <mesh position={[0, 0.014, 0]} castShadow>
              <cylinderGeometry args={[0.028, 0.028, 0.005, 16]} />
              <meshStandardMaterial
                color="#1f2937"
                metalness={0.6}
                roughness={0.3}
              />
            </mesh>
          )}
        </group>
      )
    }

    case 'WP':
      // WiFi puck — short cylinder with a small dark dot on top.
      return (
        <group>
          <mesh castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.04, 20]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
          <mesh position={[0, 0.025, 0]} castShadow>
            <sphereGeometry args={[0.014, 12, 10]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
        </group>
      )

    default:
      // Fallback for unknown SENSORID prefixes — generic colored box.
      return (
        <mesh castShadow>
          <boxGeometry args={[0.10, 0.06, 0.10]} />
          <meshStandardMaterial {...matProps} />
        </mesh>
      )
  }
}

// ---------------------------------------------------------------------------
// Single sensor pylon (base + pole + type-specific head). Hover surfaces a
// drei <Html> tooltip with the same fields the legacy 2D popup showed.
// ---------------------------------------------------------------------------
function SensorMarker({
  sensor,
  position,
}: {
  sensor: SensorWithStatus
  position: [number, number, number]
}) {
  const [hovered, setHovered] = useState(false)
  const type = sensorTypeOf(sensor.SENSORID)
  const visual = sensorVisual(type, sensor.status)

  return (
    <group
      position={position}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = 'auto'
      }}
    >
      {/* Base puck — dark brushed metal */}
      <mesh position={[0, BASE_CENTER_Y, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[BASE_R, BASE_R * 1.05, BASE_H, 20]} />
        <meshStandardMaterial color="#374151" metalness={0.55} roughness={0.4} />
      </mesh>

      {/* Pole — slightly lighter so it reads against the dark base */}
      <mesh position={[0, POLE_CENTER_Y, 0]} castShadow>
        <cylinderGeometry args={[POLE_R, POLE_R, POLE_H, 14]} />
        <meshStandardMaterial color="#4b5563" metalness={0.55} roughness={0.4} />
      </mesh>

      {/* Head — type-specific geometry, type-specific colour */}
      <group position={[0, HEAD_Y, 0]}>
        <SensorHead type={type} visual={visual} />
      </group>

      {/* Hover tooltip — same fields as the legacy 2D overlay */}
      {hovered && (
        <Html position={[0, HEAD_Y + 0.20, 0]} center zIndexRange={[20, 0]}>
          <div
            style={{
              background: 'rgba(255,255,255,0.95)',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              padding: '6px 10px',
              fontSize: 11,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
            }}
          >
            <p style={{ fontWeight: 'bold', marginBottom: 2 }}>
              Sensor: {sensor.SENSORID}
            </p>
            <p>Location: {sensor.LOCATION}</p>
            <p>Status: {sensor.status}</p>
            <p>Control Access: {sensor.CONTROL_ACCESS}</p>
            <p>Can Authenticate: {sensor.CAN_AUTHENTICATE}</p>
            <p>Entry and Exit: {sensor.ENTRY_AND_EXIT}</p>
          </div>
        </Html>
      )}
    </group>
  )
}

export function Sensors({ sensors }: Props) {
  // Group by LOCATION so multiple sensors in the same spot can be spread
  // around a small ring instead of overlapping into a single colour blob.
  const groups = useMemo(() => {
    const m = new Map<string, SensorWithStatus[]>()
    for (const s of sensors) {
      const key = s.LOCATION
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(s)
    }
    return m
  }, [sensors])

  return (
    <>
      {sensors.map((sensor) => {
        const pct = SENSOR_POSITIONS[sensor.LOCATION]
        if (!pct) return null
        const [bx, bz] = pctToWorld(pct.x, pct.y)
        const group = groups.get(sensor.LOCATION) ?? []
        const idx = group.indexOf(sensor)
        const [ox, oz] = spreadOffset(idx, group.length)
        return (
          <SensorMarker
            key={sensor.SENSORID}
            sensor={sensor}
            position={[bx + ox, 0, bz + oz]}
          />
        )
      })}
    </>
  )
}
