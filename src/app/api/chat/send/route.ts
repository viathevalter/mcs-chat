import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionApi } from '@/lib/whatsapp/evolution-api'

export async function POST(req: Request) {
  try {
    const { conversationId, text, messageType = 'text' } = await req.json()
    if (!conversationId || !text) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Get conversation details to send via WhatsApp
    const { data: conv, error: convError } = await supabase
      .from('chat_conversations')
      .select('*, channel:chat_channels(name, api_url, api_token, provider)')
      .eq('id', conversationId)
      .single()

    if (convError || !conv) throw new Error('Conversation not found')

    const isInternalNote = messageType === 'internal_note'

    // Only hit UAZ API if it's not an internal note
    if (!isInternalNote) {
      const channelData = conv.channel as any
      const instanceName = channelData?.name
      const apiUrl = channelData?.api_url
      const apiToken = channelData?.api_token
      const provider = channelData?.provider || 'evolution'

      if (!apiUrl || !apiToken || !instanceName) {
        throw new Error('Channel API credentials (URL or Token) are missing in the database.')
      }

      let cleanedPhone = conv.contact_phone.replace(/\D/g, '')
      if (!cleanedPhone.startsWith('55')) cleanedPhone = '55' + cleanedPhone

      if (messageType === 'audio') {
        // text contains the base64 string
        await evolutionApi.sendMedia({
          number: cleanedPhone,
          mediaUrl: `data:audio/webm;base64,${text}`,
          mediaType: 'audio',
          fileName: `audio_${Date.now()}.webm`,
          instanceName,
          apiUrl,
          apiToken,
          provider
        })
      } else {
        // Send via Evolution API (Dynamic Multi-Tenant)
        await evolutionApi.sendText({
          number: cleanedPhone,
          text,
          instanceName,
          apiUrl,
          apiToken,
          provider
        })
      }
    }

    // Insert into DB
    const { error: msgError } = await supabase.from('chat_messages').insert({
      conversation_id: conversationId,
      direction: isInternalNote ? 'internal' : 'outbound',
      content: messageType === 'audio' ? '[Mensagem de Voz]' : text,
      media_url: messageType === 'audio' ? `data:audio/webm;base64,${text}` : null,
      message_type: isInternalNote ? 'internal_note' : messageType,
      sender_name: isInternalNote ? 'RH (Nota Interna)' : 'RH (Atendente)',
      status: isInternalNote ? 'delivered' : 'sent'
    })

    if (msgError) throw msgError

    return NextResponse.json({ success: true, isInternalNote })

  } catch (err: any) {
    console.error('Send message error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
