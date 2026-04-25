import { NextResponse } from 'next/server'
import { getActiveMessages } from '@/lib/db'

export async function GET() {
  try {
    const messages = await getActiveMessages();
    
    return NextResponse.json({
        messages
    })
  } catch (error) {
    console.error('Error fetching message data:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}