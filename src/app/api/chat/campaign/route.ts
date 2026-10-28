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
    cod_colab?: string | null
    pasaporte?: string | null
    nie?: string | null
    dni?: string | null
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
  const passportDoc = (worker.pasaporte || worker.nie || worker.dni || '').trim()
  const codColab = (worker.cod_colab || '').trim()
  const company = (worker.contratante || 'MCS').trim()
  const client = (worker.cliente || 'Obra').trim()
  const func = (worker.funcion || 'Profissional').trim()
  const pedido = (worker.pedido_code || '').trim()
  const obra = (worker.obra_nome || client).trim()

  let out = template
    .replace(/\{nome\}/gi, fullName)
    .replace(/\{primeiro_nome\}/gi, firstName)
    .replace(/\{passaporte\}/gi, passportDoc)
    .replace(/\{pasaporte\}/gi, passportDoc)
    .replace(/\{documento\}/gi, passportDoc)
    .replace(/\{cod_colab\}/gi, codColab)
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

export function computeNextRunAt(rule: any, baseDate = new Date()): string {
  const frequency = rule?.frequency || 'weekly'
  const timeOfDay = String(rule?.timeOfDay || '09:00')
  const [rawH, rawM] = timeOfDay.split(':').map((n: string) => parseInt(n, 10))
  const targetHour = Number.isFinite(rawH) ? rawH : 9
  const targetMin = Number.isFinite(rawM) ? rawM : 0

  const candidate = new Date(baseDate.getTime())
  candidate.setSeconds(0, 0)

  if (frequency === 'daily') {
    const weekdaysOnly = Boolean(rule?.weekdaysOnly)
    candidate.setHours(targetHour, targetMin, 0, 0)
    if (candidate.getTime() <= baseDate.getTime() + 30000) {
      candidate.setDate(candidate.getDate() + 1)
    }
    if (weekdaysOnly) {
      while (candidate.getDay() === 0 || candidate.getDay() === 6) {
        candidate.setDate(candidate.getDate() + 1)
      }
    }
    return candidate.toISOString()
  }

  if (frequency === 'weekly') {
    const days: number[] =
      Array.isArray(rule?.daysOfWeek) && rule.daysOfWeek.length > 0
        ? rule.daysOfWeek.map((d: any) => Number(d))
        : [5] // Sexta-feira padrão

    for (let addDays = 0; addDays <= 8; addDays++) {
      const d = new Date(baseDate.getTime())
      d.setDate(d.getDate() + addDays)
      d.setHours(targetHour, targetMin, 0, 0)
      if (days.includes(d.getDay()) && d.getTime() > baseDate.getTime() + 30000) {
        return d.toISOString()
      }
    }
    candidate.setDate(candidate.getDate() + 7)
    candidate.setHours(targetHour, targetMin, 0, 0)
    return candidate.toISOString()
  }

  if (frequency === 'biweekly') {
    // Quinzenal: dias 15 e 30 (ou último dia do mês em fevereiro)
    const targetDays = [15, 30]
    for (let addMonths = 0; addMonths <= 2; addMonths++) {
      const year = baseDate.getFullYear()
      const month = baseDate.getMonth() + addMonths
      const lastDay = new Date(year, month + 1, 0).getDate()
      for (const td of targetDays) {
        const clampedDay = Math.min(td, lastDay)
        const d = new Date(year, month, clampedDay, targetHour, targetMin, 0, 0)
        if (d.getTime() > baseDate.getTime() + 30000) {
          return d.toISOString()
        }
      }
    }
  }

  // Monthly (Mensal — ex: todo dia 25, 26 ou último dia do mês para Folha de Horas)
  const dayOfMonth = Number(rule?.dayOfMonth || 26)
  const isLastDay = Boolean(rule?.lastDayOfMonth)
  for (let addMonths = 0; addMonths <= 2; addMonths++) {
    const year = baseDate.getFullYear()
    const month = baseDate.getMonth() + addMonths
    const lastDay = new Date(year, month + 1, 0).getDate()
    const actualDay = isLastDay ? lastDay : Math.min(Math.max(1, dayOfMonth), lastDay)
    const d = new Date(year, month, actualDay, targetHour, targetMin, 0, 0)
    if (d.getTime() > baseDate.getTime() + 30000) {
      return d.toISOString()
    }
  }

  candidate.setMonth(candidate.getMonth() + 1)
  candidate.setHours(targetHour, targetMin, 0, 0)
  return candidate.toISOString()
}

function isWorkerActiveStatusServer(status?: string | null, includePendingEntry = true): boolean {
  const s = (status || '').trim().toUpperCase()
  if (s === 'ATIVO' || s === 'ACTIVE') return true
  if (includePendingEntry && (s.includes('PENDENTE') || s.includes('PENDIENTE'))) return true
  return false
}

function isWorkerBlockedStatusServer(status?: string | null): boolean {
  const s = (status || '').trim().toUpperCase()
  return s === 'INATIVO' || s === 'DESISTIU' || s === 'DESLIGADO' || s === 'BAIXA' || s === 'AFASTADO'
}

async function resolveDynamicRecipients(supabase: any, segmentConfig: any): Promise<any[]> {
  const { data: allWorkers } = await supabase
    .schema('core_personal')
    .from('workers')
    .select('id, cod_colab, nome, movil, pasaporte, nie, dni, contratante, cliente, funcion, status_trabajador')
    .order('nome', { ascending: true })

  if (!allWorkers || allWorkers.length === 0) return []

  const cfg = segmentConfig || {}
  const segmentMode = cfg.segmentMode || 'manual'
  const selectedPedidos: string[] = Array.isArray(cfg.selectedPedidos) ? cfg.selectedPedidos : []
  const selectedClients: string[] = Array.isArray(cfg.selectedClients) ? cfg.selectedClients : []
  const selectedCompanies: string[] = Array.isArray(cfg.selectedCompanies) ? cfg.selectedCompanies : []
  const hideInactive = cfg.hideInactiveSafetyLock !== false
  const includePending = cfg.includePendingIngreso !== false
  const manualIds = new Set<string>(Array.isArray(cfg.selectedWorkerIds) ? cfg.selectedWorkerIds : [])
  const extraManualIds = new Set<string>(Array.isArray(cfg.extraManualWorkerIds) ? cfg.extraManualWorkerIds : [])

  const pedidoWorkerIds = new Set<string>()
  const pedidoWorkerCodes = new Set<string>()
  const workerPedidoMap = new Map<string, { cod_pedido: string; obra_nome: string }>()

  if (segmentMode === 'pedido' && selectedPedidos.length > 0) {
    const { data: pedList } = await supabase.rpc('get_campaign_pedidos_overview')
    if (Array.isArray(pedList)) {
      pedList
        .filter((p: any) => selectedPedidos.includes(p.cod_pedido))
        .forEach((p: any) => {
          ;(p.worker_ids || []).forEach((id: string) => {
            pedidoWorkerIds.add(id)
            workerPedidoMap.set(id, { cod_pedido: p.cod_pedido, obra_nome: p.obra_nome || p.cliente_nome })
          })
          ;(p.worker_codes || []).forEach((code: string) => {
            const normCode = String(code).trim().toUpperCase()
            pedidoWorkerCodes.add(normCode)
            workerPedidoMap.set(normCode, { cod_pedido: p.cod_pedido, obra_nome: p.obra_nome || p.cliente_nome })
          })
        })
    }
  }

  return allWorkers
    .filter((w: any) => {
      const cleanPhone = normalizeWorkerPhone(w.movil)
      if (cleanPhone.length < 8) return false

      // Sempre barra inativos/baixas na execução recorrente para segurança total
      if (hideInactive && isWorkerBlockedStatusServer(w.status_trabajador)) return false

      if (extraManualIds.has(w.id)) return true

      if (hideInactive && !isWorkerActiveStatusServer(w.status_trabajador, includePending)) {
        return false
      }

      if (segmentMode === 'pedido') {
        if (selectedPedidos.length === 0) return manualIds.has(w.id)
        const codeKey = (w.cod_colab || '').trim().toUpperCase()
        return pedidoWorkerIds.has(w.id) || (codeKey !== '' && pedidoWorkerCodes.has(codeKey))
      }

      if (segmentMode === 'clients') {
        if (selectedClients.length === 0) return manualIds.has(w.id)
        const wCli = (w.cliente || '').trim()
        if (!selectedClients.includes(wCli)) return false
        if (selectedCompanies.length > 0) {
          const wEmp = (w.contratante || '').trim().toUpperCase()
          if (!selectedCompanies.includes(wEmp)) return false
        }
        return true
      }

      if (segmentMode === 'companies') {
        if (selectedCompanies.length === 0) return manualIds.has(w.id)
        const wEmp = (w.contratante || '').trim().toUpperCase()
        return selectedCompanies.includes(wEmp)
      }

      // Modo manual: se houver lista explícita de IDs selecionados, usa ela (já filtrada contra inativos acima)
      if (manualIds.size > 0) {
        return manualIds.has(w.id)
      }
      return true
    })
    .map((w: any) => {
      const codeKey = (w.cod_colab || '').trim().toUpperCase()
      const pedMeta = workerPedidoMap.get(w.id) || (codeKey ? workerPedidoMap.get(codeKey) : undefined)
      return {
        ...w,
        pedido_code: pedMeta?.cod_pedido || null,
        obra_nome: pedMeta?.obra_nome || w.cliente || null,
      }
    })
}

function buildQueueItemsForCampaign(params: {
  campaignId: string
  batchId: string
  recipients: any[]
  startTimeMs: number
  cadenceMode: string
  channelMode: string
  channelId: string | null
  channels: any[]
  content: string
  mediaUrl: string | null
  mediaType: string | null
  mediaFilename: string | null
  linkUrl: string | null
}) {
  const {
    campaignId,
    batchId,
    recipients,
    startTimeMs,
    cadenceMode,
    channelMode,
    channelId,
    channels,
    content,
    mediaUrl,
    mediaType,
    mediaFilename,
    linkUrl,
  } = params

  let accumulatedDelayMs = 0
  return recipients.map((w: any, index: number) => {
    if (index > 0) {
      if (cadenceMode === 'conservative') {
        const jitter = 15000 + Math.floor(Math.random() * 10000)
        const batchCooldown = index % 20 === 0 ? 90000 : 0
        accumulatedDelayMs += jitter + batchCooldown
      } else if (cadenceMode === 'fast') {
        accumulatedDelayMs += 4000 + Math.floor(Math.random() * 3000)
      } else {
        const jitter = 8000 + Math.floor(Math.random() * 6000)
        const batchCooldown = index % 25 === 0 ? 45000 : 0
        accumulatedDelayMs += jitter + batchCooldown
      }
    }

    const dispatchDate = new Date(startTimeMs + accumulatedDelayMs)
    const matchedCh =
      channelMode === 'auto_company'
        ? resolveChannelForCompany(channels || [], w.contratante, channelId)
        : (channels || []).find((c: any) => c.id === channelId) ||
          resolveChannelForCompany(channels || [], w.contratante, null)

    const personalizedText = interpolateTemplate(
      String(content),
      {
        nome: w.nome,
        cod_colab: w.cod_colab,
        pasaporte: w.pasaporte,
        nie: w.nie,
        dni: w.dni,
        contratante: w.contratante || matchedCh?.company_name,
        cliente: w.cliente,
        funcion: w.funcion,
        pedido_code: w.pedido_code,
        obra_nome: w.obra_nome,
      },
      linkUrl
    )

    return {
      campaign_id: campaignId,
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
}

async function triggerRecurringCampaignRun(supabase: any, parentCamp: any, channels: any[]) {
  const now = new Date()
  const nextRunIso = computeNextRunAt(parentCamp.recurrence_rule || {}, new Date(now.getTime() + 60000))
  const nextRunsCount = Number(parentCamp.runs_count || 0) + 1

  // Atualiza a campanha recorrente mãe com o próximo agendamento
  await supabase
    .from('chat_campaigns')
    .update({
      last_run_at: now.toISOString(),
      next_run_at: nextRunIso,
      runs_count: nextRunsCount,
      updated_at: now.toISOString(),
    })
    .eq('id', parentCamp.id)

  const liveRecipients = await resolveDynamicRecipients(supabase, parentCamp.segment_config)
  if (!liveRecipients || liveRecipients.length === 0) {
    return { triggered: false, count: 0 }
  }

  const dateTag = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const childName = `🔄 [Remessa #${nextRunsCount} - ${dateTag}] ${parentCamp.name}`

  const { data: childCamp } = await supabase
    .from('chat_campaigns')
    .insert({
      name: childName,
      category: parentCamp.category || 'horas',
      target_summary: `${liveRecipients.length} trab. ativos (Ciclo Recorrente #${nextRunsCount})`,
      channel_mode: parentCamp.channel_mode || 'auto_company',
      channel_id: parentCamp.channel_id || null,
      cadence_mode: parentCamp.cadence_mode || 'safe',
      content_template: parentCamp.content_template,
      media_url: parentCamp.media_url || null,
      media_type: parentCamp.media_type || null,
      media_filename: parentCamp.media_filename || null,
      link_url: parentCamp.link_url || null,
      schedule_type: 'immediate',
      parent_campaign_id: parentCamp.id,
      status: 'running',
      total_recipients: liveRecipients.length,
      sent_count: 0,
      failed_count: 0,
      created_by_name: parentCamp.created_by_name || 'Automação Recorrente MCS',
      scheduled_start_at: now.toISOString(),
    })
    .select('id')
    .single()

  if (!childCamp?.id) return { triggered: false, count: 0 }

  const batchId = randomUUID()
  const queueItems = buildQueueItemsForCampaign({
    campaignId: childCamp.id,
    batchId,
    recipients: liveRecipients,
    startTimeMs: now.getTime(),
    cadenceMode: parentCamp.cadence_mode || 'safe',
    channelMode: parentCamp.channel_mode || 'auto_company',
    channelId: parentCamp.channel_id || null,
    channels,
    content: parentCamp.content_template,
    mediaUrl: parentCamp.media_url || null,
    mediaType: parentCamp.media_type || null,
    mediaFilename: parentCamp.media_filename || null,
    linkUrl: parentCamp.link_url || null,
  })

  await supabase.from('chat_scheduled_messages').insert(queueItems)
  return { triggered: true, childCampaignId: childCamp.id, count: queueItems.length }
}

export async function processDueScheduledMessages(maxItems = 3) {
  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()

  const { data: channels } = await supabase
    .from('chat_channels')
    .select('*')
    .eq('is_active', true)

  // 0.1 Ativar campanhas agendadas únicas cujo horário programado já chegou
  await supabase
    .from('chat_campaigns')
    .update({ status: 'running', updated_at: nowIso })
    .eq('status', 'scheduled')
    .lte('scheduled_start_at', nowIso)

  // 0.2 Verificar se alguma campanha recorrente ativa atingiu o horário de disparo (next_run_at <= now)
  const { data: dueRecurring } = await supabase
    .from('chat_campaigns')
    .select('*')
    .eq('is_recurrence_active', true)
    .lte('next_run_at', nowIso)
    .limit(3)

  if (dueRecurring && dueRecurring.length > 0) {
    for (const recCamp of dueRecurring) {
      try {
        await triggerRecurringCampaignRun(supabase, recCamp, channels || [])
      } catch (e) {
        console.error('Erro ao disparar campanha recorrente:', e)
      }
    }
  }

  // Buscar campanhas pausadas ou canceladas para não disparar itens delas
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
      let finalContent = item.content || ''

      // Buscar dados mais recentes do trabalhador em core_personal.workers (garante telefone/passaporte atualizados e trava anti-inativo)
      if (item.target_worker_id) {
        const { data: freshW } = await supabase
          .schema('core_personal')
          .from('workers')
          .select('id, cod_colab, nome, movil, pasaporte, nie, dni, contratante, cliente, funcion, status_trabajador')
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

          finalContent = interpolateTemplate(
            finalContent,
            {
              nome: freshW.nome || workerName,
              cod_colab: freshW.cod_colab || item.worker_code,
              pasaporte: freshW.pasaporte,
              nie: freshW.nie,
              dni: freshW.dni,
              contratante: freshW.contratante || workerCompany || undefined,
              cliente: freshW.cliente || workerClient || undefined,
              funcion: freshW.funcion || workerFunction || undefined,
              pedido_code: item.pedido_code || undefined,
            },
            item.link_url
          )
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
          caption: finalContent,
          instanceName,
          apiUrl,
          apiToken,
          provider,
        })
      } else {
        apiRes = await evolutionApi.sendText({
          number: phoneToUse,
          text: finalContent,
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

      const sentIso = new Date().toISOString()
      const previewStr = item.media_url
        ? item.media_type === 'document'
          ? `📄 ${finalContent || 'Documento de Campanha'}`
          : `📷 ${finalContent || 'Imagem de Campanha'}`
        : finalContent || 'Comunicado enviado'

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
            last_message_at: sentIso,
            last_message_text: previewStr,
            last_message_preview: previewStr.slice(0, 140),
            last_message_direction: 'outbound',
            updated_at: sentIso,
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
            last_message_at: sentIso,
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
          content: finalContent,
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
          sent_at: sentIso,
          content: finalContent,
          worker_phone: phoneToUse,
          channel_id: channel.id,
          conversation_id: conversationId,
          error_message: null,
          updated_at: sentIso,
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
    const [{ data: allItems }, { data: campRow }] = await Promise.all([
      supabase.from('chat_scheduled_messages').select('status').eq('campaign_id', campId),
      supabase.from('chat_campaigns').select('id, schedule_type, is_recurrence_active').eq('id', campId).maybeSingle(),
    ])

    if (allItems) {
      const total = allItems.length
      const sentCnt = allItems.filter((x: any) => x.status === 'sent').length
      const failedCnt = allItems.filter((x: any) => x.status === 'failed').length
      const pendingCnt = allItems.filter((x: any) => x.status === 'pending' || x.status === 'sending').length

      const nextStatus =
        pendingCnt === 0
          ? campRow?.schedule_type === 'recurring' && campRow?.is_recurrence_active
            ? 'recurring'
            : 'completed'
          : 'running'

      await supabase
        .from('chat_campaigns')
        .update({
          total_recipients: total,
          sent_count: sentCnt,
          failed_count: failedCnt,
          status: nextStatus,
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
      const updates: Record<string, any> = {
        status: nextStatus,
        updated_at: new Date().toISOString(),
      }
      if (nextStatus === 'cancelled') {
        updates.is_recurrence_active = false
      }
      await supabase.from('chat_campaigns').update(updates).eq('id', campaignId)

      if (nextStatus === 'cancelled') {
        await supabase
          .from('chat_scheduled_messages')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('campaign_id', campaignId)
          .eq('status', 'pending')
      }

      return NextResponse.json({ success: true })
    }

    // 4. Ação: Ativar / Pausar ou Atualizar Regra de Recorrência de uma Campanha
    if (action === 'toggle_recurrence') {
      const { campaignId, isActive, recurrenceRule } = body
      if (!campaignId) {
        return NextResponse.json({ error: 'campaignId obrigatório' }, { status: 400 })
      }
      const { data: existing } = await supabase
        .from('chat_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single()

      if (!existing) {
        return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })
      }

      const nextRule = recurrenceRule || existing.recurrence_rule || {
        frequency: 'weekly',
        daysOfWeek: [5],
        timeOfDay: '09:00',
      }
      const nextRunAt = isActive ? computeNextRunAt(nextRule, new Date()) : existing.next_run_at

      await supabase
        .from('chat_campaigns')
        .update({
          schedule_type: 'recurring',
          is_recurrence_active: Boolean(isActive),
          recurrence_rule: nextRule,
          next_run_at: nextRunAt,
          status: isActive ? 'recurring' : 'paused',
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaignId)

      return NextResponse.json({ success: true, nextRunAt })
    }

    // 5. Ação: Disparar imediatamente um ciclo de uma Campanha Recorrente ou Agendada
    if (action === 'trigger_recurring_now') {
      const { campaignId } = body
      if (!campaignId) {
        return NextResponse.json({ error: 'campaignId obrigatório' }, { status: 400 })
      }
      const { data: camp } = await supabase
        .from('chat_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single()

      if (!camp) {
        return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 })
      }

      const { data: channels } = await supabase
        .from('chat_channels')
        .select('*')
        .eq('is_active', true)

      if (camp.schedule_type === 'scheduled' && camp.status === 'scheduled') {
        // Antecipar o início de uma campanha agendada única para agora
        const now = Date.now()
        const { data: items } = await supabase
          .from('chat_scheduled_messages')
          .select('id')
          .eq('campaign_id', campaignId)
          .eq('status', 'pending')
          .order('scheduled_for', { ascending: true })

        if (items && items.length > 0) {
          for (let i = 0; i < items.length; i++) {
            await supabase
              .from('chat_scheduled_messages')
              .update({ scheduled_for: new Date(now + i * 10000).toISOString() })
              .eq('id', items[i].id)
          }
        }
        await supabase
          .from('chat_campaigns')
          .update({
            status: 'running',
            scheduled_start_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', campaignId)

        await processDueScheduledMessages(1)
        return NextResponse.json({
          success: true,
          triggeredCampaignId: campaignId,
          count: items?.length || camp.total_recipients || 0,
        })
      }

      const res = await triggerRecurringCampaignRun(supabase, camp, channels || [])
      if (res.triggered) {
        await processDueScheduledMessages(1)
      }
      return NextResponse.json({
        success: true,
        triggeredCampaignId: res.childCampaignId || campaignId,
        count: res.count,
      })
    }

    // 6. Ação: Excluir Campanha Agendada / Recorrente
    if (action === 'delete_campaign') {
      const { campaignId } = body
      if (!campaignId) return NextResponse.json({ error: 'campaignId obrigatório' }, { status: 400 })
      await supabase.from('chat_scheduled_messages').delete().eq('campaign_id', campaignId).eq('status', 'pending')
      await supabase.from('chat_campaigns').delete().eq('id', campaignId)
      return NextResponse.json({ success: true })
    }

    // 7. Ação Padrão: Criar nova Campanha (Imediata, Agendada para Data/Hora, ou Recorrente Automática)
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
      scheduleType = 'immediate', // 'immediate' | 'scheduled' | 'recurring'
      scheduledStartAt = null,
      recurrenceRule = null,
      segmentConfig = null,
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

    const isScheduledFuture =
      scheduleType === 'scheduled' &&
      scheduledStartAt &&
      new Date(scheduledStartAt).getTime() > Date.now() + 60000

    const isRecurring = scheduleType === 'recurring'
    const sendFirstBatchNow = isRecurring ? Boolean(recurrenceRule?.sendFirstBatchNow) : !isScheduledFuture

    const startTimeMs = isScheduledFuture
      ? new Date(scheduledStartAt).getTime()
      : Date.now()

    const nextRunIso = isRecurring
      ? computeNextRunAt(recurrenceRule || { frequency: 'weekly', daysOfWeek: [5], timeOfDay: '09:00' }, new Date())
      : isScheduledFuture
      ? new Date(startTimeMs).toISOString()
      : null

    const campaignName =
      (name && String(name).trim()) ||
      `Campanha ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`

    const initialStatus = isRecurring
      ? sendFirstBatchNow
        ? 'running'
        : 'recurring'
      : isScheduledFuture
      ? 'scheduled'
      : 'running'

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
        schedule_type: scheduleType,
        recurrence_rule: isRecurring ? recurrenceRule : null,
        segment_config: segmentConfig || null,
        is_recurrence_active: isRecurring,
        next_run_at: nextRunIso,
        last_run_at: sendFirstBatchNow ? new Date().toISOString() : null,
        runs_count: sendFirstBatchNow ? 1 : 0,
        status: initialStatus,
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
    let enqueuedCount = 0

    // Enfileira os envios se for imediata, se for agendada única (com scheduled_for na data futura),
    // ou se for recorrente com "Enviar 1ª remessa agora" marcado!
    if (!isRecurring || sendFirstBatchNow) {
      const queueItems = buildQueueItemsForCampaign({
        campaignId: createdCamp.id,
        batchId,
        recipients,
        startTimeMs,
        cadenceMode,
        channelMode,
        channelId,
        channels: channels || [],
        content: String(content),
        mediaUrl,
        mediaType,
        mediaFilename,
        linkUrl,
      })

      const { error: insertErr } = await supabase.from('chat_scheduled_messages').insert(queueItems)
      if (insertErr) throw insertErr
      enqueuedCount = queueItems.length

      if (sendFirstBatchNow && !isScheduledFuture) {
        await processDueScheduledMessages(1)
      }
    }

    return NextResponse.json({
      success: true,
      campaignId: createdCamp.id,
      batchId,
      scheduleType,
      nextRunAt: nextRunIso,
      count: enqueuedCount || recipients.length,
    })
  } catch (err: any) {
    console.error('Campaign API Error:', err)
    return NextResponse.json({ error: err.message || 'Erro ao processar campanha' }, { status: 500 })
  }
}
