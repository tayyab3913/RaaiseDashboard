'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { UserFor3D } from '@/components/3d/Avatar'
import {
  CameraDirectionPicker,
  type CameraDirection,
} from '@/components/CameraDirectionPicker'

const Scene3D = dynamic(() => import('@/components/3d/Scene'), { ssr: false })

type Sensor = {
  SENSORID: string
  TIMESTAMP: string
  LOCATION: string
  CONTROL_ACCESS: string
  CAN_AUTHENTICATE: string
  ENTRY_AND_EXIT: string
  SECURITY_LEVEL: string | null
}

type SensorWithStatus = Sensor & {
  status: 'Active' | 'Inactive' | 'Offline'
}

type User = {
  USERID: string,
  TIMESTAMP: string,
  PREDICTED_LOCATION: string,
  IS_REGISTERED: boolean,
  ACCESS_LEVEL: string | null
}

type UserWithStatus = User & {
  status: 'Active' | 'Inactive' | 'Offline'
  lastUpdated: number
}

type MapProps = {
  sensors: Sensor[]
  users: User[]
  activeAreas: string[]
  showSensors: boolean
  debugMode?: boolean
}

const sensorColors = {
  'NF': 'bg-lime-300',
  'RF': 'bg-cyan-300',
  'FP': 'bg-orange-300',
  'PS': 'bg-pink-300',
  'CC': 'bg-yellow-300',
  'WP': 'bg-gray-300',
}

const passageToArea: Record<string, string> = {
  'P12': 'A01', 'P51': 'A05', 'P45': 'A04', 'P15': 'A11', 'P64': 'A06',
  'P74': 'A07', 'P33': 'A13', 'P43': 'A14', 'P53': 'A15', 'P63': 'A16',
  'P01': 'A01',
}

function isAuthorized(user: UserWithStatus, sensors: SensorWithStatus[]): boolean {
  const userLevel = parseInt(user.ACCESS_LEVEL || '0', 10)
  const mappedArea = passageToArea[user.PREDICTED_LOCATION]
  const location = mappedArea ?? user.PREDICTED_LOCATION
  const sensor = sensors.find(s => s.LOCATION === location)
  if (!sensor) return false
  return userLevel >= parseInt(sensor.SECURITY_LEVEL || '0', 10)
}

function getSensorPosition(location: string): { x: number; y: number } {
  const positions: Record<string, { x: number; y: number }> = {
    'A':   { x: 81,   y: 58 },
    'A01': { x: 5,    y: 58 },
    'A02': { x: 39,   y: 71 },
    'A03': { x: 42,   y: 93 },
    'A04': { x: 53.5, y: 82 },
    'A05': { x: 71,   y: 86 },
    'A06': { x: 76.5, y: 75 },
    'A07': { x: 81,   y: 58 },
    'A08': { x: 92,   y: 30 },
    'A09': { x: 92,   y: 10 },
    'A10': { x: 43,   y: 42 },
    'A11': { x: 66.5, y: 58 },
    'A12': { x: 80,   y: 55 },
    'A13': { x: 67,   y: 17 },
    'A14': { x: 59,   y: 17 },
    'A15': { x: 51,   y: 17 },
    'A16': { x: 43,   y: 17 },
    'A17': { x: 26,   y: 22 },
    'P01': { x: 12,   y: 65 },
    'P15': { x: 62.5, y: 62.5 },
    'P24': { x: 78.5, y: 54 },
    'P33': { x: 73,   y: 11 },
    'P43': { x: 64.5, y: 11 },
    'P45': { x: 60,   y: 73 },
    'P53': { x: 56.5, y: 11 },
    'P56': { x: 65.5, y: 94 },
    'P63': { x: 49,   y: 11 },
    'P64': { x: 81,   y: 68 },
    'P74': { x: 81,   y: 63 },
    'P84': { x: 80,   y: 42 },
    'P94': { x: 80,   y: 15 },
    'C01': { x: 18.5, y: 8 },
    'C02': { x: 28,   y: 8 },
    'C03': { x: 82,   y: 10 },
    'C04': { x: 84,   y: 10 },
    'C05': { x: 78,   y: 73 },
    'C06': { x: 63,   y: 90 },
  }
  return positions[location] ?? { x: 2, y: 30 }
}

function getSensorColor(sensor: SensorWithStatus): string {
  const type = sensor.SENSORID.slice(0, 2)
  const base = sensorColors[type as keyof typeof sensorColors] ?? 'bg-gray-500'
  switch (sensor.status) {
    case 'Active':   return base.replace('300', '500')
    case 'Inactive': return base
    case 'Offline':  return 'bg-gray-300'
  }
}

export default function BlockMap({ sensors, users, activeAreas, showSensors, debugMode = false }: MapProps) {
  const [sensorsWithStatus, setSensorsWithStatus] = useState<SensorWithStatus[]>([])
  const [usersWithStatus, setUsersWithStatus] = useState<UserWithStatus[]>([])
  const [selectedSensor, setSelectedSensor] = useState<SensorWithStatus | null>(null)
  // Camera angle around the scene. 'S' matches the layout's default camera
  // position so users see the same view they always have on first load.
  const [cameraDirection, setCameraDirection] = useState<CameraDirection>('S')

  const updateStatus = useCallback(() => {
    const now = Date.now()

    setSensorsWithStatus(sensors.map(sensor => {
      const diff = now - new Date(sensor.TIMESTAMP).getTime()
      const status: SensorWithStatus['status'] =
        diff <= 20000 ? 'Active' : diff <= 30000 ? 'Inactive' : 'Offline'
      return { ...sensor, status }
    }))

    const updated = users.map(user => {
      const diff = now - new Date(user.TIMESTAMP).getTime()
      const status: UserWithStatus['status'] =
        diff <= 60000 ? 'Active' : diff <= 120000 ? 'Inactive' : 'Offline'
      return { ...user, status, lastUpdated: now }
    })

    setUsersWithStatus(prev => {
      const active = updated.filter(u =>
        u.status !== 'Offline' &&
        !(u.USERID.includes('PS') && activeAreas.includes(u.PREDICTED_LOCATION))
      )
      const offline = prev.filter(u => u.status === 'Offline')
      return [...active, ...offline]
    })
  }, [sensors, users, activeAreas])

  useEffect(() => {
    updateStatus()
    const id = setInterval(updateStatus, 1000)
    return () => clearInterval(id)
  }, [updateStatus])

  // Deduplicate users using the same rules as the original 2D map:
  // - last TIMESTAMP entry wins per USERID (list was reversed in old code)
  // - only one intruder shown per location
  const deduplicatedUsers = useMemo(() => {
    const seenIDs = new Set<string>()
    const seenIntruderLocs = new Set<string>()
    const result: UserWithStatus[] = []
    for (const user of [...usersWithStatus].reverse()) {
      if (seenIDs.has(user.USERID)) continue
      seenIDs.add(user.USERID)
      if (!user.IS_REGISTERED) {
        if (seenIntruderLocs.has(user.PREDICTED_LOCATION)) continue
        seenIntruderLocs.add(user.PREDICTED_LOCATION)
      }
      result.push(user)
    }
    return result
  }, [usersWithStatus])

  // Enrich with authorization so the 3D scene doesn't need sensor access
  const usersFor3D = useMemo<UserFor3D[]>(() =>
    deduplicatedUsers.map(u => ({
      USERID: u.USERID,
      PREDICTED_LOCATION: u.PREDICTED_LOCATION,
      status: u.status,
      IS_REGISTERED: u.IS_REGISTERED,
      authorized: isAuthorized(u, sensorsWithStatus),
    })),
    [deduplicatedUsers, sensorsWithStatus]
  )

  return (
    <div>
      <div
        className="relative"
        style={{
          width: '100%',
          maxWidth: '1500px',
          height: '600px',
          // Soft radial gradient behind the canvas — picks up at the canvas
          // edges where the scene's solid background ends, framing the 3D
          // viewport with a subtle "stage" rather than a hard rectangle.
          background:
            'radial-gradient(ellipse at 50% 35%, #f4f7fb 0%, #e2e8f0 70%, #cbd5e1 100%)',
        }}
      >
        {/* 3D scene fills the container and renders the floorplan + avatars */}
        <div className="absolute inset-0">
          <Scene3D
            users={usersFor3D}
            debugMode={debugMode}
            cameraDirection={cameraDirection}
          />
        </div>

        {/* Cinematic vignette — pure CSS, sits above the canvas but below
            interactive overlays. pointer-events-none so it never intercepts
            sensor hovers / camera-picker clicks. The inset shadow gives a
            soft dark edge on all four corners; the radial gradient deepens
            the corner contrast. Keeps the eye on the centre of the floorplan. */}
        <div
          className="absolute inset-0"
          style={{
            pointerEvents: 'none',
            zIndex: 5,
            boxShadow: 'inset 0 0 120px 25px rgba(15, 23, 42, 0.32)',
            background:
              'radial-gradient(ellipse at center, transparent 55%, rgba(15, 23, 42, 0.18) 100%)',
            mixBlendMode: 'multiply',
          }}
        />

        {/* Camera-angle compass: 3×3 picker overlaid on the canvas. The
            currently active direction is highlighted and disabled. */}
        <CameraDirectionPicker
          value={cameraDirection}
          onChange={setCameraDirection}
        />

        {/* Sensor icons — 2D HTML overlay on top of the 3D canvas */}
        <div className="absolute inset-0" style={{ zIndex: 10, pointerEvents: 'none' }}>
          {showSensors && sensorsWithStatus.map((sensor, index) => {
            const { x, y } = getSensorPosition(sensor.LOCATION)
            const offset = index * 0.3
            return (
              <div
                key={sensor.SENSORID}
                className="absolute z-5"
                style={{ left: `${x + offset}%`, top: `${y}%`, pointerEvents: 'auto' }}
                onMouseEnter={() => setSelectedSensor(sensor)}
                onMouseLeave={() => setSelectedSensor(null)}
              >
                <div className={`w-3 h-3 rounded-sm cursor-pointer ${getSensorColor(sensor)} shadow-sm`} />
                <p style={{ fontSize: 9, position: 'absolute', left: -4 }}>{sensor.SENSORID}</p>
              </div>
            )
          })}

          {selectedSensor && (
            <div
              className="absolute bg-white bg-opacity-40 p-2 rounded shadow-lg"
              style={{
                left: `${getSensorPosition(selectedSensor.LOCATION).x + 4}%`,
                top:  `${getSensorPosition(selectedSensor.LOCATION).y + 5}%`,
                zIndex: 20,
                pointerEvents: 'none',
              }}
            >
              <div className="text-sm">
                <p className="font-bold">Sensor ID: {selectedSensor.SENSORID}</p>
                <p>Location: {selectedSensor.LOCATION}</p>
                <p>Control Access: {selectedSensor.CONTROL_ACCESS}</p>
                <p>Can Authenticate: {selectedSensor.CAN_AUTHENTICATE}</p>
                <p>Entry and Exit: {selectedSensor.ENTRY_AND_EXIT}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
