import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionApi } from '@/lib/whatsapp/evolution-api'
import { randomUUID } from 'crypto'

function normalizeWorkerPhone(rawPhone?: string | null): string {
  if (!rawPhone) return ''
  let clean = rawPhone.replace(/\D/g, '')
  if (!clean) return ''
  if (clean.startsWith('00')) clean = clean.replace(/^00+/, '')
  if (clean.length === 9 && (clean.startsWith('6') || clean.startsWith('7'))) return '34' + clean
  if (clean.length === 9 && clean.startsWith('9')) return '351' + clean
  if (clean.length === 10 && clean.startsWith('3')) return '57' + clean
  if (
    (clean.length === 10 || clean.length === 11) &&
    !clean.startsWith('34') &&
    !clean.startsWith('55') &&
    !clean.startsWith('57') &&
    !clean.startsWith('351') &&
    !clean.startsWith('48') &&
    !clean.startsWith('39') &&
    !clean.startsWith('33')
  ) {
    return '55' + clean
  }
  return clean
}

function interpolateTemplate(
  template: string,
  worker: {
    nome?: string
    contratante?: string
    cliente?: string
    funcion?: string
    pedido_code?: string
    obra_nome?: string
  },
  linkUrl?: string | null
): string {
  const fullName = (worker.nome || 'Trabalhador').trim()
  const firstName = fullName.split(/\s+/)[0] || fullName
  const company = (worker.contratante || 'MCS').trim()
  const client = (worker.cliente || 'Obra').trim()
  const func = (worker.funcion || 'Profissional').trim()
  const pedido = (worker.pedido_code || '').trim()
  const obra = (worker.obra_nome || client).trim()

  let out = template
    .replace(/\{nome\}/gi, fullName)
    .replace(/\{primeiro_nome\}/gi, firstName)
    .replace(/\{empresa\}/gi, company)
    .replace(/\{contratante\}/gi, company)
    .replace(/\{cliente\}/gi, client)
    .replace(/\{funcao\}/gi, func)
    .replace(/\{funcion\}/gi, func)
    .replace(/\{cod_pedido\}/gi, pedido || client)
    .replace(/\{obra\}/gi, obra)

  if (linkUrl && linkUrl.trim() && !out.includes(linkUrl.trim())) {
    out = `${out.trim()}\n\n🔗 ${linkUrl.trim()}`
  }

  return out.trim()
}

function resolveChannelForCompany(channels: any[], contratante?: string | null, fallbackChannelId?: string | null) {
  const workerChannels = channels.filter((ch) => (ch.channel_type || 'workers') === 'workers')
  if (contratante) {
    const norm = contratante.trim().toUpperCase()
    const exact = workerChannels.find((ch) => (ch.company_name || '').trim().toUpperCase() === norm)
    if (exact) return exact
    const partial = workerChannels.find(
      (ch) =>
        (ch.company_name || '').toUpperCase().includes(norm) ||
        norm.includes((ch.company_name || '').toUpperCase())
    )
    if (partial) return partial
  }
  if (fallbackChannelId) {
    const byId = channels.find((ch) => ch.id === fallbackChannelId)
    if (byId) return byId
  }
  return workerChannels[0] || channels[0] || null
}

export async function processDueScheduledMessages(maxItems = 3) {
  const supabase = createAdminClient()

  // Buscar campanhas pausadas para não disparar itens delas
  const { data: pausedCampaigns } = await supabase
    .from('chat_campaigns')
    .select('id')
    .in('status', ['paused', 'cancelled'])

  const pausedIds = new Set((pausedCampaigns || []).map((c: any) => c.id))

  const { data: pendingItems, error } = await supabase
    .from('chat_scheduled_messages')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(maxItems * 2)

  if (error || !pendingItems || pendingItems.length === 0) {
    return { processed: 0, sent: 0, failed: 0 }
  }

  const { data: channels } = await supabase
    .from('chat_channels')
    .select('*')
    .eq('is_active', true)

  const channelMap = new Map((channels || []).map((ch: any) => [ch.id, ch]))
  let processed = 0
  let sent = 0
  let failed = 0
  const touchedCampaignIds = new Set<string>()

  for (const item of pendingItems) {
    if (processed >= maxItems) break
    if (item.campaign_id && pausedIds.has(item.campaign_id)) continue

    // Claim item atomically
    const { data: claimed } = await supabase
      .from('chat_scheduled_messages')
      .update({ status: 'sending', updated_at: new Date().toISOString() })
      .eq('id', item.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (!claimed) continue
    processed++
    if (item.campaign_id) touchedCampaignIds.add(item.campaign_id)

    try {
      let phoneToUse = normalizeWorkerPhone(item.worker_phone)
      let workerName = item.worker_name || 'Trabalhador'
      let workerCompany = item.worker_company || null
      let workerClient = item.worker_client || null
      let workerFunction = item.worker_function || null

      // Buscar dados mais recentes do trabalhador em core_personal.workers (garante telefone atualizado e trava anti-inativo)
      if (item.target_worker_id) {
        const { data: freshW } = await supabase
          .schema('core_personal')
          .from('workers')
          .select('id, nome, movil, contratante, cliente, funcion, status_trabajador')
          .eq('id', item.target_worker_id)
          .maybeSingle()

        if (freshW) {
          const st = (freshW.status_trabajador || '').trim().toUpperCase()
          if (st === 'INATIVO' || st === 'DESISTIU' || st === 'DESLIGADO' || st === 'BAIXA') {
            throw new Error(`Envio bloqueado por segurança: Trabalhador consta atualmente como ${freshW.status_trabajador}`)
          }
          const latestPhone = normalizeWorkerPhone(freshW.movil)
          if (latestPhone.length >= 8) phoneToUse = latestPhone
          if (freshW.nome) workerName = freshW.nome
          if (freshW.contratante) workerCompany = freshW.contratante
          if (freshW.cliente) workerClient = freshW.cliente
          if (freshW.funcion) workerFunction = freshW.funcion
        }
      }

      if (!phoneToUse || phoneToUse.length < 8) {
        throw new Error('Trabalhador sem número de telefone válido cadastrado.')
      }

      // Resolver canal WhatsApp
      let channel = item.channel_id ? channelMap.get(item.channel_id) : null
      if (!channel) {
        channel = resolveChannelForCompany(channels || [], workerCompany, item.channel_id)
      }
      if (!channel) {
        throw new Error('Nenhum canal WhatsApp ativo disponível para envio.')
      }

      const instanceName = channel.instance_name || channel.name
      const apiUrl = channel.api_url || 'https://mcs-chat.uazapi.com'
      const apiToken = channel.instance_token || channel.api_token
      const provider = channel.provider || 'uazapi'

      if (!apiUrl || !apiToken) {
        throw new Error(`Canal ${channel.name} está sem credenciais de API (Token/URL).`)
      }

      let apiRes: any = null
      if (item.media_url) {
        const mType = item.media_type === 'document' ? 'document' : 'image'
        apiRes = await evolutionApi.sendMedia({
          number: phoneToUse,
          mediaUrl: item.media_url,
          mediaType: mType,
          fileName: item.media_filename || (mType === 'document' ? 'comunicado.pdf' : 'comunicado.jpg'),
          caption: item.content || '',
          instanceName,
          apiUrl,
          apiToken,
          provider,
        })
      } else {
        apiRes = await evolutionApi.sendText({
          number: phoneToUse,
          text: item.content || '',
          instanceName,
          apiUrl,
          apiToken,
          provider,
        })
      }

      const rawExtId =
        apiRes?.id ||
        apiRes?.messageid ||
        apiRes?.key?.id ||
        apiRes?.message?.key?.id ||
        apiRes?.data?.key?.id ||
        null
      const externalId = rawExtId
        ? String(rawExtId).includes(':')
          ? String(rawExtId).split(':').pop()!
          : String(rawExtId)
        : null

      // Garantir registro na conversa do trabalhador no MCS Chat para histórico completo
      let conversationId: string | null = null
      const { data: existingConv } = await supabase
        .from('chat_conversations')
        .select('id')
        .eq('channel_id', channel.id)
        .or(
          item.target_worker_id
            ? `worker_id.eq.${item.target_worker_id},contact_phone.ilike.%${phoneToUse.slice(-8)}%`
            : `contact_phone.ilike.%${phoneToUse.slice(-8)}%`
        )
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const nowIso = new Date().toISOString()
      const previewStr = item.media_url
        ? item.media_type === 'document'
          ? `📄 ${item.content || 'Documento de Campanha'}`
          : `📷 ${item.content || 'Imagem de Campanha'}`
        : item.content || 'Comunicado enviado'

      if (existingConv?.id) {
        conversationId = existingConv.id
        await supabase
          .from('chat_conversations')
          .update({
            contact_phone: phoneToUse,
            contact_name: workerName,
            worker_id: item.target_worker_id || undefined,
            worker_company_name: workerCompany || channel.company_name || undefined,
            worker_client_name: workerClient || undefined,
            worker_function_name: workerFunction || undefined,
            last_message_at: nowIso,
            last_message_text: previewStr,
            last_message_preview: previewStr.slice(0, 140),
            last_message_direction: 'outbound',
            updated_at: nowIso,
          })
          .eq('id', conversationId)
      } else {
        const { data: createdConv } = await supabase
          .from('chat_conversations')
          .insert({
            channel_id: channel.id,
            contact_phone: phoneToUse,
            contact_name: workerName,
            worker_id: item.target_worker_id || null,
            worker_company_name: workerCompany || channel.company_name || null,
            worker_client_name: workerClient || null,
            worker_function_name: workerFunction || null,
            status: 'open',
            unread_count: 0,
            last_message_at: nowIso,
            last_message_text: previewStr,
            last_message_preview: previewStr.slice(0, 140),
            last_message_direction: 'outbound',
          })
          .select('id')
          .single()
        conversationId = createdConv?.id || null
      }

      if (conversationId) {
        await supabase.from('chat_messages').insert({
          conversation_id: conversationId,
          direction: 'outbound',
          content: item.content || '',
          media_url: item.media_url || null,
          message_type: item.media_url ? (item.media_type === 'document' ? 'document' : 'image') : 'text',
          external_id: externalId,
          sender_name: '📢 Comunicado / Campanha',
          sender_department: 'Comunicação Operacional',
          status: 'sent',
        })
      }

      await supabase
        .from('chat_scheduled_messages')
        .update({
          status: 'sent',
          sent_at: nowIso,
          worker_phone: phoneToUse,
          channel_id: channel.id,
          conversation_id: conversationId,
          error_message: null,
          updated_at: nowIso,
        })
        .eq('id', item.id)

      sent++
    } catch (err: any) {
      failed++
      await supabase
        .from('chat_scheduled_messages')
        .update({
          status: 'failed',
          error_message: err?.message || 'Falha no disparo WhatsApp',
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
    }
  }

  // Recalcular contadores das campanhas afetadas
  for (const campId of touchedCampaignIds) {
    const { data: allItems } = await supabase
      .from('chat_scheduled_messages')
      .select('status')
      .eq('campaign_id', campId)

    if (allItems) {
      const total = allItems.length
      const sentCnt = allItems.filter((x: any) => x.status === 'sent').length
      const failedCnt = allItems.filter((x: any) => x.status === 'failed').length
      const pendingCnt = allItems.filter((x: any) => x.status === 'pending' || x.status === 'sending').length

      await supabase
        .from('chat_campaigns')
        .update({
          total_recipients: total,
          sent_count: sentCnt,
          failed_count: failedCnt,
          status: pendingCnt === 0 ? 'completed' : 'running',
          updated_at: new Date().toISOString(),
        })
        .eq('id', campId)
    }
  }

  return { processed, sent, failed }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const action = body.action || 'create_campaign'
    const supabase = createAdminClient()

    // 1. Ação: Processar próximos envios da fila em tempo real
    if (action === 'process_next') {
      const result = await processDueScheduledMessages(body.maxItems || 2)
      return NextResponse.json({ success: true, ...result })
    }

    // 2. Ação: Reenviar falhas de uma campanha (ou de um item específico)
    if (action === 'retry_failed') {
      const { campaignId, itemId } = body
      let query = supabase.from('chat_scheduled_messages').select('*').eq('status', 'failed')
      if (itemId) query = query.eq('id', itemId)
      else if (campaignId) query = query.eq('campaign_id', campaignId)
      else return NextResponse.json({ error: 'campaignId ou itemId obrigatório' }, { status: 400 })

      const { data: failedRows } = await query
      if (!failedRows || failedRows.length === 0) {
        return NextResponse.json({ success: true, retried: 0 })
      }

      const now = Date.now()
      for (let i = 0; i < failedRows.length; i++) {
        const row = failedRows[i]
        const nextTime = new Date(now + i * 9000).toISOString()
        await supabase
          .from('chat_scheduled_messages')
          .update({
            status: 'pending',
            error_message: null,
            scheduled_for: nextTime,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
      }

      if (campaignId) {
        await supabase
          .from('chat_campaigns')
          .update({ status: 'running', updated_at: new Date().toISOString() })
          .eq('id', campaignId)
      }

      return NextResponse.json({ success: true, retried: failedRows.length })
    }

    // 3. Ação: Pausar / Retomar / Cancelar Campanha
    if (action === 'update_campaign_status') {
      const { campaignId, nextStatus } = body
      if (!campaignId || !nextStatus) {
        return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
      }
      await supabase
        .from('chat_campaigns')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', campaignId)

      if (nextStatus === 'cancelled') {
        await supabase
          .from('chat_scheduled_messages')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('campaign_id', campaignId)
          .eq('status', 'pending')
      }

      return NextResponse.json({ success: true })
    }

    // 4. Ação Padrão: Criar nova Campanha com público selecionado e cadência anti-ban
    const {
      name,
      category = 'comunicado',
      targetSummary = '',
      channelMode = 'auto_company',
      channelId = null,
      cadenceMode = 'safe',
      content,
      mediaUrl = null,
      mediaType = null,
      mediaFilename = null,
      linkUrl = null,
      scheduledStartAt = null,
      createdByName = 'Operador MCS',
      recipients = [],
    } = body

    if (!content || !String(content).trim()) {
      return NextResponse.json({ error: 'Digite o conteúdo da mensagem da campanha.' }, { status: 400 })
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: 'Selecione pelo menos 1 trabalhador para receber a campanha.' }, { status: 400 })
    }

    const { data: channels } = await supabase
      .from('chat_channels')
      .select('*')
      .eq('is_active', true)

    const startTimeMs = scheduledStartAt ? Math.max(Date.now(), new Date(scheduledStartAt).getTime()) : Date.now()
    const campaignName =
      (name && String(name).trim()) ||
      `Campanha ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`

    const { data: createdCamp, error: campErr } = await supabase
      .from('chat_campaigns')
      .insert({
        name: campaignName,
        category,
        target_summary: targetSummary || `${recipients.length} trabalhador(es) selecionado(s)`,
        channel_mode: channelMode,
        channel_id: channelId || null,
        cadence_mode: cadenceMode,
        content_template: String(content).trim(),
        media_url: mediaUrl || null,
        media_type: mediaType || null,
        media_filename: mediaFilename || null,
        link_url: linkUrl || null,
        status: 'running',
        total_recipients: recipients.length,
        sent_count: 0,
        failed_count: 0,
        created_by_name: createdByName,
        scheduled_start_at: new Date(startTimeMs).toISOString(),
      })
      .select('id')
      .single()

    if (campErr || !createdCamp) {
      throw new Error(campErr?.message || 'Erro ao registrar campanha no banco')
    }

    const batchId = randomUUID()
    let accumulatedDelayMs = 0

    const queueItems = recipients.map((w: any, index: number) => {
      // Cadência Anti-Ban com Jitter Aleatório Humanizado
      if (index > 0) {
        if (cadenceMode === 'conservative') {
          // 15s a 25s entre mensagens + pausa extra de 90s a cada 20 envios
          const jitter = 15000 + Math.floor(Math.random() * 10000)
          const batchCooldown = index % 20 === 0 ? 90000 : 0
          accumulatedDelayMs += jitter + batchCooldown
        } else if (cadenceMode === 'fast') {
          // 4s a 7s entre mensagens (para listas pequenas de pedido)
          accumulatedDelayMs += 4000 + Math.floor(Math.random() * 3000)
        } else {
          // Modo Seguro Padrão: 8s a 14s entre mensagens + pausa de 45s a cada 25 envios
          const jitter = 8000 + Math.floor(Math.random() * 6000)
          const batchCooldown = index % 25 === 0 ? 45000 : 0
          accumulatedDelayMs += jitter + batchCooldown
        }
      }

      const dispatchDate = new Date(startTimeMs + accumulatedDelayMs)
      const matchedCh =
        channelMode === 'auto_company'
          ? resolveChannelForCompany(channels || [], w.contratante, channelId)
          : (channels || []).find((c: any) => c.id === channelId) || resolveChannelForCompany(channels || [], w.contratante, null)

      const personalizedText = interpolateTemplate(
        String(content),
        {
          nome: w.nome,
          contratante: w.contratante || matchedCh?.company_name,
          cliente: w.cliente,
          funcion: w.funcion,
          pedido_code: w.pedido_code,
          obra_nome: w.obra_nome,
        },
        linkUrl
      )

      return {
        campaign_id: createdCamp.id,
        batch_id: batchId,
        target_worker_id: w.id || null,
        worker_name: w.nome || 'Trabalhador',
        worker_code: w.cod_colab || null,
        worker_phone: normalizeWorkerPhone(w.movil),
        worker_company: w.contratante || matchedCh?.company_name || null,
        worker_client: w.cliente || null,
        worker_function: w.funcion || null,
        pedido_code: w.pedido_code || null,
        channel_id: matchedCh?.id || channelId || null,
        content: personalizedText,
        media_url: mediaUrl || null,
        media_type: mediaType || null,
        media_filename: mediaFilename || null,
        link_url: linkUrl || null,
        scheduled_for: dispatchDate.toISOString(),
        status: 'pending',
      }
    })

    const { error: insertErr } = await supabase.from('chat_scheduled_messages').insert(queueItems)
    if (insertErr) throw insertErr

    // Se o início é imediato, já dispara o primeiro item da fila agora!
    if (!scheduledStartAt || new Date(scheduledStartAt).getTime() <= Date.now() + 2000) {
      await processDueScheduledMessages(1)
    }

    return NextResponse.json({
      success: true,
      campaignId: createdCamp.id,
      batchId,
      count: queueItems.length,
    })
  } catch (err: any) {
    console.error('Campaign API Error:', err)
    return NextResponse.json({ error: err.message || 'Erro ao processar campanha' }, { status: 500 })
  }
}
