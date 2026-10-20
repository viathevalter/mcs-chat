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
    const { action, channelId } = body

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

    const uazUrl = (channel.api_url || process.env.UAZ_API_URL || 'https://mcs-chat.uazapi.com').replace(/\/$/, '')
    const uazToken = channel.instance_token || channel.api_token || process.env.UAZ_GLOBAL_KEY || ''

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

    // 4. Ação: Importar Conversas da UazAPI e Cruzar Trabalhadores automaticamente
    if (action === 'sync_channel') {
      const chatsRes = await fetch(`${uazUrl}/chat/find`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          token: uazToken
        },
        body: JSON.stringify({
          limit: 120,
          offset: 0
        })
      })

      if (!chatsRes.ok) {
        return NextResponse.json(
          { error: `UazAPI retornou status ${chatsRes.status}. Verifique se a instância está conectada (connected).` },
          { status: 400 }
        )
      }

      const chatsPayload = await chatsRes.json().catch(() => ([]))
      const chatList: any[] = Array.isArray(chatsPayload)
        ? chatsPayload
        : Array.isArray(chatsPayload?.chats)
        ? chatsPayload.chats
        : Array.isArray(chatsPayload?.data)
        ? chatsPayload.data
        : []

      let importedCount = 0
      let matchedWorkersCount = 0

      for (const item of chatList) {
        const jid = item.wa_chatid || item.id || item.remoteJid || item.jid || ''
        if (!jid || jid.includes('@g.us') || jid.includes(' broadcast')) continue

        const cleanPhone = jid.replace(/\D/g, '')
        if (cleanPhone.length < 8) continue

        // Cruzar com core_personal.workers via RPC match_worker_by_phone
        const { data: matchData } = await supabase.rpc('match_worker_by_phone', {
          p_raw_phone: cleanPhone,
          p_company_name: channel.company_name || null
        })

        const isMatched = Boolean(matchData && matchData.matched)
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

        const lastTs = item.wa_lastMsgTimestamp
          ? new Date(Number(item.wa_lastMsgTimestamp) * (Number(item.wa_lastMsgTimestamp) < 1e12 ? 1000 : 1)).toISOString()
          : new Date().toISOString()

        const { data: existingConv } = await supabase
          .from('chat_conversations')
          .select('id, worker_id')
          .eq('channel_id', channel.id)
          .eq('contact_phone', cleanPhone)
          .maybeSingle()

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
              updated_at: new Date().toISOString()
            })
            .eq('id', existingConv.id)
        } else {
          await supabase.from('chat_conversations').insert({
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
            last_message_preview: item.wa_lastMessageTextVote || item.lastMessage || 'Conversa sincronizada',
            contact_avatar_url: item.imagePreview || item.image || null,
            bot_status: 'active'
          })
          importedCount++
        }
      }

      return NextResponse.json({
        success: true,
        importedCount,
        matchedWorkersCount,
        totalScanned: chatList.length,
        message: `Sincronização concluída: ${importedCount} nova(s) conversa(s) importada(s) e ${matchedWorkersCount} trabalhador(es) identificado(s) pelo telefone!`
      })
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
  } catch (error: any) {
    console.error("Erro em sync-chats:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
