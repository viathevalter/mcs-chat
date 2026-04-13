import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionApi } from '@/lib/whatsapp/evolution-api'

export async function POST(req: Request) {
  try {
    const reqData = await req.json()
    const { conversationId, text, messageType = 'text', mediaUrl, fileName } = reqData
    if (!conversationId || (!text && !mediaUrl)) {
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

    // Fetch Avatar if missing
    let newlyFetchedAvatar = undefined;
    if (!conv.contact_avatar_url && conv.channel && conv.channel.name && !isInternalNote) {
       try {
         const fetchedAvatar = await evolutionApi.fetchProfilePictureUrl({
            number: conv.contact_phone + '@s.whatsapp.net',
            instanceName: conv.channel.name,
            apiUrl: conv.channel.api_url,
            apiToken: conv.channel.api_token,
            provider: conv.channel.provider
         });
         if (fetchedAvatar) {
            newlyFetchedAvatar = fetchedAvatar;
         }
       } catch(e) {}
    }

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
      } else if (messageType === 'image' || messageType === 'document') {
        const _mediaUrl = reqData.mediaUrl
        const _fileName = reqData.fileName || `file_${Date.now()}`
        await evolutionApi.sendMedia({
          number: cleanedPhone,
          mediaUrl: _mediaUrl,
          mediaType: messageType,
          fileName: _fileName,
          caption: text || '',
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
      media_url: messageType === 'audio' ? `data:audio/webm;base64,${text}` : mediaUrl || null,
      message_type: isInternalNote ? 'internal_note' : messageType,
      sender_name: isInternalNote ? 'RH (Nota Interna)' : 'RH (Atendente)',
      status: isInternalNote ? 'delivered' : 'sent'
    })

    // Update the conversation's last_message_at so the sidebar instantly re-renders via Realtime
    const updatePayload: any = { last_message_at: new Date().toISOString() };
    if (newlyFetchedAvatar) updatePayload.contact_avatar_url = newlyFetchedAvatar;

    await supabase.from('chat_conversations').update(updatePayload).eq('id', conversationId);

    return NextResponse.json({ success: true, isInternalNote })

  } catch (err: any) {
    console.error('Send message error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
