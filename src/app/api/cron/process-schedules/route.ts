import { NextResponse } from 'next/server'
import { processDueScheduledMessages } from '@/app/api/chat/campaign/route'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const result = await processDueScheduledMessages(10)
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('Cron Execution Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const result = await processDueScheduledMessages(10)
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('Cron Execution Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
