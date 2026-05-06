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

  const toggleSensors = () => {
    setShowSensors(!showSensors)
  }

  // Add this function to handle interval change
  const handleIntervalChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setFetchInterval(Number(event.target.value) * 1000) // Convert seconds to milliseconds
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center justify-between p-4 bg-gray-900">
        <div className="flex items-center gap-3">
          {/* Hamburger / close — toggles the legend & sensors sidebar. Sits at
              the top-left of the header; when the sidebar is open it shows an
              X (so the same button reads as "close"), otherwise the three-line
              menu icon. */}
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            aria-pressed={sidebarOpen}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-800 text-gray-100 transition-colors hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/60"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <h1 className="text-xl font-bold text-gray-100">Raaise Dashboard</h1>
        </div>
        <div className='flex items-center'>
          <div className="flex mr-4">
              <div className="text-sm text-white mr-2 font-bold">Auto Refresh:</div>
              <select onChange={handleIntervalChange} value={fetchInterval / 1000} className="">
                  <option value={1}>1 sec</option>
                  <option value={2}>2 sec</option>
                  <option value={5}>5 sec</option>
                  <option value={10}>10 sec</option>
                  <option value={30}>30 sec</option>
                  <option value={60}>1 min</option>
              </select>
            </div>
          <button 
            onClick={fetchData} 
            disabled={isLoading || debugMode}
            style={{width:'150px'}}
            className="bg-purple-700 hover:bg-purple-600 disabled:bg-purple-900 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded flex items-center justify-center mr-4"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            onClick={() => setDebugMode((d) => !d)}
            style={{ width: '150px' }}
            className={`${
              debugMode
                ? 'bg-amber-500 hover:bg-amber-400 text-gray-900'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            } font-bold py-2 px-4 rounded flex items-center justify-center mr-4`}
            title="Avatars wander gradually inside the scene at a steady walking speed — used to test the movement + direction-change animations"
          >
            <Bug className="mr-2 h-4 w-4" />
            {debugMode ? 'Debug: ON' : 'Debug: OFF'}
          </button>

          <button 
            onClick={toggleSensors} 
            style={{width:'150px'}}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded"
          >
            {showSensors ? 'Hide Sensors' : 'Show Sensors'}
          </button>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — only mounted when open. Width matches the legacy
            proportions on lg+ so the map keeps its current size; on smaller
            screens the sidebar is hidden regardless (matches original
            behaviour, where only the map was visible on phones/tablets). */}
        {sidebarOpen && (
          <aside className="hidden lg:block lg:w-3/12 xl:w-2/12 flex-shrink-0 overflow-hidden border-r border-slate-200">
            <SensorList sensors={originalSensors} />
          </aside>
        )}

        {/* Main content — flex-1 so it expands to fill whatever width the
            sidebar leaves behind, including the full row when the sidebar
            is closed. */}
        <div className="flex-1 min-w-0 flex flex-col">
          <BlockMap sensors={originalSensors} users={users} showSensors={showSensors} activeAreas={activeAreas} debugMode={debugMode} />
          {/* Pass messages data as prop to DashboardMessages */}
          <DashboardMessages messages={messages} />
        </div>
      </div>
    </div>
  )
}
