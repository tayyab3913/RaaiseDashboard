import { NextResponse } from 'next/server'
import { getActiveAreas } from '@/lib/db'

export async function GET() {
  try {
    const activeAreas = await getActiveAreas();
    
    return NextResponse.json({
      activeAreas
    })
  } catch (error) {
    console.error('Error fetching activeAreas data:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}