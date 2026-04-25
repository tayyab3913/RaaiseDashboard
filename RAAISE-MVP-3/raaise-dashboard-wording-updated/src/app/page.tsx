'use client'

import { useState, useEffect } from 'react'
import BlockMap from '@/components/Map'
import SensorList from '@/components/SensorList'
import { RefreshCw } from 'lucide-react'
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
    fetchData() // Fetch data on component mount
    const interval = setInterval(fetchData, fetchInterval) // Fetch data every 5 seconds
    return () => clearInterval(interval) // Cleanup interval on component unmount
  }, [fetchInterval])

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
        <h1 className="text-xl font-bold text-gray-100 ml-2">Raaise Dashboard</h1>
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
            disabled={isLoading}
            style={{width:'150px'}}
            className="bg-purple-700 hover:bg-purple-600 text-white font-bold py-2 px-4 rounded flex items-center justify-center mr-4"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {isLoading ? 'Refreshing...' : 'Refresh'}
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
        <div className="hidden lg:block lg:w-3/12 xl:w-2/12 p-4 bg-gray-100 overflow-y-auto">
          <SensorList sensors={originalSensors} />
        </div>
        <div className="w-full lg:w-9/12 xl:w-10/12">
          <BlockMap sensors={originalSensors} users={users} showSensors={showSensors} activeAreas={activeAreas} />
          {/* Pass messages data as prop to DashboardMessages */}
          <DashboardMessages messages={messages} />
        </div>
      </div>
    </div>
  )
}
