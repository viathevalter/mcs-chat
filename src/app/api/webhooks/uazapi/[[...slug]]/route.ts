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

export async function POST(req: NextRequest, context: { params: Promise<{ slug?: string[] }> }) {
  let rawBody = ""
  let payload: any = {}

  try {
    rawBody = await req.text()
    if (!rawBody) return NextResponse.json({ success: true, warning: "Empty body" })

    payload = JSON.parse(rawBody)
    const { slug } = await context.params
    const slugInstance = slug && slug.length > 0 ? slug[0] : null

    // Identificar a instância do Canal
    const instanceName =
      slugInstance ||
      payload.instance ||
      payload.instanceName ||
      payload.chat?.instance ||
      payload.session ||
      payload.instance?.name

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

    const eventName = (payload.event || payload.EventType || '').toLowerCase()

    // 1.5 Atualizar status de conexão se for evento de connection/status
    if (eventName.includes('connection') || eventName.includes('status')) {
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
              callId: payload.call?.id || payload.callId,
              message: rejectMsg
            })
          })
        } catch (callErr) {
          console.error("Erro ao auto-rejeitar chamada:", callErr)
        }
      }
      return NextResponse.json({ success: true, event: "call_handled" })
    }

    // 3. Processar Novas Mensagens
    const isUaz = !!payload.EventType
    const messageData = isUaz ? payload.message : (payload.data?.message || payload.data || payload.message)

    if (!messageData && !payload.chat) {
      return NextResponse.json({ success: true, info: "No message data" })
    }

    // Extrair Remetente (Peer ID)
    const remoteJid =
      payload.chat?.wa_chatid ||
      messageData?.key?.remoteJid ||
      messageData?.chatid ||
      messageData?.sender ||
      ''
    if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast')) {
      return NextResponse.json({ success: true, status: "Ignored Group or Broadcast" })
    }

    const cleanPhone = remoteJid.replace(/\D/g, '')
    if (cleanPhone.length < 7) {
      return NextResponse.json({ success: true, status: "Invalid phone" })
    }

    const fromMe = Boolean(messageData?.fromMe || messageData?.key?.fromMe || payload.fromMe)

    // Extrair Conteúdo e Tipo de Mensagem
    let messageType = 'text'
    let content =
      messageData?.text ||
      messageData?.conversation ||
      messageData?.content?.text ||
      messageData?.body ||
      payload.body ||
      ''
    const mediaUrl: string | null =
      messageData?.fileURL || messageData?.content?.URL || messageData?.mediaUrl || null

    const rawType = (
      messageData?.messageType ||
      messageData?.mediaType ||
      payload.chat?.wa_lastMessageType ||
      ''
    ).toLowerCase()
    if (rawType.includes('audio') || rawType.includes('ptt')) messageType = 'audio'
    else if (rawType.includes('image')) messageType = 'image'
    else if (rawType.includes('video')) messageType = 'video'
    else if (rawType.includes('document')) messageType = 'document'

    if (!content && messageType !== 'text') {
      content = `[${messageType.toUpperCase()}]`
    }

    const remoteMessageId =
      messageData?.id || messageData?.key?.id || payload.messageId || `${cleanPhone}_${Date.now()}`

    // 4. Prevenir duplicatas
    const { data: existingMsg } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('external_id', remoteMessageId)
      .limit(1)
      .maybeSingle()

    if (existingMsg) {
      return NextResponse.json({ success: true, status: "Ignored Duplicate Message" })
    }

    // 5. Cruzar Trabalhador em core_personal.workers usando match_worker_by_phone (ignora espaços, +, traços)
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
      messageData?.pushName ||
      `+${cleanPhone}`

    // 6. Localizar ou Criar Conversa em chat_conversations
    let conversationId: string | null = null
    const { data: existingConv } = await supabase
      .from('chat_conversations')
      .select('id, bot_status, department_id, unread_count, worker_id')
      .eq('channel_id', channel.id)
      .eq('contact_phone', cleanPhone)
      .limit(1)
      .maybeSingle()

    if (existingConv) {
      conversationId = existingConv.id
      await supabase
        .from('chat_conversations')
        .update({
          status: 'open',
          last_message_at: new Date().toISOString(),
          last_message_preview: content ? content.slice(0, 140) : `[${messageType}]`,
          unread_count: fromMe ? existingConv.unread_count : (existingConv.unread_count || 0) + 1,
          contact_name: matchedWorker?.nome || contactName,
          worker_id: existingConv.worker_id || matchedWorker?.id || null,
          worker_company_name: matchedWorker?.contratante || channel.company_name || undefined,
          worker_client_name: matchedWorker?.cliente || undefined,
          worker_function_name: matchedWorker?.funcion || undefined,
          contact_type: defaultContactType,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
    } else {
      const { data: newConv, error: convErr } = await supabase
        .from('chat_conversations')
        .insert({
          channel_id: channel.id,
          contact_phone: cleanPhone,
          contact_name: contactName,
          contact_type: defaultContactType,
          worker_id: matchedWorker?.id || null,
          worker_company_name: matchedWorker?.contratante || channel.company_name || null,
          worker_client_name: matchedWorker?.cliente || null,
          worker_function_name: matchedWorker?.funcion || null,
          department_id: channel.department_id || null,
          status: 'open',
          unread_count: fromMe ? 0 : 1,
          last_message_at: new Date().toISOString(),
          last_message_preview: content ? content.slice(0, 140) : `[${messageType}]`,
          bot_status: 'active'
        })
        .select('id, bot_status, department_id')
        .single()

      if (convErr) {
        console.error("Erro ao criar conversa:", convErr)
      }
      conversationId = newConv?.id || null
    }

    if (!conversationId) {
      return NextResponse.json({ success: false, error: "Failed to resolve conversation" }, { status: 500 })
    }

    // 7. Inserir a Mensagem Recebida / Enviada
    await supabase.from('chat_messages').insert({
      conversation_id: conversationId,
      direction: fromMe ? 'outbound' : 'inbound',
      message_type: messageType,
      content: content,
      media_url: mediaUrl,
      status: 'delivered',
      external_id: remoteMessageId,
      sender_name: fromMe ? 'Operador / WhatsApp' : contactName,
      is_private: false
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
            conversationId: conversationId,
            contactPhone: cleanPhone,
            contactName: contactName,
            inboundText: content,
            history: []
          })

          if (triageResult.shouldReply && triageResult.replyText) {
            const uazUrl = channel.api_url || process.env.UAZ_API_URL || 'https://mcs-chat.uazapi.com'
            const uazToken = channel.instance_token || channel.api_token || process.env.UAZ_GLOBAL_KEY

            await fetch(`${uazUrl}/send/text`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', token: uazToken },
              body: JSON.stringify({
                number: cleanPhone,
                text: triageResult.replyText
              })
            })

            await supabase.from('chat_messages').insert({
              conversation_id: conversationId,
              direction: 'outbound',
              message_type: 'text',
              content: triageResult.replyText,
              status: 'delivered',
              sender_name: aiAgent.name || 'Assistente IA',
              ai_generated: true,
              is_private: false
            })
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
