import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionApi } from '@/lib/whatsapp/evolution-api'

export async function POST(req: Request) {
  try {
    const { conversationId, text } = await req.json()
    if (!conversationId || !text) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Get conversation details to send via WhatsApp
    const { data: conv, error: convError } = await supabase
      .from('chat_conversations')
      .select('*, channel:chat_channels(name)')
      .eq('id', conversationId)
      .single()

    if (convError || !conv) throw new Error('Conversation not found')

    const instanceName = (conv.channel as any)?.name || 'instancia_dev'
    let cleanedPhone = conv.contact_phone.replace(/\D/g, '')
    if (!cleanedPhone.startsWith('55')) cleanedPhone = '55' + cleanedPhone

    // Send via Evolution API
    await evolutionApi.sendText({
      number: cleanedPhone,
      text,
      instanceName
    })

    // Insert into DB
    const { error: msgError } = await supabase.from('chat_messages').insert({
      conversation_id: conversationId,
      direction: 'outbound',
      content: text,
      message_type: 'text',
      sender_name: 'RH (Atendente)',
      status: 'sent'
    })

    if (msgError) throw msgError

    return NextResponse.json({ success: true })

  } catch (err: any) {
    console.error('Send message error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
