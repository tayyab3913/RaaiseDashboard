'use client'

import { useState, useEffect, useCallback } from 'react'

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
  sensors: Sensor[];
  users: User[];
  activeAreas: string[];
  showSensors: boolean;
};

export default function BlockMap({ sensors, users, activeAreas, showSensors }: MapProps) {
  const [sensorsWithStatus, setSensorsWithStatus] = useState<SensorWithStatus[]>([])
  const [usersWithStatus, setUsersWithStatus] = useState<UserWithStatus[]>([])
  const [selectedItem, setSelectedItem] = useState<(SensorWithStatus | UserWithStatus) | null>(null)
  
  const sensorColors = {
    'NF':'bg-lime-300',
    'RF':'bg-cyan-300',
    'FP':'bg-orange-300',
    'PS':'bg-pink-300',
    'CC':'bg-yellow-300',
    'WP':'bg-gray-300',
  };

  const updateStatus = useCallback(() => {
    const currentTime = new Date().getTime()
    
    const updatedSensors = sensors.map(sensor => {
      const sensorTime = new Date(sensor.TIMESTAMP).getTime()
      const timeDifference = currentTime - sensorTime

      let status: 'Active' | 'Inactive' | 'Offline'
      if (timeDifference <= 20000) {
        status = 'Active'
      } else if (timeDifference <= 30000) {
        status = 'Inactive'
      } else {
        status = 'Offline'
      }

      return { ...sensor, status }
    })
    setSensorsWithStatus(updatedSensors)

    const updatedUsers = users.map(user => {
      const userTime = new Date(user.TIMESTAMP).getTime()
      const timeDifference = currentTime - userTime

      let status: 'Active' | 'Inactive' | 'Offline'
      if (timeDifference <= 60000) { // 1 minute
        status = 'Active'
      } else if (timeDifference <= 120000) { // 2 minutes
        status = 'Inactive'
      } else {
        status = 'Offline'
      }

      return { ...user, status, lastUpdated: currentTime }
    })
    // Set users with statuses (excluding offline users in the display)
    setUsersWithStatus(prevUsers => {
      const newUsers = updatedUsers.filter(user => user.status !== 'Offline' && 
      !(user.USERID.includes('PS') && activeAreas.includes(user.PREDICTED_LOCATION)));
      const offlineUsers = prevUsers.filter(user => 
        user.status === 'Offline'
      )
      return [...newUsers, ...offlineUsers]
    })
  }, [activeAreas, sensors, users])

  useEffect(() => {
    updateStatus()
    const intervalId = setInterval(updateStatus, 1000)

    return () => clearInterval(intervalId)
  }, [updateStatus])

  const getPositionForUserLocation = (location: string) => {
    const positions: { [key: string]: { x: number, y: number } } = {
      'A01': { x: 10, y: 75 },
      'A02': { x: 30, y: 75 },
      'A03': { x: 55, y: 75 },
      'A04': { x: 61, y: 72 },
      'A05': { x: 71, y: 86 },
      'A06': { x: 82, y: 82 },
      'A07': { x: 90, y: 62 },
      'A08': { x: 92, y: 30 },
      'A09': { x: 92, y: 10 },
      'A10': { x: 55, y: 45 },
      'A11': { x: 65, y: 45 },
      'A12': { x: 80, y: 55 },
      'A13': { x: 78, y: 28 },
      'A14': { x: 70, y: 28 },
      'A15': { x: 60, y: 25 },
      'A16': { x: 55, y: 23 },
      'A17': { x: 40, y: 25 },
      'P01': { x: 10, y: 60},
      'P15': { x: 63, y: 64 },
      'P24': {x: 83.5, y: 55 },
      'P33': {x: 80, y: 11 },
      'P43': {x: 72, y: 11 },
      'P45': { x: 64, y: 76 },
      'P53': {x: 64, y: 11 },
      'P56': {x: 70, y: 94 },
      'P63': {x: 57, y: 10 },
      'P64': {x: 83, y: 68 },
      'P74': {x: 86, y: 58 },
      'P84': {x: 86, y: 43 },
      'P94': {x: 86, y: 13 },
      'C01': { x: 19.5, y: 25},
      'C02': { x: 28, y: 8 },
      'C03': { x: 65, y: 8 },
      'C04': { x: 85, y: 35 },
      'C05': { x: 68, y: 65 },
      'C06': { x: 63, y: 90 },
    }
    return positions[location] || { x: 2, y: 30 }
  }

  const getPositionForSensorLocation = (location: string) => {
    const positions: { [key: string]: { x: number, y: number } } = {
      'A': { x: 81, y: 58 },
      'A01': { x: 5, y: 58 },
      'A02': { x: 39, y: 71 },
      'A03': { x: 42, y: 93 },
      'A04': { x: 53.5, y: 82 },
      'A05': { x: 71, y: 86 },
      'A06': { x: 76.5, y: 75 },
      'A07': { x: 81, y: 58 },
      'A08': { x: 92, y: 30 },
      'A09': { x: 92, y: 10 },
      'A10': { x: 43, y: 42 },
      'A11': { x: 66.5, y: 58 },
      'A12': { x: 80, y: 55 },
      'A13': { x: 67, y: 17 },
      'A14': { x: 59, y: 17 },
      'A15': { x: 51, y: 17 },
      'A16': { x: 43, y: 17 },
      'A17': { x: 26, y: 22 },
      'P01': { x: 12, y: 65},
      'P15': { x: 62.5, y: 62.5 },
      'P24': {x:78.5, y: 54 },
      'P33': {x: 73, y: 11 },
      'P43': {x: 64.5, y: 11 },
      'P45': { x: 60, y: 73 },
      'P53': {x: 56.5, y: 11 },
      'P56': {x: 65.5, y: 94 },
      'P63': {x: 49, y: 11 },
      'P64': {x: 81, y: 68 },
      'P74': {x: 81, y: 63 },
      'P84': {x: 80, y: 42 },
      'P94': {x: 80, y: 15 },
      'C01': { x: 18.5, y: 8},
      'C02': { x: 28, y: 8 },
      'C03': { x: 82, y: 10 },
      'C04': { x: 84, y: 10 },
      'C05': { x: 78, y: 73 },
      'C06': { x: 63, y: 90 },
    }
    return positions[location] || { x: 2, y: 30 }
  }

  const getStatusColor = (item: SensorWithStatus | UserWithStatus) => {
    if ('SENSORID' in item) {
      const sensorType = item.SENSORID.slice(0, 2);
      const baseColor = sensorColors[sensorType as keyof typeof sensorColors] || 'bg-gray-500';
      //const offlineColor = baseColor.replace('500', '200');
      
      switch (item.status) {
        case 'Active':
          return baseColor.replace('300', '500')
        case 'Inactive':
          return baseColor
        case 'Offline':
          return 'bg-gray-300'
      }
    }
    return ''
  }

  const passage_to_area_mapping: { [key: string]: string } = {
    'P12': 'A01', 'P51': 'A05', 'P45': 'A04', 'P15': 'A11', 'P64': 'A06',
    'P74': 'A07', 'P33': 'A13', 'P43': 'A14', 'P53': 'A15', 'P63': 'A16',
    'P01': 'A01'
  } 

  const isAuthorized = (user: UserWithStatus, sensors: SensorWithStatus[]) => {
    const userLevel = parseInt(user.ACCESS_LEVEL || '0', 10);
    
    // Check if the user's predicted location matches a passage
    const mappedArea = passage_to_area_mapping[user.PREDICTED_LOCATION];
    const userLocation = mappedArea ? mappedArea : user.PREDICTED_LOCATION;
  
    // Find sensor in user's location or mapped area
    const sensorInLocation = sensors.find(s => s.LOCATION === userLocation);
    if (!sensorInLocation) return false; // No sensor in location, assume unauthorized
  
    const sensorLevel = parseInt(sensorInLocation.SECURITY_LEVEL || '0', 10);
    
    // Check if the user level is sufficient for the sensor level
    return userLevel >= sensorLevel;
  };

  const displayedUserIDs = new Set<string>();
  const displayedIntruderLocations = new Set<string>(); 
  const locationUserCount = new Map<string, number>();

  const getUserPosition = (user: UserWithStatus, index: number) => {
    const { x, y } = getPositionForUserLocation(user.PREDICTED_LOCATION);
    const offset = index * 4; // Adjust this value to increase/decrease spacing
    return { x: x, y: y + offset };
  };

  const getSensorPosition = (sensor: SensorWithStatus, index: number) => {
    const { x, y } = getPositionForSensorLocation(sensor.LOCATION);
    const offset = index * 0.3; // Adjust this value to increase/decrease spacing
    return { x: x + offset, y: y };
  };

  return (
    <div>
    <div className="relative bg-[url('/layout_map.png')]" style={{
      width: '100%',
      maxWidth: '1500px',
      height: '600px',
      backgroundPosition: '0 0',
      backgroundRepeat: 'no-repeat',
      backgroundSize: '100% 100%'
    }}>
      {showSensors && sensorsWithStatus.map((sensor, index) => {
          const { x, y } = getSensorPosition(sensor, index);
          return (
            <div key={sensor.SENSORID} className='absolute z-5' style={{ left: `${x}%`, top: `${y}%` }} onMouseEnter={() => setSelectedItem(sensor)} onMouseLeave={() => setSelectedItem(null)}>
              <div className={`w-3 h-3 rounded-sm cursor-pointer ${getStatusColor(sensor)} shadow-sm`}></div>
              <p style={{ fontSize: 9, position: 'absolute', left: -4 }}>{sensor.SENSORID}</p>
            </div>
          );
        })}
      {usersWithStatus
  .slice()
  .reverse() // Reverse the list to process the last occurrence first
  .map((user) => {
    // Skip if the user has already been displayed
    if (displayedUserIDs.has(user.USERID)) {
      return null;
    }

    // Mark the user as displayed
    displayedUserIDs.add(user.USERID);

    // Get the number of users already in the same predicted location
    const userCountInLocation = locationUserCount.get(user.PREDICTED_LOCATION) || 0;

    // Pass the count (instead of 0) to the getUserPosition function
    const { x, y } = getUserPosition(user, userCountInLocation);

    // Increment the count for this location
    locationUserCount.set(user.PREDICTED_LOCATION, userCountInLocation + 1);

    const authorized = isAuthorized(user, sensorsWithStatus);
    const activeColor = user.IS_REGISTERED ? (authorized ? 'bg-blue-500' : 'bg-pink-500') : 'bg-red-500';
    const inactiveColor = user.IS_REGISTERED ? (authorized ? 'bg-blue-300' : 'bg-pink-300') : 'bg-red-300';
    const offlineColor = 'bg-gray-300';
    const color = user.status === 'Active' ? activeColor : user.status === 'Inactive' ? inactiveColor : offlineColor;

    // Skip if the same intruder is already shown in this location
    if (!user.IS_REGISTERED && displayedIntruderLocations.has(user.PREDICTED_LOCATION)) {
      return null;
    }

    // Mark this intruder's location as shown
    if (!user.IS_REGISTERED) {
      displayedIntruderLocations.add(user.PREDICTED_LOCATION);
    }

    return (
      <div key={user.USERID} style={{ left: `${x}%`, top: `${y-1}%` }} className="absolute cursor-pointer z-5" onMouseEnter={() => setSelectedItem(user)} onMouseLeave={() => setSelectedItem(null)}>
        <div className="mt-1 flex items-center gap-x-1.5">
          <div className={`flex-none rounded-full ${inactiveColor} p-1`}>
            <div className={`h-1.5 w-1.5 rounded-full ${color}`}></div>
          </div>
          <p className="text-xs leading-5 text-gray-500">{user.IS_REGISTERED ? (authorized ? `User-${user.USERID}` : 'Unauthorized-User') : 'Intruder'}</p>
        </div>
      </div>
    )
  })}
      {selectedItem && (
         <div
         className="absolute bg-white bg-opacity-40 p-2 rounded shadow-lg"
         style={{
           left: `${'SENSORID' in selectedItem ? getPositionForSensorLocation(selectedItem.LOCATION).x + 4 : getPositionForUserLocation(selectedItem.PREDICTED_LOCATION).x + 1 }%`,
           top: `${'SENSORID' in selectedItem ? getPositionForSensorLocation(selectedItem.LOCATION).y + 5 : getPositionForUserLocation(selectedItem.PREDICTED_LOCATION).y+1}%`,
           zIndex: 10
         }}
       >
          {'SENSORID' in selectedItem ? (
           
            <div className='text-sm'>
              <p className="font-bold">Sensor ID: {selectedItem.SENSORID}</p>
              <p>Location: {selectedItem.LOCATION}</p>
              <p>Control Access: {selectedItem.CONTROL_ACCESS}</p>
              <p>Can Authenticate: {selectedItem.CAN_AUTHENTICATE}</p>
              <p>Entry and Exit: {selectedItem.ENTRY_AND_EXIT}</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-bold">{selectedItem.IS_REGISTERED ? (isAuthorized(selectedItem, sensorsWithStatus) ? 'User-Id:' : 'Unauth-User-Id:') : 'Intruder-Id:'}{selectedItem.USERID}</p>
              <p className='text-sm'>Predicted Location: {selectedItem.PREDICTED_LOCATION}</p>
            </div>
          )}
        </div>
      )}
    </div>
</div>
  )
}