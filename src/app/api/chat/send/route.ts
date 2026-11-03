import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionApi, classifyWhatsAppSendError } from '@/lib/whatsapp/evolution-api'

function formatOutboundPreview(messageType: string, textContent: string): string {
  const clean = (textContent || '').trim()
  if (messageType === 'audio' || messageType === 'ptt') return '🎵 Áudio'
  if (messageType === 'image') return clean ? `📷 ${clean}` : '📷 Foto'
  if (messageType === 'video') return clean ? `🎥 ${clean}` : '🎥 Vídeo'
  if (messageType === 'document') return clean ? `📄 ${clean}` : '📄 Documento'
  return clean || 'Mensagem'
}

function normalizeWorkerPhone(rawPhone?: string | null): string {
  if (!rawPhone) return ''
  const trimmed = rawPhone.trim()
  const hasExplicitCountryCode = trimmed.startsWith('+') || trimmed.startsWith('00')
  let clean = trimmed.replace(/\D/g, '')
  if (!clean) return ''
  if (clean.startsWith('00')) clean = clean.replace(/^00+/, '')
  if (hasExplicitCountryCode) return clean
  if (clean.length === 9 && (clean.startsWith('6') || clean.startsWith('7'))) return '34' + clean
  if (clean.length === 9 && clean.startsWith('9')) return '351' + clean
  if (clean.length === 10 && clean.startsWith('3')) return '57' + clean
  return clean
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

    let workerAllPhones: string[] = []

    // Garantir que se a conversa está vinculada a um trabalhador, respeitamos movil + telefones_adicionais
    if (conv.worker_id) {
      const { data: workerRow } = await supabase
        .schema('core_personal')
        .from('workers')
        .select('id, nome, movil, telefones_adicionais, contratante, cliente, funcion')
        .eq('id', conv.worker_id)
        .maybeSingle()

      if (workerRow) {
        const freshPhone = normalizeWorkerPhone(workerRow.movil)
        const extraPhones: string[] = Array.isArray(workerRow.telefones_adicionais)
          ? workerRow.telefones_adicionais.map((p: string) => normalizeWorkerPhone(p)).filter(Boolean)
          : []
        workerAllPhones = Array.from(new Set([freshPhone, ...extraPhones].filter(p => p.length >= 8)))

        const currentDigits = (conv.contact_phone || '').replace(/\D/g, '')
        const matchesAnyRegisteredPhone = workerAllPhones.some(
          p => p === currentDigits || p.slice(-8) === currentDigits.slice(-8)
        )

        if (
          !matchesAnyRegisteredPhone &&
          extraPhones.length === 0 &&
          freshPhone.length >= 8 &&
          currentDigits !== freshPhone &&
          currentDigits.slice(-8) !== freshPhone.slice(-8)
        ) {
          const { data: conflictConv } = await supabase
            .from('chat_conversations')
            .select('id')
            .eq('channel_id', conv.channel_id)
            .neq('id', conv.id)
            .ilike('contact_phone', `%${freshPhone.slice(-8)}%`)
            .limit(1)
            .maybeSingle()

          if (!conflictConv) {
            conv.contact_phone = freshPhone
            await supabase
              .from('chat_conversations')
              .update({
                contact_phone: freshPhone,
                contact_name: workerRow.nome || conv.contact_name,
                worker_company_name: workerRow.contratante || conv.worker_company_name,
                worker_client_name: workerRow.cliente || conv.worker_client_name,
                worker_function_name: workerRow.funcion || conv.worker_function_name
              })
              .eq('id', conv.id)
          }
        }
      }
    }

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

    let externalMessageId: string | null = null
    let sendErrorClassification: ReturnType<typeof classifyWhatsAppSendError> | null = null
    let validAlternatePhones: string[] = []
    let newlyFetchedAvatar: string | undefined = undefined

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

      // 1. Pre-check rápido na UazAPI (/chat/check) para saber imediatamente se o número possui WhatsApp ativo
      try {
        const checkRes = await evolutionApi.checkNumber({
          number: cleanedPhone,
          instanceName,
          apiUrl,
          apiToken,
          provider,
          fastCheck: true
        })

        if (!checkRes.exists && checkRes.confirmedNotOnWhatsapp) {
          sendErrorClassification = classifyWhatsAppSendError(
            checkRes.rawError || `the number ${cleanedPhone}@s.whatsapp.net is not on WhatsApp`,
            cleanedPhone
          )
        }
      } catch {}

      // 2. Se passou na pré-checagem, dispara a mensagem na UazAPI e captura qualquer erro da Meta/WhatsApp
      if (!sendErrorClassification) {
        try {
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
        } catch (sendErr: any) {
          console.error(`[send/route] UazAPI send failed for ${cleanedPhone}:`, sendErr?.message || sendErr)
          sendErrorClassification = classifyWhatsAppSendError(sendErr?.message || String(sendErr), cleanedPhone)
        }
      }

      // Se o envio falhou porque o número não tem WhatsApp e o trabalhador possui outros números cadastrados, verifica qual deles tem WhatsApp ativo
      if (sendErrorClassification && workerAllPhones.length > 0) {
        const otherPhones = workerAllPhones.filter(
          p => p !== cleanedPhone && p.slice(-8) !== cleanedPhone.slice(-8)
        )
        for (const altP of otherPhones.slice(0, 3)) {
          try {
            const altCheck = await evolutionApi.checkNumber({
              number: altP,
              instanceName,
              apiUrl,
              apiToken,
              provider,
              fastCheck: true
            })
            if (altCheck.exists) {
              validAlternatePhones.push(altCheck.formattedNumber || altP)
            }
          } catch {}
        }
      }

      // Fetch Avatar if missing and message succeeded
      if (!sendErrorClassification && !conv.contact_avatar_url && conv.channel && conv.channel.name) {
        try {
          const fetchedAvatar = await evolutionApi.fetchProfilePictureUrl({
            number: cleanedPhone + '@s.whatsapp.net',
            instanceName,
            apiUrl,
            apiToken,
            provider
          })
          if (fetchedAvatar) {
            newlyFetchedAvatar = fetchedAvatar
          }
        } catch {}
      }
    }

    const finalStatus = isInternalNote ? 'delivered' : sendErrorClassification ? 'failed' : 'sent'
    const errorMetadata = sendErrorClassification
      ? {
          _error_code: sendErrorClassification.code,
          _error_pt: sendErrorClassification.friendlyPt,
          _error_es: sendErrorClassification.friendlyEs,
          _error_badge_pt: sendErrorClassification.shortBadgePt,
          _error_badge_es: sendErrorClassification.shortBadgeEs,
          _error_phone: conv.contact_phone.replace(/\D/g, ''),
          ...(validAlternatePhones.length > 0 ? { _error_alt_phones: validAlternatePhones.join(',') } : {})
        }
      : undefined

    // Insert into DB (sempre salva no histórico, mesmo quando falha por número sem WhatsApp, para alertar toda a equipe!)
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
        status: finalStatus,
        ...(errorMetadata ? { translations: errorMetadata } : {})
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
      const rawPreview = formatOutboundPreview(messageType, text)
      const previewStr = sendErrorClassification
        ? `${sendErrorClassification.shortBadgePt}: ${rawPreview}`
        : rawPreview
      updatePayload.status = 'open'
      updatePayload.last_message_text = previewStr
      updatePayload.last_message_preview = previewStr.slice(0, 140)
      updatePayload.last_message_direction = 'outbound'
      // Se a conversa estava livre (sem atendente) e um atendente enviou mensagem, atribui automaticamente a ele para sair de "Abertas" e ir para "Minhas"
      if (!conv.assigned_to && senderUserId) {
        updatePayload.assigned_to = senderUserId
        updatePayload.assigned_to_name = senderName || 'Atendente MCS'
      }
    }

    if (newlyFetchedAvatar) updatePayload.contact_avatar_url = newlyFetchedAvatar

    await supabase.from('chat_conversations').update(updatePayload).eq('id', conversationId)

    return NextResponse.json({
      success: !sendErrorClassification,
      sendFailed: Boolean(sendErrorClassification),
      classification: sendErrorClassification,
      validAlternatePhones,
      isInternalNote,
      message: savedMsg
    })
  } catch (err: any) {
    console.error('Send message error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
