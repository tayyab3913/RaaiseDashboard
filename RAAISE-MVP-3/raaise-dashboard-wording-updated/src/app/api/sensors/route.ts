import { NextResponse } from 'next/server'
import { getSensors } from '@/lib/db'

export async function GET() {
  try {
    const sensors = await getSensors();
    
    return NextResponse.json({
      sensors
    })
  } catch (error) {
    console.error('Error fetching sensors data:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}