import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config"
import { evolutionApi } from "@/lib/whatsapp/evolution-api"

export const maxDuration = 60

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})

function formatSyncPreview(msgType: string, rawText: string): string {
  const clean = (rawText || '').trim()
  const isTech = !clean || clean.startsWith('[') || clean.startsWith('http') || clean.startsWith('{"URL"')
  const t = (msgType || '').toLowerCase()
  if (t.includes('image')) return isTech ? '📷 Foto' : `📷 ${clean}`
  if (t.includes('audio') || t.includes('ptt')) return isTech ? '🎵 Áudio' : `🎵 ${clean}`
  if (t.includes('video')) return isTech ? '🎥 Vídeo' : `🎥 ${clean}`
  if (t.includes('document')) return isTech ? '📄 Documento' : `📄 ${clean}`
  if (t.includes('sticker')) return '🏷️ Figurinha'
  return clean || 'Conversa sincronizada'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, channelId, conversationId, tokenOverride, filterMode = 'matched_only', importMessages = true } = body

    // 0. Ação: Sincronizar o histórico de diálogos (WhatsApp Web + Recebidas) de uma conversa específica ao abrir o chat
    if (action === 'sync_conversation_messages' && conversationId) {
      const { data: conv } = await supabase
        .from('chat_conversations')
        .select('id, channel_id, contact_phone, contact_name, channel:chat_channels(name, instance_name, api_url, instance_token, api_token)')
        .eq('id', conversationId)
        .maybeSingle()

      const ch: any = conv?.channel
      const tk = (ch?.instance_token || ch?.api_token || '').trim()
      const baseUrl = (ch?.api_url || 'https://mcs-chat.uazapi.com').replace(/\/$/, '')

      if (!conv || !tk || !conv.contact_phone) {
        return NextResponse.json({ success: false, imported: 0 })
      }

      const cleanPhone = conv.contact_phone.replace(/\D/g, '')

      // Marcar conversa como lida no WhatsApp via UazAPI (/chat/read)
      evolutionApi.markChatRead({
        number: cleanPhone,
        read: true,
        apiUrl: baseUrl,
        apiToken: tk
      }).catch(() => {})

      const mr = await fetch(`${baseUrl}/message/find`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: tk },
        body: JSON.stringify({
          chatid: `${cleanPhone}@s.whatsapp.net`,
          limit: 60
        })
      })

      if (!mr.ok) {
        return NextResponse.json({ success: false, imported: 0 })
      }

      const md = await mr.json().catch(() => ({}))
      const uazMsgs: any[] = Array.isArray(md?.messages) ? md.messages : []
      if (uazMsgs.length === 0) {
        return NextResponse.json({ success: true, imported: 0 })
      }

      const { data: existingMsgs } = await supabase
        .from('chat_messages')
        .select('external_id')
        .eq('conversation_id', conversationId)

      const existingExtIds = new Set<string>()
      for (const m of existingMsgs || []) {
        if (m.external_id) {
          existingExtIds.add(String(m.external_id))
          if (String(m.external_id).includes(':')) {
            existingExtIds.add(String(m.external_id).split(':').pop()!)
          }
        }
      }

      const toInsert: any[] = []
      let newestMsgMeta: { text: string; direction: 'inbound' | 'outbound'; tsMs: number } | null = null

      for (const m of uazMsgs) {
        if (m.messageType === 'ReactionMessage') continue
        const rawExtId = m.id || m.messageid
        if (!rawExtId) continue
        const pureExtId = String(rawExtId).includes(':') ? String(rawExtId).split(':').pop()! : String(rawExtId)

        const rawText =
          typeof m.text === 'string' && m.text.trim()
            ? m.text.trim()
            : typeof m.content === 'string' && m.content.trim()
            ? m.content.trim()
            : m.content?.text || m.content?.caption || ''

        const rawType = String(m.messageType || m.mediaType || '').toLowerCase()
        let msgType = 'text'
        if (rawType.includes('audio') || rawType.includes('ptt')) msgType = 'audio'
        else if (rawType.includes('image')) msgType = 'image'
        else if (rawType.includes('video')) msgType = 'video'
        else if (rawType.includes('document')) msgType = 'document'
        else if (rawType.includes('sticker')) msgType = 'sticker'

        const previewFormatted = formatSyncPreview(msgType, rawText)
        if (!rawText && !m.fileURL && msgType === 'text') continue

        const tsMs = Number(m.messageTimestamp || 0) > 0
          ? (Number(m.messageTimestamp) < 1e12 ? Number(m.messageTimestamp) * 1000 : Number(m.messageTimestamp))
          : Date.now()

        const dir: 'inbound' | 'outbound' = m.fromMe ? 'outbound' : 'inbound'
        if (!newestMsgMeta || tsMs >= newestMsgMeta.tsMs) {
          newestMsgMeta = {
            text: previewFormatted,
            direction: dir,
            tsMs
          }
        }

        if (existingExtIds.has(String(rawExtId)) || existingExtIds.has(pureExtId)) continue

        toInsert.push({
          conversation_id: conversationId,
          direction: dir,
          message_type: msgType,
          content: rawText || previewFormatted,
          media_url: m.fileURL || null,
          status: 'delivered',
          external_id: pureExtId,
          sender_name: m.fromMe ? 'WhatsApp Web / Equipe' : (conv.contact_name || m.senderName || cleanPhone),
          created_at: new Date(tsMs).toISOString(),
          is_private: false
        })
        existingExtIds.add(pureExtId)
      }

      if (toInsert.length > 0) {
        await supabase.from('chat_messages').insert(toInsert)
        await supabase
          .from('chat_messages')
          .delete()
          .eq('conversation_id', conversationId)
          .like('external_id', 'sync_%')
      }

      // Garantir que a conversa tenha sempre o preview e direção reais da última mensagem
      if (newestMsgMeta) {
        await supabase
          .from('chat_conversations')
          .update({
            last_message_text: newestMsgMeta.text,
            last_message_preview: newestMsgMeta.text.slice(0, 140),
            last_message_direction: newestMsgMeta.direction,
            updated_at: new Date().toISOString()
          })
          .eq('id', conversationId)
      }

      return NextResponse.json({ success: true, imported: toInsert.length })
    }

    // 1. Ação: Zerar todas as conversas e mensagens
    if (action === 'clear_all_conversations') {
      await supabase.from('chat_messages').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('chat_conversations').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      return NextResponse.json({ success: true, message: "Todas as conversas e mensagens foram zeradas com sucesso!" })
    }

    // 2. Ação: Re-cruzar todas as conversas com Trabalhadores (core_personal.workers)
    if (action === 'rematch_workers') {
      const { data, error } = await supabase.rpc('rematch_all_conversations_with_workers')
      if (error) throw error
      return NextResponse.json({
        success: true,
        matchedCount: data?.matched_count || 0,
        message: `${data?.matched_count || 0} conversa(s) vinculada(s) automaticamente a trabalhadores!`
      })
    }

    // Buscar canal específico
    if (!channelId) {
      return NextResponse.json({ error: "channelId é obrigatório" }, { status: 400 })
    }

    const { data: channel, error: chErr } = await supabase
      .from('chat_channels')
      .select('*')
      .eq('id', channelId)
      .single()

    if (chErr || !channel) {
      return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 })
    }

    if (tokenOverride && tokenOverride.trim()) {
      const cleanTk = tokenOverride.trim()
      await supabase
        .from('chat_channels')
        .update({
          api_token: cleanTk,
          instance_token: cleanTk,
          status: 'connected',
          updated_at: new Date().toISOString()
        })
        .eq('id', channel.id)
      channel.api_token = cleanTk
      channel.instance_token = cleanTk
    }

    const uazUrl = (channel.api_url || process.env.UAZ_API_URL || 'https://mcs-chat.uazapi.com').replace(/\/$/, '')
    const uazToken = (channel.instance_token || channel.api_token || process.env.UAZ_GLOBAL_KEY || '').trim()

    if (!uazToken) {
      return NextResponse.json({
        error: `Esta instância (${channel.name}) ainda não possui o Token da UazAPI cadastrado no MCS Chat. Cole o Token da Instância abaixo para consultar e importar as conversas.`,
        needsToken: true
      }, { status: 400 })
    }

    // Garantir Webhook sempre configurado na UazAPI ao operar no canal
    await evolutionApi.configureWebhook({
      instanceName: channel.instance_name || channel.name,
      apiUrl: uazUrl,
      apiToken: uazToken
    })

    // 3. Ação: Gerar QR Code / Conectar Instância existente na UazAPI
    if (action === 'connect_qr') {
      const res = await fetch(`${uazUrl}/instance/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          token: uazToken
        },
        body: JSON.stringify({})
      })
      const data = await res.json().catch(() => ({}))
      const qr = data?.instance?.qrcode || data?.qrcode?.base64 || data?.qrcode || data?.base64 || null
      const state = data?.instance?.status || data?.status || (qr ? 'connecting' : channel.status)

      await supabase
        .from('chat_channels')
        .update({
          qrcode_base64: qr,
          status: state === 'open' ? 'connected' : state,
          updated_at: new Date().toISOString()
        })
        .eq('id', channel.id)

      return NextResponse.json({
        success: true,
        qrcode: qr,
        status: state === 'open' ? 'connected' : state
      })
    }

    // Helper para buscar todas as conversas individuais da UazAPI paginando de 250 em 250
    async function fetchAllIndividualChatsFromUaz() {
      let allItems: any[] = []
      let totalStats: any = null
      let offset = 0
      const limit = 250

      while (offset < 1000) {
        const chatsRes = await fetch(`${uazUrl}/chat/find`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            token: uazToken
          },
          body: JSON.stringify({
            limit,
            offset,
            wa_isGroup: false
          })
        })

        if (!chatsRes.ok) {
          throw new Error(`UazAPI retornou status ${chatsRes.status}. Verifique se o Token da Instância (${channel.name}) está correto e conectado na UazAPI.`)
        }

        const payload = await chatsRes.json().catch(() => ({}))
        if (!totalStats && payload?.totalChatsStats) {
          totalStats = payload.totalChatsStats
        }

        const batch: any[] = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.chats)
          ? payload.chats
          : Array.isArray(payload?.data)
          ? payload.data
          : []

        const individuals = batch.filter(
          (item: any) => !item.wa_isGroup && !(item.wa_chatid || '').includes('@g.us') && !(item.wa_chatid || '').includes('broadcast')
        )
        allItems = allItems.concat(individuals)

        if (!payload?.pagination?.hasMore || batch.length < limit) {
          break
        }
        offset += limit
      }

      return { allItems, totalStats }
    }

    // Helper para identificar se a última mensagem do chat na UazAPI foi enviada pelo Operador (outbound -> "Você:")
    function resolveLastMsgDirection(item: any, cleanPhone: string): 'inbound' | 'outbound' {
      const sender = String(item.wa_lastMessageSender || '').trim()
      if (!sender) return 'inbound'
      const chatJid = String(item.wa_chatid || '').trim()
      const chatLid = String(item.wa_chatlid || '').trim()
      const ownerPhone = String(item.owner || channel.phone_number || '').replace(/\D/g, '')

      if (ownerPhone && sender.includes(ownerPhone) && cleanPhone !== ownerPhone) {
        return 'outbound'
      }
      if (chatJid && sender === chatJid) return 'inbound'
      if (chatLid && sender === chatLid) return 'inbound'
      if (sender.replace(/\D/g, '') === cleanPhone) return 'inbound'
      return 'outbound'
    }

    // 4. Ação: Preview / Diagnóstico Organizado antes de importar (1 única chamada RPC batch!)
    if (action === 'preview_channel') {
      const { allItems, totalStats } = await fetchAllIndividualChatsFromUaz()

      const parsedItems = allItems
        .map((item: any) => {
          const jid = item.wa_chatid || item.id || item.remoteJid || ''
          const cleanPhone = jid.replace(/@.*$/, '').replace(/\D/g, '')
          const rawTs = Number(item.wa_lastMsgTimestamp || 0)
          const tsMs = rawTs > 0 ? (rawTs < 1e12 ? rawTs * 1000 : rawTs) : 0
          return { item, cleanPhone, tsMs }
        })
        .filter((x: any) => x.cleanPhone.length >= 8)

      const allPhones = Array.from(new Set(parsedItems.map((x: any) => x.cleanPhone)))
      const { data: batchMatches } = await supabase.rpc('match_workers_batch_by_phones', {
        p_phones: allPhones,
        p_company_name: channel.company_name || null
      })
      const matchMap: Record<string, any> = batchMatches || {}

      let matchedWorkersCount = 0
      let unmatchedCount = 0
      let recent30dCount = 0
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
      const sampleMatched: any[] = []
      const sampleUnmatched: any[] = []

      for (const { item, cleanPhone, tsMs } of parsedItems) {
        if (tsMs >= thirtyDaysAgo) recent30dCount++

        const matchData = matchMap[cleanPhone]
        if (matchData && matchData.matched) {
          matchedWorkersCount++
          if (sampleMatched.length < 30) {
            sampleMatched.push({
              phone: cleanPhone,
              waName: item.name || item.wa_name || '',
              workerName: matchData.nome,
              company: matchData.contratante,
              client: matchData.cliente,
              role: matchData.funcion,
              lastMessage: formatSyncPreview(item.wa_lastMessageType, item.wa_lastMessageTextVote).slice(0, 80)
            })
          }
        } else {
          unmatchedCount++
          if (sampleUnmatched.length < 15) {
            sampleUnmatched.push({
              phone: cleanPhone,
              waName: item.name || item.wa_name || `+${cleanPhone}`,
              lastMessage: formatSyncPreview(item.wa_lastMessageType, item.wa_lastMessageTextVote).slice(0, 80)
            })
          }
        }
      }

      return NextResponse.json({
        success: true,
        channelName: channel.display_label || channel.name,
        totalIndividualChats: parsedItems.length,
        totalGroupsIgnored: totalStats?.group_chats?.total || 0,
        matchedWorkersCount,
        unmatchedCount,
        recent30dCount,
        sampleMatched,
        sampleUnmatched
      })
    }

    // 5. Ação: Importar Conversas da UazAPI de forma organizada + Histórico de Mensagens (em lote rápido!)
    if (action === 'sync_channel') {
      const { allItems } = await fetchAllIndividualChatsFromUaz()
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

      const parsedItems = allItems
        .map((item: any) => {
          const jid = item.wa_chatid || item.id || item.remoteJid || item.jid || ''
          const cleanPhone = jid.replace(/@.*$/, '').replace(/\D/g, '')
          const rawTs = Number(item.wa_lastMsgTimestamp || 0)
          const tsMs = rawTs > 0 ? (rawTs < 1e12 ? rawTs * 1000 : rawTs) : Date.now()
          return { item, cleanPhone, rawTs, tsMs }
        })
        .filter((x: any) => x.cleanPhone.length >= 8 && (x.rawTs > 0 || Boolean(x.item.wa_lastMessageTextVote) || Boolean(x.item.wa_lastMessageType)))

      const allPhones = Array.from(new Set(parsedItems.map((x: any) => x.cleanPhone)))
      const { data: batchMatches } = await supabase.rpc('match_workers_batch_by_phones', {
        p_phones: allPhones,
        p_company_name: channel.company_name || null
      })
      const matchMap: Record<string, any> = batchMatches || {}

      // Carregar conversas existentes deste canal de uma só vez
      const { data: existingConvs } = await supabase
        .from('chat_conversations')
        .select('id, contact_phone, worker_id')
        .eq('channel_id', channel.id)

      const existingByPhone = new Map<string, any>()
      for (const ec of existingConvs || []) {
        existingByPhone.set(ec.contact_phone, ec)
      }

      let importedCount = 0
      let updatedCount = 0
      let matchedWorkersCount = 0
      let importedMessagesCount = 0

      const convsToInsert: any[] = []
      const lastMsgByPhone = new Map<string, { text: string; direction: 'inbound' | 'outbound'; msgType: string; created_at: string; external_id: string; sender_name: string }>()

      for (const { item, cleanPhone, rawTs, tsMs } of parsedItems) {
        if (filterMode === 'recent_30d' && tsMs < thirtyDaysAgo) {
          continue
        }

        const matchData = matchMap[cleanPhone]
        const isMatched = Boolean(matchData && matchData.matched)

        if (filterMode === 'matched_only' && !isMatched) {
          continue
        }

        if (isMatched) matchedWorkersCount++

        const defaultContactType = isMatched
          ? 'worker'
          : channel.channel_type === 'clients'
          ? 'client'
          : channel.channel_type === 'general'
          ? 'general'
          : 'worker'

        const contactName =
          (isMatched ? matchData.nome : null) ||
          item.name ||
          item.wa_name ||
          item.pushName ||
          `+${cleanPhone}`

        const lastTs = new Date(tsMs).toISOString()
        const fullLastText = formatSyncPreview(item.wa_lastMessageType, item.wa_lastMessageTextVote || item.lastMessage || '')
        const previewText = fullLastText.slice(0, 140)
        const lastDirection = resolveLastMsgDirection(item, cleanPhone)

        const existingConv = existingByPhone.get(cleanPhone)

        if (existingConv) {
          await supabase
            .from('chat_conversations')
            .update({
              contact_name: contactName,
              contact_type: defaultContactType,
              worker_id: existingConv.worker_id || (isMatched ? matchData.id : null),
              worker_company_name: isMatched ? matchData.contratante : channel.company_name || null,
              worker_client_name: isMatched ? matchData.cliente : null,
              worker_function_name: isMatched ? matchData.funcion : null,
              contact_avatar_url: item.imagePreview || item.image || undefined,
              last_message_at: lastTs,
              last_message_text: fullLastText,
              last_message_preview: previewText,
              last_message_direction: lastDirection,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingConv.id)
          updatedCount++
        } else if (!lastMsgByPhone.has(cleanPhone)) {
          convsToInsert.push({
            channel_id: channel.id,
            contact_phone: cleanPhone,
            contact_name: contactName,
            contact_type: defaultContactType,
            worker_id: isMatched ? matchData.id : null,
            worker_company_name: isMatched ? matchData.contratante : channel.company_name || null,
            worker_client_name: isMatched ? matchData.cliente : null,
            worker_function_name: isMatched ? matchData.funcion : null,
            department_id: channel.department_id || null,
            status: 'open',
            unread_count: Number(item.wa_unreadCount || 0),
            last_message_at: lastTs,
            last_message_preview: previewText,
            last_message_text: fullLastText,
            last_message_direction: lastDirection,
            contact_avatar_url: item.imagePreview || item.image || null,
            is_pinned: Boolean(item.wa_isPinned),
            bot_status: 'active'
          })

          const rawType = String(item.wa_lastMessageType || '').toLowerCase()
          let msgType = 'text'
          if (rawType.includes('audio') || rawType.includes('ptt')) msgType = 'audio'
          else if (rawType.includes('image')) msgType = 'image'
          else if (rawType.includes('video')) msgType = 'video'
          else if (rawType.includes('document')) msgType = 'document'

          lastMsgByPhone.set(cleanPhone, {
            text: fullLastText,
            direction: lastDirection,
            msgType,
            created_at: lastTs,
            external_id: `sync_${cleanPhone}_${rawTs || Date.now()}`,
            sender_name: lastDirection === 'outbound' ? 'WhatsApp Web / Equipe' : contactName
          })
        }
      }

      // Bulk insert conversations in batches of 100
      const messagesToInsert: any[] = []
      for (let i = 0; i < convsToInsert.length; i += 100) {
        const chunk = convsToInsert.slice(i, i + 100)
        const { data: insertedRows } = await supabase
          .from('chat_conversations')
          .insert(chunk)
          .select('id, contact_phone')

        for (const row of insertedRows || []) {
          importedCount++
          const msgMeta = lastMsgByPhone.get(row.contact_phone)
          if (importMessages && msgMeta && msgMeta.text) {
            messagesToInsert.push({
              conversation_id: row.id,
              direction: msgMeta.direction,
              message_type: msgMeta.msgType,
              content: msgMeta.text,
              status: 'delivered',
              external_id: msgMeta.external_id,
              sender_name: msgMeta.sender_name,
              created_at: msgMeta.created_at,
              is_private: false
            })
          }
        }
      }

      // Bulk insert initial messages in batches of 100
      for (let i = 0; i < messagesToInsert.length; i += 100) {
        const msgChunk = messagesToInsert.slice(i, i + 100)
        await supabase.from('chat_messages').insert(msgChunk)
        importedMessagesCount += msgChunk.length
      }

      return NextResponse.json({
        success: true,
        importedCount,
        updatedCount,
        matchedWorkersCount,
        importedMessagesCount,
        totalScanned: parsedItems.length,
        message: `Importação concluída: ${importedCount} nova(s) conversa(s) criada(s), ${updatedCount} atualizada(s) e ${matchedWorkersCount} trabalhador(es) vinculado(s) automaticamente!`
      })
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
  } catch (error: any) {
    console.error("Erro em sync-chats:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
