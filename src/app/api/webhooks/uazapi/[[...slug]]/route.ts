import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { processAITriage } from "@/lib/ai/triage-service"
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config"

export const maxDuration = 60

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
})

function formatMediaPreview(messageType: string, textContent: string): string {
  const clean = (textContent || '').trim()
  const isPlaceholder =
    !clean ||
    clean.startsWith('[') ||
    clean.startsWith('http') ||
    clean.startsWith('data:') ||
    clean.startsWith('{"URL"')

  if (messageType === 'image') return isPlaceholder ? '📷 Foto' : `📷 ${clean}`
  if (messageType === 'audio' || messageType === 'ptt') return isPlaceholder ? '🎵 Áudio' : `🎵 ${clean}`
  if (messageType === 'video') return isPlaceholder ? '🎥 Vídeo' : `🎥 ${clean}`
  if (messageType === 'document') return isPlaceholder ? '📄 Documento' : `📄 ${clean}`
  if (messageType === 'sticker') return '🏷️ Figurinha'
  return clean || 'Mensagem'
}

export async function POST(req: NextRequest, context: { params: Promise<{ slug?: string[] }> }) {
  let rawBody = ""
  let payload: any = {}

  try {
    rawBody = await req.text()
    if (!rawBody) return NextResponse.json({ success: true, warning: "Empty body" })

    payload = JSON.parse(rawBody)
    const { slug } = await context.params
    const slugInstance = slug && slug.length > 0 ? decodeURIComponent(slug[0]) : null

    // Identificar a instância do Canal
    const instanceName =
      slugInstance ||
      payload.instanceName ||
      (typeof payload.instance === 'string' ? payload.instance : payload.instance?.name) ||
      payload.chat?.instance ||
      payload.session

    // 1. Localizar o Canal no Banco de Dados
    let channel: any = null
    if (instanceName) {
      const { data: foundCh } = await supabase
        .from('chat_channels')
        .select('*')
        .or(`name.ilike.${instanceName},instance_name.ilike.${instanceName}`)
        .limit(1)
        .maybeSingle()

      if (foundCh) channel = foundCh
    }

    if (!channel && payload.token) {
      const { data: tokenCh } = await supabase
        .from('chat_channels')
        .select('*')
        .eq('instance_token', payload.token)
        .limit(1)
        .maybeSingle()
      if (tokenCh) channel = tokenCh
    }

    if (!channel) {
      console.warn(`Webhook descartado: Nenhum canal encontrado para a instância '${instanceName}'.`)
      return NextResponse.json({ success: true, warning: "Channel unknown" })
    }

    // 1.2 Auto-sincronizar Token, URL, Telefone e Status "connected" do Canal a partir do próprio Webhook da UazAPI
    const webhookToken = payload.token || payload.instance?.token || null
    const webhookBaseUrl = (payload.BaseUrl || payload.baseUrl || channel.api_url || 'https://mcs-chat.uazapi.com').replace(/\/$/, '')
    const webhookOwnerPhone = payload.owner ? String(payload.owner).replace(/\D/g, '') : null

    if (
      channel.status !== 'connected' ||
      (webhookToken && channel.instance_token !== webhookToken) ||
      (webhookOwnerPhone && !channel.phone_number) ||
      (instanceName && channel.instance_name !== instanceName)
    ) {
      await supabase
        .from('chat_channels')
        .update({
          status: 'connected',
          instance_name: instanceName || channel.instance_name || channel.name,
          api_url: webhookBaseUrl,
          instance_token: webhookToken || channel.instance_token,
          api_token: webhookToken || channel.api_token,
          phone_number: webhookOwnerPhone || channel.phone_number,
          updated_at: new Date().toISOString()
        })
        .eq('id', channel.id)

      channel.status = 'connected'
      if (webhookToken) {
        channel.instance_token = webhookToken
        channel.api_token = webhookToken
      }
      if (webhookBaseUrl) channel.api_url = webhookBaseUrl
    }

    const eventName = String(payload.event || payload.EventType || '').toLowerCase()

    // 1.5 Atualizar status de conexão se for evento de connection/status
    if (eventName.includes('connection') || eventName === 'status') {
      const newStatus = payload.status || payload.state || payload.instance?.status
      if (newStatus) {
        await supabase
          .from('chat_channels')
          .update({
            status: newStatus === 'open' ? 'connected' : newStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', channel.id)
      }
      return NextResponse.json({ success: true, event: "connection_updated" })
    }

    // 1.8 Tratar Evento de Atualização de Mensagem (messages_update: Lida ✓✓, Entregue, Editada ou Apagada)
    if (eventName.includes('messages_update') || eventName.includes('messages.update')) {
      const msgUpd = payload.message || payload.data || payload
      const rawExtId = msgUpd?.id || msgUpd?.messageid || msgUpd?.key?.id || payload.id
      if (rawExtId) {
        const pureExtId = String(rawExtId).includes(':') ? String(rawExtId).split(':').pop()! : String(rawExtId)
        const possibleIds = Array.from(new Set([String(rawExtId), pureExtId]))

        const rawStatus = String(msgUpd?.status || payload.status || payload.state || '').toLowerCase()
        const editedText = msgUpd?.text || msgUpd?.content?.text || msgUpd?.editedMessage
        const isDeleted =
          rawStatus.includes('delete') ||
          rawStatus.includes('revoke') ||
          msgUpd?.messageType === 'ProtocolMessage'

        if (isDeleted) {
          await supabase
            .from('chat_messages')
            .update({ content: '🚫 Mensagem apagada', status: 'deleted' })
            .in('external_id', possibleIds)
        } else if (editedText && typeof editedText === 'string') {
          await supabase
            .from('chat_messages')
            .update({ content: editedText })
            .in('external_id', possibleIds)
        } else if (rawStatus.includes('read') || rawStatus.includes('played') || rawStatus === '4') {
          await supabase
            .from('chat_messages')
            .update({ status: 'read' })
            .in('external_id', possibleIds)
        } else if (rawStatus.includes('deliver') || rawStatus.includes('server') || rawStatus === '3') {
          await supabase
            .from('chat_messages')
            .update({ status: 'delivered' })
            .in('external_id', possibleIds)
        }
      }
      return NextResponse.json({ success: true, event: "message_updated" })
    }

    // 2. Tratar Evento de Chamada de Voz / Vídeo (Call Reject)
    if (eventName.includes('call')) {
      const callerNumber = payload.call?.from || payload.caller || payload.chat?.wa_chatid || ''
      if (channel.auto_reject_calls && callerNumber) {
        const rejectMsg =
          channel.call_reject_message ||
          "Olá! Não recebemos chamadas de voz ou vídeo por este número. Por favor, envie sua mensagem em texto ou áudio por aqui que nossa equipe irá te atender!"
        try {
          const uazUrl = channel.api_url || process.env.UAZ_API_URL || 'https://mcs-chat.uazapi.com'
          const uazToken = channel.instance_token || channel.api_token || process.env.UAZ_GLOBAL_KEY

          await fetch(`${uazUrl}/call/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', token: uazToken },
            body: JSON.stringify({
              number: callerNumber,
              id: payload.call?.id || payload.callId
            })
          })

          // Opcionalmente envia mensagem de orientação
          const cleanCaller = String(callerNumber).replace(/@.*$/, '').replace(/\D/g, '')
          if (cleanCaller.length >= 8) {
            await fetch(`${uazUrl}/send/text`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', token: uazToken },
              body: JSON.stringify({
                number: cleanCaller,
                text: rejectMsg
              })
            })
          }
        } catch (callErr) {
          console.error("Erro ao auto-rejeitar chamada:", callErr)
        }
      }
      return NextResponse.json({ success: true, event: "call_handled" })
    }

    // 3. Processar Novas Mensagens
    const isUaz = Boolean(payload.EventType || payload.BaseUrl || payload.chat?.wa_chatid)
    const messageData = isUaz ? (payload.message || payload.data) : (payload.data?.message || payload.data || payload.message)

    if (!messageData && !payload.chat) {
      return NextResponse.json({ success: true, info: "No message data" })
    }

    // Ignorar Reações puras como novas mensagens de chat (ou atualizar se necessário)
    if (messageData?.messageType === 'ReactionMessage' || messageData?.type === 'reaction') {
      return NextResponse.json({ success: true, status: "Ignored Reaction Event" })
    }

    // Extrair Remetente (Peer ID) - sempre priorizando payload.chat.wa_chatid para garantir o número real e não @lid
    const remoteJid =
      payload.chat?.wa_chatid ||
      messageData?.chatid ||
      messageData?.key?.remoteJid ||
      messageData?.sender ||
      ''
    if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast') || payload.chat?.wa_isGroup) {
      return NextResponse.json({ success: true, status: "Ignored Group or Broadcast" })
    }

    const cleanPhone = remoteJid.replace(/@.*$/, '').replace(/\D/g, '')
    if (cleanPhone.length < 7) {
      return NextResponse.json({ success: true, status: "Invalid phone" })
    }

    const fromMe = Boolean(
      messageData?.fromMe ||
      messageData?.key?.fromMe ||
      payload.fromMe ||
      (webhookOwnerPhone && messageData?.sender && String(messageData.sender).includes(webhookOwnerPhone))
    )

    // Extrair Tipo e Conteúdo de Mensagem (UazAPI v2)
    const rawType = String(
      messageData?.messageType ||
      messageData?.mediaType ||
      messageData?.type ||
      payload.chat?.wa_lastMessageType ||
      ''
    ).toLowerCase()

    const mimeType = String(messageData?.content?.mimetype || messageData?.mimetype || '').toLowerCase()

    let messageType = 'text'
    if (rawType.includes('audio') || rawType.includes('ptt') || mimeType.includes('audio')) messageType = 'audio'
    else if (rawType.includes('image') || mimeType.includes('image')) messageType = 'image'
    else if (rawType.includes('video') || mimeType.includes('video')) messageType = 'video'
    else if (rawType.includes('document') || mimeType.includes('pdf') || mimeType.includes('document')) messageType = 'document'
    else if (rawType.includes('sticker') || mimeType.includes('webp')) messageType = 'sticker'

    let content = ''
    if (typeof messageData?.text === 'string' && messageData.text.trim()) {
      content = messageData.text.trim()
    } else if (typeof messageData?.content === 'string' && messageData.content.trim()) {
      content = messageData.content.trim()
    } else if (typeof messageData?.content === 'object' && messageData?.content !== null) {
      const cObj = messageData.content
      content =
        cObj.text ||
        cObj.caption ||
        cObj.message?.conversation ||
        cObj.templateMessage?.hydratedTemplate?.hydratedContentText ||
        cObj.interactiveMessage?.body?.text ||
        cObj.buttonsMessage?.contentText ||
        ''
    } else if (messageData?.conversation) {
      content = messageData.conversation
    } else if (messageData?.body || payload.body) {
      content = messageData?.body || payload.body
    }

    if (!content && payload.chat?.wa_lastMessageTextVote && messageType === 'text') {
      content = payload.chat.wa_lastMessageTextVote
    }

    // Evitar despejar JSON bruto de mídia como texto
    if (typeof content === 'string' && (content.startsWith('{"URL"') || content.includes('"mimetype"'))) {
      content = ''
    }

    const rawMessageId =
      messageData?.id ||
      messageData?.messageid ||
      messageData?.key?.id ||
      payload.messageId ||
      `${cleanPhone}_${Date.now()}`
    const pureMessageId = String(rawMessageId).includes(':')
      ? String(rawMessageId).split(':').pop()!
      : String(rawMessageId)
    const possibleExternalIds = Array.from(new Set([String(rawMessageId), pureMessageId]))

    // 4. Prevenir duplicatas por external_id ou mensagens disparadas pela própria API (wasSentByApi)
    const wasSentByApi = Boolean(messageData?.wasSentByApi || payload?.wasSentByApi)

    const { data: existingMsg } = await supabase
      .from('chat_messages')
      .select('id, status')
      .in('external_id', possibleExternalIds)
      .limit(1)
      .maybeSingle()

    if (existingMsg) {
      if (existingMsg.status === 'sent') {
        await supabase
          .from('chat_messages')
          .update({ status: 'delivered' })
          .eq('id', existingMsg.id)
      }
      return NextResponse.json({ success: true, status: "Ignored Duplicate Message" })
    }

    if (wasSentByApi) {
      return NextResponse.json({ success: true, status: "Ignored API-Sent Echo Message" })
    }

    // 4.5 Descriptografar e baixar Mídia via UazAPI v2 (/message/download) + Upload p/ Supabase Storage (chat_media)
    let mediaUrl: string | null =
      messageData?.fileURL || messageData?.mediaUrl || null

    if (['audio', 'image', 'video', 'document', 'sticker'].includes(messageType)) {
      const uazUrl = (channel.api_url || process.env.UAZ_API_URL || 'https://mcs-chat.uazapi.com').replace(/\/$/, '')
      const uazToken = channel.instance_token || channel.api_token || process.env.UAZ_GLOBAL_KEY

      if (uazUrl && uazToken && pureMessageId) {
        try {
          const downloadRes = await fetch(`${uazUrl}/message/download`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              token: uazToken
            },
            body: JSON.stringify({
              id: pureMessageId,
              return_base64: true,
              return_link: true,
              ...(messageType === 'audio' ? { generate_mp3: true } : {}),
              ...(messageType === 'audio' && process.env.OPENAI_API_KEY
                ? { transcribe: true, openai_apikey: process.env.OPENAI_API_KEY }
                : {})
            })
          })

          if (downloadRes.ok) {
            const dlData = await downloadRes.json().catch(() => ({}))
            const b64 = dlData.base64Data || dlData.base64 || dlData.data
            const publicLink = dlData.fileURL || dlData.fileUrl || dlData.url || dlData.link
            const transcript = dlData.transcription || dlData.transcript || dlData.text

            let resolvedMime = 'application/octet-stream'
            let ext = 'bin'
            if (messageType === 'audio') {
              resolvedMime = 'audio/mp3'
              ext = 'mp3'
            } else if (messageType === 'image') {
              resolvedMime = 'image/jpeg'
              ext = 'jpg'
            } else if (messageType === 'video') {
              resolvedMime = 'video/mp4'
              ext = 'mp4'
            } else if (messageType === 'document') {
              resolvedMime = mimeType || 'application/pdf'
              ext = resolvedMime.includes('pdf') ? 'pdf' : 'doc'
            } else if (messageType === 'sticker') {
              resolvedMime = 'image/webp'
              ext = 'webp'
            }

            if (b64 && typeof b64 === 'string') {
              const cleanB64 = b64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '')
              const buffer = Buffer.from(cleanB64, 'base64')
              const now = new Date()
              const storagePath = `inbound/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${pureMessageId}.${ext}`

              const { error: upErr } = await supabase.storage
                .from('chat_media')
                .upload(storagePath, buffer, { contentType: resolvedMime, upsert: true })

              if (!upErr) {
                const { data: pubData } = supabase.storage.from('chat_media').getPublicUrl(storagePath)
                mediaUrl = pubData.publicUrl
              } else {
                mediaUrl = publicLink || `data:${resolvedMime};base64,${cleanB64}`
              }
            } else if (publicLink) {
              mediaUrl = publicLink
            }

            if (transcript && typeof transcript === 'string' && !content) {
              content = `🎤 "${transcript.trim()}"`
            }
          }
        } catch (dlErr) {
          console.error("Erro no /message/download da UazAPI:", dlErr)
        }
      }
    }

    const previewText = formatMediaPreview(messageType, content)
    if (!content && messageType !== 'text') {
      content = previewText
    }

    // Extrair mensagem citada (quoted / reply)
    let quotedMessageId: string | null = null
    try {
      const qCandidate =
        messageData?.quoted ||
        messageData?.quotedMessageId ||
        messageData?.content?.contextInfo?.stanzaId ||
        messageData?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
        null
      if (qCandidate) {
        quotedMessageId = typeof qCandidate === 'string' ? qCandidate : (qCandidate.id || qCandidate.stanzaId || null)
      }
    } catch {}

    // 5. Cruzar Trabalhador em core_personal.workers usando match_worker_by_phone
    let matchedWorker: any = null
    if (cleanPhone.length >= 8) {
      const { data: matchData } = await supabase.rpc('match_worker_by_phone', {
        p_raw_phone: cleanPhone,
        p_company_name: channel.company_name || null
      })

      if (matchData && matchData.matched) {
        matchedWorker = matchData
      }
    }

    const defaultContactType =
      matchedWorker?.id
        ? 'worker'
        : channel.channel_type === 'clients'
        ? 'client'
        : channel.channel_type === 'general'
        ? 'general'
        : 'worker'

    const contactName =
      matchedWorker?.nome ||
      payload.chat?.name ||
      payload.chat?.wa_name ||
      messageData?.senderName ||
      messageData?.pushName ||
      `+${cleanPhone}`

    const contactAvatar = payload.chat?.imagePreview || payload.chat?.image || undefined

    // 6. Localizar ou Criar Conversa em chat_conversations
    let conversationId: string | null = null
    const { data: existingConv } = await supabase
      .from('chat_conversations')
      .select('id, bot_status, department_id, unread_count, worker_id, contact_avatar_url')
      .eq('channel_id', channel.id)
      .eq('contact_phone', cleanPhone)
      .limit(1)
      .maybeSingle()

    const nowIso = new Date().toISOString()
    const direction = fromMe ? 'outbound' : 'inbound'

    if (existingConv) {
      conversationId = existingConv.id

      // Deduplicação inteligente de eco (caso a mensagem tenha acabado de ser enviada pelo painel MCS Chat há < 60s)
      if (fromMe && content) {
        const sixtySecAgo = new Date(Date.now() - 60000).toISOString()
        const { data: recentOut } = await supabase
          .from('chat_messages')
          .select('id, external_id')
          .eq('conversation_id', conversationId)
          .eq('direction', 'outbound')
          .eq('content', content)
          .gte('created_at', sixtySecAgo)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (recentOut) {
          await supabase
            .from('chat_messages')
            .update({ external_id: recentOut.external_id || pureMessageId, status: 'delivered' })
            .eq('id', recentOut.id)
          await supabase
            .from('chat_conversations')
            .update({
              status: 'open',
              last_message_at: nowIso,
              last_message_text: previewText,
              last_message_preview: previewText.slice(0, 140),
              last_message_direction: 'outbound',
              updated_at: nowIso
            })
            .eq('id', conversationId)

          return NextResponse.json({ success: true, status: "Matched Recent Outbound Panel Message" })
        }
      }

      await supabase
        .from('chat_conversations')
        .update({
          status: 'open',
          last_message_at: nowIso,
          last_message_text: previewText,
          last_message_preview: previewText.slice(0, 140),
          last_message_direction: direction,
          unread_count: fromMe ? 0 : (existingConv.unread_count || 0) + 1,
          contact_name: matchedWorker?.nome || contactName,
          contact_avatar_url: contactAvatar || existingConv.contact_avatar_url || null,
          worker_id: existingConv.worker_id || matchedWorker?.id || null,
          worker_company_name: matchedWorker?.contratante || channel.company_name || undefined,
          worker_client_name: matchedWorker?.cliente || undefined,
          worker_function_name: matchedWorker?.funcion || undefined,
          contact_type: defaultContactType,
          updated_at: nowIso
        })
        .eq('id', conversationId)
    } else {
      const { data: newConv, error: convErr } = await supabase
        .from('chat_conversations')
        .insert({
          channel_id: channel.id,
          contact_phone: cleanPhone,
          contact_name: contactName,
          contact_avatar_url: contactAvatar || null,
          contact_type: defaultContactType,
          worker_id: matchedWorker?.id || null,
          worker_company_name: matchedWorker?.contratante || channel.company_name || null,
          worker_client_name: matchedWorker?.cliente || null,
          worker_function_name: matchedWorker?.funcion || null,
          department_id: channel.department_id || null,
          status: 'open',
          unread_count: fromMe ? 0 : 1,
          last_message_at: nowIso,
          last_message_text: previewText,
          last_message_preview: previewText.slice(0, 140),
          last_message_direction: direction,
          bot_status: 'active'
        })
        .select('id, bot_status, department_id')
        .single()

      if (convErr) {
        // Caso 2 webhooks concorrentes cheguem no mesmo milissegundo e batam no UNIQUE INDEX (channel_id, contact_phone),
        // recupera a conversa que acabou de ser criada pela outra requisição concorrente!
        const { data: concurrentConv } = await supabase
          .from('chat_conversations')
          .select('id, bot_status, department_id')
          .eq('channel_id', channel.id)
          .eq('contact_phone', cleanPhone)
          .limit(1)
          .maybeSingle()

        if (concurrentConv?.id) {
          conversationId = concurrentConv.id
        } else {
          console.error("Erro ao criar conversa:", convErr)
        }
      } else {
        conversationId = newConv?.id || null
      }
    }

    if (!conversationId) {
      return NextResponse.json({ success: false, error: "Failed to resolve conversation" }, { status: 500 })
    }

    // 7. Checagem final anti-concorrência e inserção da Mensagem Recebida / Enviada
    const { data: doubleCheckMsg } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .in('external_id', possibleExternalIds)
      .limit(1)
      .maybeSingle()

    if (doubleCheckMsg?.id) {
      return NextResponse.json({ success: true, status: "Duplicate message ignored on final check" })
    }

    // Pré-traduzir mensagens de texto recebidas dos trabalhadores para Português no ato do recebimento (0ms no painel)
    let initialTranslations: Record<string, string> | undefined = undefined
    if (!fromMe && messageType === 'text' && content && !content.startsWith('[')) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 1400)
        const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=pt&dt=t&q=${encodeURIComponent(content)}`
        const gtxRes = await fetch(gtxUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          cache: 'no-store',
          signal: controller.signal
        })
        clearTimeout(timer)
        if (gtxRes.ok) {
          const gtxData = await gtxRes.json()
          if (Array.isArray(gtxData) && Array.isArray(gtxData[0])) {
            const ptText = gtxData[0].map((chunk: any) => chunk?.[0] || '').join('').trim()
            if (ptText) {
              initialTranslations = { Portuguese: ptText }
            }
          }
        }
      } catch {}
    }

    await supabase.from('chat_messages').insert({
      conversation_id: conversationId,
      direction,
      message_type: messageType,
      content,
      media_url: mediaUrl,
      status: 'delivered',
      external_id: pureMessageId,
      quoted: quotedMessageId,
      sender_name: fromMe ? 'WhatsApp Web / Equipe' : contactName,
      is_private: false,
      ...(initialTranslations ? { translations: initialTranslations } : {})
    })

    // 8. Triagem Inteligente por Agente de IA (Apenas se mensagem recebida e bot ativo)
    if (!fromMe && channel.ai_agent_id && existingConv?.bot_status !== 'paused') {
      try {
        const { data: aiAgent } = await supabase
          .from('chat_ai_agents')
          .select('*')
          .eq('id', channel.ai_agent_id)
          .single()

        if (aiAgent && aiAgent.is_active !== false) {
          const triageResult = await processAITriage({
            channelId: channel.id,
            conversationId,
            contactPhone: cleanPhone,
            contactName,
            inboundText: content,
            history: []
          })

          if (triageResult.shouldReply && triageResult.replyText) {
            const uazUrl = channel.api_url || process.env.UAZ_API_URL || 'https://mcs-chat.uazapi.com'
            const uazToken = channel.instance_token || channel.api_token || process.env.UAZ_GLOBAL_KEY

            const aiSendRes = await fetch(`${uazUrl}/send/text`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', token: uazToken },
              body: JSON.stringify({
                number: cleanPhone,
                text: triageResult.replyText,
                readchat: true
              })
            })
            const aiSendData = await aiSendRes.json().catch(() => ({}))
            const aiExtId = aiSendData?.id || aiSendData?.messageid || aiSendData?.key?.id || null

            await supabase.from('chat_messages').insert({
              conversation_id: conversationId,
              direction: 'outbound',
              message_type: 'text',
              content: triageResult.replyText,
              status: 'delivered',
              external_id: aiExtId ? (String(aiExtId).includes(':') ? String(aiExtId).split(':').pop() : String(aiExtId)) : null,
              sender_name: aiAgent.name || 'Assistente IA',
              ai_generated: true,
              is_private: false
            })

            await supabase
              .from('chat_conversations')
              .update({
                last_message_at: new Date().toISOString(),
                last_message_text: triageResult.replyText,
                last_message_preview: triageResult.replyText.slice(0, 140),
                last_message_direction: 'outbound',
                updated_at: new Date().toISOString()
              })
              .eq('id', conversationId)
          }

          if (triageResult.shouldHandoff) {
            await supabase
              .from('chat_conversations')
              .update({
                bot_status: 'paused',
                department_id: triageResult.targetDepartmentId || channel.department_id || undefined,
                ai_summary: triageResult.internalSummary || null,
                updated_at: new Date().toISOString()
              })
              .eq('id', conversationId)

            if (triageResult.internalSummary) {
              await supabase.from('chat_messages').insert({
                conversation_id: conversationId,
                direction: 'outbound',
                message_type: 'internal_note',
                content: triageResult.internalSummary,
                status: 'delivered',
                sender_name: '🤖 Resumo de Triagem IA',
                is_private: true
              })
            }
          }
        }
      } catch (aiErr) {
        console.error("Erro na triagem de IA:", aiErr)
      }
    }

    return NextResponse.json({ success: true, conversationId, matchedWorker: Boolean(matchedWorker?.id) })
  } catch (error: any) {
    console.error("Erro no webhook UazAPI:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", webhook: "uazapi-v2-unified" })
}
