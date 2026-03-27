import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionApi } from '@/lib/whatsapp/evolution-api'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Protect cron endpoint behind a simple secret in production
  const authHeader = req.headers.get('authorization')
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    // Find pending scheduled messages
    const { data: messages, error } = await supabase
      .from('chat_scheduled_messages')
      .select('*, core_personal:workers!target_worker_id(movil)')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .limit(50)

    if (error) throw error
    if (!messages || messages.length === 0) {
      return NextResponse.json({ success: true, processed: 0, message: 'No messages to process' })
    }

    let processed = 0
    for (const msg of messages) {
       // @ts-ignore - Dynamic relationship typing simplification
       const rawPhone = msg.core_personal?.movil || (msg.workers as any)?.movil
       
       if (!rawPhone) {
         await supabase.from('chat_scheduled_messages').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', msg.id)
         continue
       }

       // Clean phone for WhatsApp (e.g. 551199999999)
       let cleanedPhone = rawPhone.replace(/\D/g, '')
       if (!cleanedPhone.startsWith('55')) cleanedPhone = '55' + cleanedPhone

       try {
         if (msg.media_url) {
           await evolutionApi.sendMedia({
             number: cleanedPhone,
             mediaUrl: msg.media_url,
             mediaType: 'image', // MVP default
             caption: msg.content,
             instanceName: 'instancia_dev', // Should come from config in v2
             apiUrl: '', // TODO: Fetch from chat_channels in v2
             apiToken: '' // TODO: Fetch from chat_channels in v2
           })
         } else {
           await evolutionApi.sendText({
             number: cleanedPhone,
             text: msg.content,
             instanceName: 'instancia_dev',
             apiUrl: '', // TODO: Fetch from chat_channels in v2
             apiToken: '' // TODO: Fetch from chat_channels in v2
           })
         }

         await supabase.from('chat_scheduled_messages').update({ status: 'sent', updated_at: new Date().toISOString() }).eq('id', msg.id)
         processed++
       } catch (err) {
         console.error(`Failed to dispatch message ID ${msg.id}:`, err)
         await supabase.from('chat_scheduled_messages').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', msg.id)
       }
    }

    return NextResponse.json({ success: true, processed })

  } catch (error: any) {
    console.error('Cron Execution Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
