import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionApi } from '@/lib/whatsapp/evolution-api'

function formatOutboundPreview(messageType: string, textContent: string): string {
  const clean = (textContent || '').trim()
  if (messageType === 'audio' || messageType === 'ptt') return '🎵 Áudio'
  if (messageType === 'image') return clean ? `📷 ${clean}` : '📷 Foto'
  if (messageType === 'video') return clean ? `🎥 ${clean}` : '🎥 Vídeo'
  if (messageType === 'document') return clean ? `📄 ${clean}` : '📄 Documento'
  return clean || 'Mensagem'
}

export async function POST(req: Request) {
  try {
    const reqData = await req.json()
    const {
      conversationId,
      text,
      messageType = 'text',
      mediaUrl,
      fileName,
      quotedMessageId,
      senderName,
      senderDepartment,
      senderUserId
    } = reqData

    if (!conversationId || (!text && !mediaUrl)) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Get conversation details to send via WhatsApp
    const { data: conv, error: convError } = await supabase
      .from('chat_conversations')
      .select('*, channel:chat_channels(name, instance_name, api_url, api_token, instance_token, provider)')
      .eq('id', conversationId)
      .single()

    if (convError || !conv) throw new Error('Conversation not found')

    const isInternalNote = messageType === 'internal_note' || messageType === 'system_block'

    // Resolve external_id of quoted message if quotedMessageId is a DB UUID
    let resolvedReplyExternalId: string | undefined = undefined
    if (quotedMessageId && !isInternalNote) {
      const { data: qMsg } = await supabase
        .from('chat_messages')
        .select('external_id')
        .eq('id', quotedMessageId)
        .maybeSingle()
      resolvedReplyExternalId = qMsg?.external_id || quotedMessageId
    }

    // Fetch Avatar if missing
    let newlyFetchedAvatar = undefined
    if (!conv.contact_avatar_url && conv.channel && conv.channel.name && !isInternalNote) {
      try {
        const fetchedAvatar = await evolutionApi.fetchProfilePictureUrl({
          number: conv.contact_phone + '@s.whatsapp.net',
          instanceName: conv.channel.instance_name || conv.channel.name,
          apiUrl: conv.channel.api_url || 'https://mcs-chat.uazapi.com',
          apiToken: conv.channel.instance_token || conv.channel.api_token,
          provider: conv.channel.provider || 'uazapi'
        })
        if (fetchedAvatar) {
          newlyFetchedAvatar = fetchedAvatar
        }
      } catch {}
    }

    let externalMessageId: string | null = null

    // Only hit UAZ API if it's not an internal note or system_block
    if (!isInternalNote) {
      const channelData = conv.channel as any
      const instanceName = channelData?.instance_name || channelData?.name
      const apiUrl = channelData?.api_url || 'https://mcs-chat.uazapi.com'
      const apiToken = channelData?.instance_token || channelData?.api_token
      const provider = channelData?.provider || 'uazapi'

      if (!apiUrl || !apiToken || !instanceName) {
        throw new Error('Channel API credentials (URL or Token) are missing in the database.')
      }

      const cleanedPhone = conv.contact_phone.replace(/\D/g, '')
      let apiRes: any = null

      if (messageType === 'audio') {
        apiRes = await evolutionApi.sendMedia({
          number: cleanedPhone,
          mediaUrl: `data:audio/webm;base64,${text}`,
          mediaType: 'ptt',
          fileName: `audio_${Date.now()}.webm`,
          instanceName,
          apiUrl,
          apiToken,
          provider,
          replyId: resolvedReplyExternalId
        })
      } else if (messageType === 'image' || messageType === 'document' || messageType === 'video') {
        const _mediaUrl = reqData.mediaUrl
        const _fileName = reqData.fileName || `file_${Date.now()}`
        apiRes = await evolutionApi.sendMedia({
          number: cleanedPhone,
          mediaUrl: _mediaUrl,
          mediaType: messageType,
          fileName: _fileName,
          caption: text || '',
          instanceName,
          apiUrl,
          apiToken,
          provider,
          replyId: resolvedReplyExternalId
        })
      } else {
        apiRes = await evolutionApi.sendText({
          number: cleanedPhone,
          text,
          instanceName,
          apiUrl,
          apiToken,
          provider,
          replyId: resolvedReplyExternalId
        })
      }

      const rawId =
        apiRes?.id ||
        apiRes?.messageid ||
        apiRes?.key?.id ||
        apiRes?.message?.key?.id ||
        apiRes?.data?.key?.id ||
        null
      if (rawId) {
        externalMessageId = String(rawId).includes(':') ? String(rawId).split(':').pop()! : String(rawId)
      }
    }

    // Insert into DB
    const { data: savedMsg, error: msgError } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        direction: isInternalNote ? 'internal' : 'outbound',
        content: messageType === 'audio' ? '[Mensagem de Voz]' : text,
        media_url: messageType === 'audio' ? `data:audio/webm;base64,${text}` : mediaUrl || null,
        message_type: messageType,
        external_id: externalMessageId,
        quoted: quotedMessageId || null,
        sender_name: senderName || (isInternalNote ? 'RH (Nota Interna)' : 'RH (Atendente)'),
        sender_department: senderDepartment || null,
        sender_user_id: senderUserId || null,
        status: isInternalNote ? 'delivered' : 'sent'
      })
      .select('*')
      .single()

    if (msgError) {
      console.error('Error saving sent message:', msgError)
    }

    // Update the conversation's last_message_at, last_message_text, last_message_preview & last_message_direction
    const nowIso = new Date().toISOString()
    const updatePayload: Record<string, any> = {
      last_message_at: nowIso,
      updated_at: nowIso,
      unread_count: 0
    }

    if (!isInternalNote) {
      const previewStr = formatOutboundPreview(messageType, text)
      updatePayload.status = 'open'
      updatePayload.last_message_text = previewStr
      updatePayload.last_message_preview = previewStr.slice(0, 140)
      updatePayload.last_message_direction = 'outbound'
    }

    if (newlyFetchedAvatar) updatePayload.contact_avatar_url = newlyFetchedAvatar

    await supabase.from('chat_conversations').update(updatePayload).eq('id', conversationId)

    return NextResponse.json({ success: true, isInternalNote, message: savedMsg })
  } catch (err: any) {
    console.error('Send message error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
