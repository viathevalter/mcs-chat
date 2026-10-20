import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config"

export const maxDuration = 60

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, channelId, tokenOverride, filterMode = 'matched_only', importMessages = true } = body

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

    // Se o usuário informou um tokenOverride no modal, já salva no canal
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
              lastMessage: (item.wa_lastMessageTextVote || '').slice(0, 80)
            })
          }
        } else {
          unmatchedCount++
          if (sampleUnmatched.length < 15) {
            sampleUnmatched.push({
              phone: cleanPhone,
              waName: item.name || item.wa_name || `+${cleanPhone}`,
              lastMessage: (item.wa_lastMessageTextVote || '').slice(0, 80)
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
        .filter((x: any) => x.cleanPhone.length >= 8)

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
        const previewText = (item.wa_lastMessageTextVote || item.lastMessage || 'Conversa sincronizada').slice(0, 140)

        const existingConv = existingByPhone.get(cleanPhone)
        let targetConvId: string | null = null

        if (existingConv) {
          targetConvId = existingConv.id
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
              last_message_preview: previewText,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingConv.id)
          updatedCount++
        } else {
          const { data: insertedConv } = await supabase
            .from('chat_conversations')
            .insert({
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
              last_message_text: previewText,
              contact_avatar_url: item.imagePreview || item.image || null,
              is_pinned: Boolean(item.wa_isPinned),
              bot_status: 'active'
            })
            .select('id')
            .single()

          targetConvId = insertedConv?.id || null
          if (targetConvId) {
            existingByPhone.set(cleanPhone, { id: targetConvId, contact_phone: cleanPhone })
          }
          importedCount++

          if (targetConvId && importMessages && item.wa_lastMessageTextVote) {
            await supabase.from('chat_messages').insert({
              conversation_id: targetConvId,
              direction: 'inbound',
              message_type: 'text',
              content: item.wa_lastMessageTextVote,
              status: 'delivered',
              external_id: `sync_${cleanPhone}_${rawTs || Date.now()}`,
              sender_name: contactName,
              created_at: lastTs,
              is_private: false
            })
            importedMessagesCount++
          }
        }
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
