'use client'

import { useState, useEffect } from 'react'

type Sensor = {
  SENSORID: string
  TIMESTAMP: string
}

type SensorWithStatus = Sensor & {
  status: 'Active' | 'Inactive' | 'Offline'
}

export default function SensorList({ sensors }: { sensors: Sensor[] }) {
  const [sensorsWithStatus, setSensorsWithStatus] = useState<SensorWithStatus[]>([])

  useEffect(() => {
    const updateStatus = () => {
      const currentTime = new Date().getTime()
      const updatedSensors = sensors.map(sensor => {
        const sensorTime = new Date(sensor.TIMESTAMP).getTime()
        const timeDifference = currentTime - sensorTime

        let status: 'Active' | 'Inactive' | 'Offline'
        if (timeDifference <= 15000) {
          status = 'Active'
        } else if (timeDifference <= 20000) {
          status = 'Inactive'
        } else {
          status = 'Offline'
        }

        return { ...sensor, status }
      })
      setSensorsWithStatus(updatedSensors)
    }

    updateStatus()
    const intervalId = setInterval(updateStatus, 1000)

    return () => clearInterval(intervalId)
  }, [sensors])

  return (
    <div>
      {/* Legend */}
      <div className="bg-white p-2 rounded">
        <div className="mb-2">
          <h3 className="font-bold text-base mb-1">Ambient Systems</h3>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-xs bg-lime-500"></div>
            <span className="text-sm">NFC AC (NFxx)</span>
          </div>
          
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-xs bg-cyan-500 "></div>
            <span className="text-sm">RFID T&T (RFxx)</span>
          </div>
        
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-xs bg-orange-500"></div>
            <span className="text-sm">FP AC (FPxx)</span>
          </div>
        
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-xs bg-pink-500"></div>
            <span className="text-sm">PIR MD (PSxx)</span>
          </div>
        
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-xs bg-yellow-500"></div>
            <span className="text-sm">CCTV T&T (CCxx)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-xs bg-gray-500 "></div>
            <span className="text-sm">WiFi PS (WPxx)</span>
          </div>
        </div>
        <div>
        <h3 className="font-bold text-base mb-1">Users</h3>
        <div className="mt-1 flex items-center gap-x-1.5">
                      <div className={`flex-none rounded-full bg-blue-300 p-1`}>
                        <div className={`h-1.5 w-1.5 rounded-full bg-blue-500`}></div>
                      </div>
                      <p className="text-sm leading-5">Authorized User</p>
                  </div>
                  <div className="mt-1 flex items-center gap-x-1.5">
                      <div className={`flex-none rounded-full bg-pink-300  p-1`}>
                        <div className={`h-1.5 w-1.5 rounded-full bg-pink-500 `}></div>
                      </div>
                      <p className="text-sm leading-5">Unauthorized User</p>
                  </div>
                  <div className="mt-1 flex items-center gap-x-1.5">
                      <div className={`flex-none rounded-full bg-red-300 p-1`}>
                        <div className={`h-1.5 w-1.5 rounded-full bg-red-500`}></div>
                      </div>
                      <p className="text-sm leading-5">Intruder</p>
                  </div>
                  <div className="mt-1 flex items-center gap-x-1.5">
                      <div className={`flex-none rounded-full bg-gray-300 p-1`}>
                        <div className={`h-1.5 w-1.5 rounded-full bg-gray-500`}></div>
                      </div>
                      <p className="text-sm leading-5">Unknown</p>
                  </div>
      </div>
    </div>
    <div className="mt-2 overflow-y-auto h-[calc(100vh-8rem)]">
    <h3 className="font-bold text-base mb-1 px-2">Reed Points</h3>
    <ul className="space-y-2">
      {sensorsWithStatus.map((sensor) => (
        <li key={sensor.SENSORID} className="bg-white p-2 rounded shadow flex justify-between text-xs">
          <p className="font-bold">{sensor.SENSORID}</p>
          
          <p className={`font-semibold ${
            sensor.status === 'Active' ? 'text-green-500' :
            sensor.status === 'Inactive' ? 'text-yellow-500' : 'text-red-500'
          }`}>
           {sensor.status}
          </p>
          {/* <p>Last Update: {new Date(sensor.TIMESTAMP).toLocaleString()}</p> */}
        </li>
      ))}
    </ul>
    </div>
    </div>
  )
}