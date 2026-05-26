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

// Full display name and pill colours for each sensor type prefix.
// The bg/text/shadow values produce a lightly-tinted pill that harmonises
// with the pylon head colour visible in the 3D scene.
const TYPE_META: Record<string, {
  label: string
  bg: string; text: string; ring: string
}> = {
  NF: { label: 'NFC Access',       bg: '#f7fee7', text: '#3f6212', ring: '#bef264' },
  RF: { label: 'RFID Track & Trace', bg: '#ecfeff', text: '#155e75', ring: '#67e8f9' },
  FP: { label: 'Fingerprint AC',   bg: '#fff7ed', text: '#9a3412', ring: '#fdba74' },
  PS: { label: 'Motion / PIR',     bg: '#fdf2f8', text: '#9d174d', ring: '#f9a8d4' },
  CC: { label: 'CCTV',             bg: '#fefce8', text: '#713f12', ring: '#fde047' },
  WP: { label: 'WiFi Positioning', bg: '#f9fafb', text: '#374151', ring: '#d1d5db' },
}

// Renders a Yes/No capability chip.
function CapChip({ label, value }: { label: string; value: string }) {
  const yes = value?.toLowerCase() === 'yes' || value?.toLowerCase() === 'true'
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
      <span style={{
        fontSize: 9,
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.09em',
        color: '#94a3b8',
        flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 9,
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.06em',
        padding: '2px 7px',
        borderRadius: 999,
        ...(yes
          ? { background: '#ecfdf5', color: '#047857', boxShadow: 'inset 0 0 0 1px #a7f3d0' }
          : { background: '#f8fafc', color: '#94a3b8', boxShadow: 'inset 0 0 0 1px #e2e8f0' }),
      }}>
        {yes ? 'Yes' : 'No'}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single sensor pylon (base + pole + type-specific head). Hover surfaces a
// drei <Html> tooltip styled to match the app's design system.
// ---------------------------------------------------------------------------
function SensorMarker({
  sensor,
  position,
}: {
  sensor: SensorWithStatus
  position: [number, number, number]
}) {
  const [tooltipMounted,  setTooltipMounted]  = useState(false)
  const [tooltipVisible,  setTooltipVisible]  = useState(false)
  const type   = sensorTypeOf(sensor.SENSORID)
  const visual = sensorVisual(type, sensor.status)
  const meta   = TYPE_META[type] ?? TYPE_META['WP']

  return (
    <group
      position={position}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
        setTooltipMounted(true)
        requestAnimationFrame(() => setTooltipVisible(true))
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto'
        setTooltipVisible(false)
        setTimeout(() => setTooltipMounted(false), 200)
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

      {/* Hover tooltip */}
      {tooltipMounted && (
        <Html position={[0, HEAD_Y + 0.26, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div style={{
            width: 210,
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
          }}>

            {/* ── Header: ID + status pill ── */}
            <div style={{
              background: 'rgba(248,250,252,0.95)',
              borderBottom: '1px solid #f1f5f9',
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
            }}>
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#0f172a',
                letterSpacing: '0.01em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {sensor.SENSORID}
              </span>
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
                ...(sensor.status === 'Active'
                  ? { background: '#ecfdf5', color: '#047857', boxShadow: 'inset 0 0 0 1px #a7f3d0' }
                  : sensor.status === 'Inactive'
                  ? { background: '#fffbeb', color: '#b45309', boxShadow: 'inset 0 0 0 1px #fde68a' }
                  : { background: '#f1f5f9', color: '#64748b', boxShadow: 'inset 0 0 0 1px #e2e8f0' }),
              }}>
                {sensor.status === 'Active' && (
                  <span style={{
                    display: 'inline-block',
                    width: 5, height: 5,
                    borderRadius: '50%',
                    background: '#10b981',
                    flexShrink: 0,
                  }} />
                )}
                {sensor.status}
              </span>
            </div>

            {/* ── Body ── */}
            <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>

              {/* Type badge — color-matched to the pylon head */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.09em', color: '#94a3b8', flexShrink: 0,
                }}>Type</span>
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  padding: '2px 8px', borderRadius: 999,
                  background: meta.bg, color: meta.text,
                  boxShadow: `inset 0 0 0 1px ${meta.ring}`,
                }}>
                  {meta.label}
                </span>
              </div>

              {/* Location */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.09em', color: '#94a3b8', flexShrink: 0,
                }}>Location</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>
                  {sensor.LOCATION}
                </span>
              </div>

              {/* Divider */}
              <div style={{ borderTop: '1px solid #f1f5f9', margin: '0 -2px' }} />

              {/* Capability chips */}
              <CapChip label="Control Access"    value={sensor.CONTROL_ACCESS} />
              <CapChip label="Can Authenticate"  value={sensor.CAN_AUTHENTICATE} />
              <CapChip label="Entry & Exit"      value={sensor.ENTRY_AND_EXIT} />
            </div>
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
