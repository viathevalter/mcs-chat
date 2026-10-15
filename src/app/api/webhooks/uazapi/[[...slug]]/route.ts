import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { processAITriage } from "@/lib/ai/triage-service"

export const maxDuration = 60

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
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
    const instanceName = slugInstance || payload.instance || payload.instanceName || payload.chat?.instance || payload.session

    // 1. Localizar o Canal no Banco de Dados
    let channel: any = null
    if (instanceName) {
      const { data: foundCh } = await supabase
        .from('chat_channels')
        .select('*')
        .or(`name.ilike.${instanceName},instance_name.ilike.${instanceName}`)
        .limit(1)
        .single()

      if (foundCh) channel = foundCh
    }

    if (!channel) {
      // Fallback: se houver apenas um canal ativo ou buscar pelo token
      const { data: firstCh } = await supabase.from('chat_channels').select('*').limit(1).single()
      if (firstCh) channel = firstCh
    }

    if (!channel) {
      console.warn(`Webhook descartado: Nenhum canal encontrado para a instância '${instanceName}'.`)
      return NextResponse.json({ success: true, warning: "Channel unknown" })
    }

    // 2. Tratar Evento de Chamada de Voz / Vídeo (Call Reject)
    const eventName = payload.event || payload.EventType || ''
    if (eventName.toLowerCase().includes('call')) {
      const callerNumber = payload.call?.from || payload.caller || payload.chat?.wa_chatid || ''
      if (channel.auto_reject_calls && callerNumber) {
        const rejectMsg = channel.call_reject_message || "Olá! Não recebemos chamadas de voz ou vídeo por este número. Por favor, envie sua mensagem em texto ou áudio por aqui que nossa equipe irá te atender!"
        try {
          const uazUrl = channel.api_url || process.env.UAZ_API_URL || 'https://mcs-chat.uazapi.com'
          const uazToken = channel.instance_token || channel.api_token || process.env.UAZ_GLOBAL_KEY
          
          await fetch(`${uazUrl}/call/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'token': uazToken },
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
    let remoteJid = payload.chat?.wa_chatid || messageData?.key?.remoteJid || messageData?.chatid || messageData?.sender || ''
    if (!remoteJid || remoteJid.includes('@g.us')) {
      return NextResponse.json({ success: true, status: "Ignored Group or Empty JID" })
    }

    const cleanPhone = remoteJid.replace(/\D/g, '')
    const fromMe = Boolean(messageData?.fromMe || messageData?.key?.fromMe || payload.fromMe)

    // Extrair Conteúdo e Tipo de Mensagem
    let messageType = 'text'
    let content = messageData?.text || messageData?.conversation || messageData?.content?.text || messageData?.body || payload.body || ''
    let mediaUrl: string | null = messageData?.fileURL || messageData?.content?.URL || messageData?.mediaUrl || null

    const rawType = (messageData?.messageType || messageData?.mediaType || payload.chat?.wa_lastMessageType || '').toLowerCase()
    if (rawType.includes('audio') || rawType.includes('ptt')) messageType = 'audio'
    else if (rawType.includes('image')) messageType = 'image'
    else if (rawType.includes('video')) messageType = 'video'
    else if (rawType.includes('document')) messageType = 'document'

    if (!content && messageType !== 'text') {
      content = `[${messageType.toUpperCase()}]`
    }

    const remoteMessageId = messageData?.id || messageData?.key?.id || payload.messageId || `${cleanPhone}_${Date.now()}`

    // 4. Prevenir duplicatas
    const { data: existingMsg } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('external_id', remoteMessageId)
      .limit(1)
      .single()

    if (existingMsg) {
      return NextResponse.json({ success: true, status: "Ignored Duplicate Message" })
    }

    // 5. Cruzar Trabalhador em core_personal.workers
    let matchedWorker: any = null
    if (cleanPhone.length >= 8) {
      const phoneSuffix = cleanPhone.slice(-8)
      const { data: wrk } = await supabase
        .schema('core_personal')
        .from('workers')
        .select('id, nome, contratante, cliente, funcion, status_trabajador, movil')
        .ilike('movil', `%${phoneSuffix}%`)
        .limit(1)
        .single()

      if (wrk) matchedWorker = wrk
    }

    const contactName = matchedWorker?.nome || payload.chat?.name || payload.chat?.wa_name || messageData?.pushName || `+${cleanPhone}`

    // 6. Localizar ou Criar Conversa em chat_conversations
    let conversationId: string | null = null
    const { data: existingConv } = await supabase
      .from('chat_conversations')
      .select('id, bot_status, department_id, unread_count')
      .eq('channel_id', channel.id)
      .eq('contact_phone', cleanPhone)
      .limit(1)
      .single()

    if (existingConv) {
      conversationId = existingConv.id
      await supabase
        .from('chat_conversations')
        .update({
          status: 'open',
          last_message_at: new Date().toISOString(),
          unread_count: fromMe ? existingConv.unread_count : (existingConv.unread_count || 0) + 1,
          contact_name: contactName,
          worker_id: matchedWorker?.id || undefined,
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
          worker_id: matchedWorker?.id || null,
          department_id: channel.department_id || null,
          status: 'open',
          unread_count: fromMe ? 0 : 1,
          last_message_at: new Date().toISOString(),
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
      sender_name: fromMe ? 'Operador / Sistema' : contactName,
      is_private: false
    })

    // 8. Triagem Inteligente por Agente de IA (Apenas se mensagem recebida e bot ativo)
    if (!fromMe && channel.ai_agent_id && existingConv?.bot_status !== 'paused') {
      try {
        // Carregar configuração do Agente de IA
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
            // Disparar resposta no WhatsApp via UazAPI
            const uazUrl = channel.api_url || process.env.UAZ_API_URL || 'https://mcs-chat.uazapi.com'
            const uazToken = channel.instance_token || channel.api_token || process.env.UAZ_GLOBAL_KEY

            await fetch(`${uazUrl}/send/text`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'token': uazToken },
              body: JSON.stringify({
                number: cleanPhone,
                text: triageResult.replyText
              })
            })

            // Gravar resposta do bot no banco
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

          // Se houver Handoff (Transferência para Humano)
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

            // Inserir Nota Interna Privada para os atendentes
            if (triageResult.internalSummary) {
              await supabase.from('chat_messages').insert({
                conversation_id: conversationId,
                direction: 'outbound',
                message_type: 'text',
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

    return NextResponse.json({ success: true, conversationId })
  } catch (error: any) {
    console.error("Erro no webhook UazAPI:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
