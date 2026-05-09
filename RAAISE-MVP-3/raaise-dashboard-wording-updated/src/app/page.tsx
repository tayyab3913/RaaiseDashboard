'use client'

import { useState, useEffect } from 'react'
import BlockMap from '@/components/Map'
import SensorList from '@/components/SensorList'
import { RefreshCw, Bug, Menu, X } from 'lucide-react'
import DashboardMessages from '@/components/MessageList'

type Sensor = {
  SENSORID: string
  TIMESTAMP: string
  LOCATION: string
  CONTROL_ACCESS: string
  CAN_AUTHENTICATE: string
  ENTRY_AND_EXIT: string
  SECURITY_LEVEL: string | null
}

type User = {
  USERID: string,
  TIMESTAMP: string,
  PREDICTED_LOCATION: string,
  IS_REGISTERED: boolean,
  ACCESS_LEVEL: string | null
}

type Message = {
  id: number,
  Message: string,
  Counter: number,
  Priority: number,
  Timestamp: string
}

export default function DashboardPage() {
  const [originalSensors, setOriginalSensors] = useState<Sensor[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [messages, setMessages] = useState<Message[]>([]) // State for messages
  const [activeAreas, setActiveAreas] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showSensors, setShowSensors] = useState(false)
  const [fetchInterval, setFetchInterval] = useState<number>(5000)
  // Debug mode: each avatar wanders inside the scene at a steady walking
  // speed instead of jumping between distant rooms. The actual wander logic
  // lives in Avatar.tsx so motion is per-frame and per-avatar.
  const [debugMode, setDebugMode] = useState<boolean>(false)
  // Sidebar visibility — default open. The hamburger in the top-left of the
  // header toggles it; when closed the map area expands to fill the full
  // available width.
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true)

  const fetchData = async () => {
    setIsLoading(true)
    try {
      // Fetch sensors and users data
      const response = await fetch('/api/sensors')
      if (!response.ok) {
        throw new Error('Failed to fetch sensor data')
      }
      const data = await response.json()
      setOriginalSensors(data.sensors)

      const userResponse = await fetch('/api/users')
      if (!userResponse.ok) {
        throw new Error('Failed to fetch user data')
      }
      const userData = await userResponse.json()
      console.log(userData);
      setUsers(userData.users)

      // Fetch messages data
      const messagesResponse = await fetch('/api/messages')
      if (!messagesResponse.ok) {
        throw new Error('Failed to fetch messages')
      }
      const messagesData = await messagesResponse.json()
      setMessages(messagesData.messages) // Store fetched messages

      const activeAreaResponse = await fetch('/api/areas')
      const activeAreaData = await activeAreaResponse.json();
      const detectedAreaIDs = activeAreaData.activeAreas.filter((area: { STATUS: string }) => area.STATUS === 'detect').map((area: { AREAID: string }) => area.AREAID); // Get all areas where STATUS is 'detected'.map((area) => area.AREAID); // Extract only AREAID
      setActiveAreas(detectedAreaIDs)

    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // In debug mode the API fetch is paused so freshly fetched users don't
    // wipe the wander state every fetchInterval. We still want any users
    // already loaded to keep wandering — Avatar.tsx handles that itself.
    if (debugMode) return
    fetchData() // Fetch data on component mount
    const interval = setInterval(fetchData, fetchInterval) // Fetch data every 5 seconds
    return () => clearInterval(interval) // Cleanup interval on component unmount
  }, [fetchInterval, debugMode])

  // Keep timestamps fresh while in debug mode. Otherwise the BlockMap status
  // calc slides debug avatars to Inactive at 60 s and Offline at 120 s, which
  // would dim/hide them and make the wander invisible.
  useEffect(() => {
    if (!debugMode) return
    const tick = () => {
      setUsers((prev) => {
        if (prev.length === 0) return prev
        const ts = new Date().toISOString()
        return prev.map((u) => ({ ...u, TIMESTAMP: ts }))
      })
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => clearInterval(id)
  }, [debugMode])

  // Inject mock notifications when debug mode is active so the notifications
  // panel UI can be previewed without live data.
  useEffect(() => {
    if (!debugMode) {
      setMessages([])
      return
    }
    const now = () => new Date().toISOString()
    setMessages([
      { id: 1, Message: '[DEBUG] Unauthorised access attempt detected at Entry A — Zone 3', Counter: 99999, Priority: 4, Timestamp: now() },
      { id: 2, Message: '[DEBUG] Fingerprint mismatch on sensor FPR-02 — user badge not recognised', Counter: 99999, Priority: 3, Timestamp: now() },
      { id: 3, Message: '[DEBUG] Motion detected in unoccupied corridor C04 after hours', Counter: 99999, Priority: 2, Timestamp: now() },
      { id: 4, Message: '[DEBUG] System heartbeat OK — all sensors reporting normally', Counter: 99999, Priority: 1, Timestamp: now() },
    ])
  }, [debugMode])

  const toggleSensors = () => {
    setShowSensors(!showSensors)
  }

  // Add this function to handle interval change
  const handleIntervalChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setFetchInterval(Number(event.target.value) * 1000) // Convert seconds to milliseconds
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-slate-100">
      {/* App header — same visual language as the sidebar: light surface,
          slate borders, uppercase eyebrow + semibold title, pill controls. */}
      <header className="flex-shrink-0 border-b border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen((o) => !o)}
              aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              aria-pressed={sidebarOpen}
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Raaise
              </p>
              <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg">
                Dashboard
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 pl-3 shadow-sm">
              <span className="whitespace-nowrap text-xs font-medium text-slate-600">
                Auto refresh
              </span>
              <select
                onChange={handleIntervalChange}
                value={fetchInterval / 1000}
                className="rounded-md border-0 bg-transparent py-0.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-0"
              >
                <option value={1}>1 s</option>
                <option value={2}>2 s</option>
                <option value={5}>5 s</option>
                <option value={10}>10 s</option>
                <option value={30}>30 s</option>
                <option value={60}>1 min</option>
              </select>
            </label>

            <button
              type="button"
              onClick={fetchData}
              disabled={isLoading || debugMode}
              className="inline-flex min-w-[7.5rem] items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Refreshing…' : 'Refresh'}
            </button>

            <button
              type="button"
              onClick={() => setDebugMode((d) => !d)}
              title="Avatars wander inside the scene to test movement"
              className={`inline-flex min-w-[7.5rem] items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${
                debugMode
                  ? 'border border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-50'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Bug className="h-4 w-4" />
              {debugMode ? 'Debug on' : 'Debug off'}
            </button>

            <button
              type="button"
              onClick={toggleSensors}
              className={`inline-flex min-w-[7.5rem] items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${
                showSensors
                  ? 'border border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100/80'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {showSensors ? 'Hide sensors' : 'Show sensors'}
            </button>
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Sidebar — only mounted when open. Width matches the legacy
            proportions on lg+ so the map keeps its current size; on smaller
            screens the sidebar is hidden regardless (matches original
            behaviour, where only the map was visible on phones/tablets). */}
        {sidebarOpen && (
          <aside className="hidden min-h-0 lg:block lg:w-3/12 xl:w-2/12 flex-shrink-0 overflow-hidden border-r border-slate-200">
            <SensorList sensors={originalSensors} />
          </aside>
        )}

        {/* Main content — flex-1 + min-h-0 so the map column can shrink below
            its content height; the 3D view then fills only the remaining
            space instead of pushing the notifications panel off-screen. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col">
            <BlockMap
              sensors={originalSensors}
              users={users}
              showSensors={showSensors}
              activeAreas={activeAreas}
              debugMode={debugMode}
            />
          </div>
          <DashboardMessages messages={messages} />
        </div>
      </div>
    </div>
  )
}
