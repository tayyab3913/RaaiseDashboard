'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { UserFor3D } from '@/components/3d/Avatar'
import {
  CameraDirectionPicker,
  type CameraDirection,
} from '@/components/CameraDirectionPicker'
import type { Sensor, SensorWithStatus } from '@/lib/sensors'

const Scene3D = dynamic(() => import('@/components/3d/Scene'), { ssr: false })

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

export default function BlockMap({ sensors, users, activeAreas, showSensors, debugMode = false }: MapProps) {
  const [sensorsWithStatus, setSensorsWithStatus] = useState<SensorWithStatus[]>([])
  const [usersWithStatus, setUsersWithStatus] = useState<UserWithStatus[]>([])
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
        {/* 3D scene fills the container and renders the floorplan + avatars
            + sensor pylons (when "Show Sensors" is on). */}
        <div className="absolute inset-0">
          <Scene3D
            users={usersFor3D}
            sensors={sensorsWithStatus}
            showSensors={showSensors}
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
            currently active direction is highlighted and disabled. The
            centre cell is the top-down view. */}
        <CameraDirectionPicker
          value={cameraDirection}
          onChange={setCameraDirection}
        />
      </div>
    </div>
  )
}
