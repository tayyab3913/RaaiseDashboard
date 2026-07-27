'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { UserFor3D } from '@/components/3d/Avatar'
import {
  CameraDirectionPicker,
  type CameraDirection,
} from '@/components/CameraDirectionPicker'
import { PathTestPanel } from '@/components/PathTestPanel'
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
  // Set the first tick a user is classified Offline; carried forward
  // unchanged afterwards so the grace-period check below is stable.
  offlineSince?: number
  // Set once a stale-and-exit-adjacent user is confirmed as having left —
  // starts the shrink-out animation. Carried forward until the fade finishes.
  despawningSince?: number
  despawning?: boolean
}

type MapProps = {
  sensors: Sensor[]
  users: User[]
  activeAreas: string[]
  showSensors: boolean
  debugMode?: boolean
  // Compresses the Active/Inactive/Offline/despawn timers ~10x. Used by the
  // Path Test debug panel so the full lost-signal → reconnect → exit-despawn
  // lifecycle can be watched in seconds instead of minutes.
  fastTiming?: boolean
  // Present only while the Path Test debug panel is open — renders it as an
  // overlay on the map, in the same corner as the camera picker / follow chip.
  pathTest?: {
    locations: string[]
    exitLocations: string[]
    currentLocation: string
    signalLost: boolean
    onJump: (location: string) => void
    onLoseSignal: () => void
    onSimulateExit: () => void
    onClose: () => void
  }
}

// How long the shrink-out animation gets to play before a despawning user is
// actually removed from state. Fixed regardless of fastTiming — it's a
// visual tween duration, not a "have they really left" judgement call.
const DESPAWN_FADE_MS = 1500

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

export default function BlockMap({ sensors, users, activeAreas, showSensors, debugMode = false, fastTiming = false, pathTest }: MapProps) {
  const [sensorsWithStatus, setSensorsWithStatus] = useState<SensorWithStatus[]>([])
  const [usersWithStatus, setUsersWithStatus] = useState<UserWithStatus[]>([])
  // Camera angle around the scene. 'S' matches the layout's default camera
  // position so users see the same view they always have on first load.
  const [cameraDirection, setCameraDirection] = useState<CameraDirection>('S')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  const updateStatus = useCallback(() => {
    const now = Date.now()

    setSensorsWithStatus(sensors.map(sensor => {
      const diff = now - new Date(sensor.TIMESTAMP).getTime()
      const status: SensorWithStatus['status'] =
        diff <= 20000 ? 'Active' : diff <= 30000 ? 'Inactive' : 'Offline'
      return { ...sensor, status }
    }))

    // fastTiming compresses these ~10x for the Path Test debug panel, so the
    // full lost-signal → despawn lifecycle can be watched in seconds.
    const ACTIVE_MS = fastTiming ? 6000 : 60000
    const INACTIVE_MS = fastTiming ? 12000 : 120000
    const DESPAWN_GRACE_MS = fastTiming ? 4000 : 15000

    // Locations served by a sensor flagged as a building entry/exit point.
    // A user last seen here who then goes stale is assumed to have actually
    // left, rather than merely lost signal indoors.
    const exitLocations = new Set(
      sensors
        .filter(s => (s.ENTRY_AND_EXIT || '').toUpperCase() === 'YES')
        .map(s => s.LOCATION)
    )

    const updated = users.map(user => {
      const diff = now - new Date(user.TIMESTAMP).getTime()
      const status: UserWithStatus['status'] =
        diff <= ACTIVE_MS ? 'Active' : diff <= INACTIVE_MS ? 'Inactive' : 'Offline'
      return { ...user, status, lastUpdated: now }
    })

    setUsersWithStatus(prev => {
      const active = updated.filter(u =>
        u.status !== 'Offline' &&
        !(u.USERID.includes('PS') && activeAreas.includes(u.PREDICTED_LOCATION))
      )
      const activeIds = new Set(active.map(u => u.USERID))

      // Carry forward whichever entries were already Offline — this is what
      // keeps a lost user frozen in place instead of despawning immediately.
      // Exit-adjacent users graduate to "despawning" (shrink out) once the
      // grace period elapses; everyone else stays frozen indefinitely, same
      // as before.
      const offline: UserWithStatus[] = []
      for (const u of prev) {
        if (u.status !== 'Offline') continue
        if (activeIds.has(u.USERID)) continue // reconnected — fresh entry takes over

        const offlineSince = u.offlineSince ?? now
        const isExit = exitLocations.has(u.PREDICTED_LOCATION)
        const shouldDespawn = u.despawningSince !== undefined || (isExit && now - offlineSince > DESPAWN_GRACE_MS)
        const despawningSince = shouldDespawn ? (u.despawningSince ?? now) : undefined

        if (despawningSince !== undefined && now - despawningSince > DESPAWN_FADE_MS) {
          continue // shrink animation has had time to finish
        }

        offline.push({
          ...u,
          offlineSince,
          despawningSince,
          despawning: despawningSince !== undefined,
        })
      }

      return [...active, ...offline]
    })
  }, [sensors, users, activeAreas, fastTiming])

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
      despawning: u.despawning === true,
    })),
    [deduplicatedUsers, sensorsWithStatus]
  )

  // Label shown in the follow indicator chip.
  const followedLabel = useMemo(() => {
    if (!selectedUserId) return null
    const u = usersFor3D.find(f => f.USERID === selectedUserId)
    if (!u) return selectedUserId
    if (!u.IS_REGISTERED) return 'Intruder'
    if (!u.authorized) return 'Unauthorized'
    return `User-${u.USERID}`
  }, [selectedUserId, usersFor3D])

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div
        className="relative min-h-0 flex-1 w-full"
        style={{
          // Height comes from flex-1 — fills space between header and
          // notifications. A fixed pixel height broke the layout at 100%
          // zoom (map + chrome exceeded the viewport and hid the alerts bar).
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
            selectedUserId={selectedUserId}
            onSelectUser={setSelectedUserId}
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

        {/* Path Test debug panel — only mounted while that mode is active. */}
        {pathTest && <PathTestPanel {...pathTest} />}

        {/* Follow indicator — visible only while a user is being tracked.
            Shows the followed user's label and an × to stop following. */}
        {followedLabel && (
          <div
            className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-300 bg-amber-50/95 px-4 py-1.5 shadow-md backdrop-blur-sm"
            style={{ pointerEvents: 'auto' }}
          >
            <span className="text-xs font-semibold text-amber-900">
              Following: {followedLabel}
            </span>
            <button
              type="button"
              aria-label="Stop following"
              onClick={() => setSelectedUserId(null)}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-amber-800 transition-colors hover:bg-amber-300"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
