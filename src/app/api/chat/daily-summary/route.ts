import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

export const maxDuration = 300

export type AuditProfileType = 'workers' | 'hiring' | 'clients' | 'general'

function inferAuditProfile(channel?: any, overrideProfile?: string | null): AuditProfileType {
  if (overrideProfile && ['workers', 'hiring', 'clients', 'general'].includes(overrideProfile)) {
    return overrideProfile as AuditProfileType
  }
  const chType = String(channel?.channel_type || '').toLowerCase()
  const chName = String(channel?.display_label || channel?.name || '').toLowerCase()
  if (chType === 'hiring' || chName.includes('contrata') || chName.includes('recruta') || chName.includes('wolter')) {
    return 'hiring'
  }
  if (chType === 'clients' || chName.includes('cliente') || chName.includes('comercial')) {
    return 'clients'
  }
  if (chType === 'general' || chName.includes('cars') || chName.includes('frota') || chName.includes('epi') || chName.includes('safety')) {
    return 'general'
  }
  return 'workers'
}

function getProfileLabel(profile: AuditProfileType): string {
  switch (profile) {
    case 'hiring':
      return 'Contratação & Entrada de Trabalhadores'
    case 'clients':
      return 'Comercial & Manutenção de Clientes'
    case 'general':
      return 'Frota, EPI & Operações Gerais'
    default:
      return 'Operacional RH & Atenção ao Trabalhador'
  }
}

function buildHeuristicAudit(params: {
  targetDate: string
  channelLabel: string
  profile: AuditProfileType
  convList: Array<{
    conv: any
    msgs: any[]
  }>
  unansweredList: any[]
  agentStats: any[]
}) {
  const { targetDate, channelLabel, profile, convList, unansweredList, agentStats } = params
  const totalConvs = convList.length

  const topicCounters: Record<string, { count: number; samples: string[]; sentiment: string }> = {
    '💰 Pagamento, Holerites & Descontos (Dia 15/16)': { count: 0, samples: [], sentiment: 'Atenção / Sensível' },
    '⏰ Controle de Horas & Apontamentos Semanais': { count: 0, samples: [], sentiment: 'Operacional' },
    '🤝 Contratação, Documentos & Assinatura de Contrato': { count: 0, samples: [], sentiment: 'Triagem / Ingresso' },
    '🏠 Alojamento, Transporte & Logística de Obra': { count: 0, samples: [], sentiment: 'Operacional' },
    '🏥 Seguridade Social, Alta, Baixa & Aviso Prévio': { count: 0, samples: [], sentiment: 'Regularização' },
    '🏢 Comercial, Negociações & Solicitações de Clientes': { count: 0, samples: [], sentiment: 'Comercial' },
  }

  const risks: any[] = []

  for (const item of convList) {
    const { conv, msgs } = item
    const fullText = msgs.map(m => String(m.content || '')).join(' ').toLowerCase()
    const inboundMsgs = msgs.filter(m => m.direction === 'inbound')
    const inboundText = inboundMsgs.map(m => String(m.content || '')).join(' ').toLowerCase()
    const lastAgent = [...msgs].reverse().find(m => m.direction === 'outbound')?.sender_name || conv.assigned_to_name || 'Sem atendente'
    const contactLabel = conv.contact_name || conv.contact_phone || 'Contato'

    if (/nomina|nómina|holerite|desconto|descuento|pago|pagamento| transferencia|banco|iban|adelanto|adiantamento|sueldo|salario|salário|dia 15|día 15/.test(fullText)) {
      topicCounters['💰 Pagamento, Holerites & Descontos (Dia 15/16)'].count++
    }
    if (/hora|parte de trabajo|planilla|semana|apontamento|portal|firmar hoja|assinar folha/.test(fullText)) {
      topicCounters['⏰ Controle de Horas & Apontamentos Semanais'].count++
    }
    if (/contrato|documento|nie|dni|pasaporte|passaporte|niss|alta|vacante|vaga|empleo|trabalho|curriculo|cv/.test(fullText)) {
      topicCounters['🤝 Contratação, Documentos & Assinatura de Contrato'].count++
    }
    if (/alojamiento|alojamento|piso|habitacion|quarto|coche|carro|transporte|viaje|viagem|direccion|endereço/.test(fullText)) {
      topicCounters['🏠 Alojamento, Transporte & Logística de Obra'].count++
    }
    if (/baja|baixa|renuncia|demissao|demissão|accidente|acidente|medico|médico|seguridad social/.test(fullText)) {
      topicCounters['🏥 Seguridade Social, Alta, Baixa & Aviso Prévio'].count++
    }
    if (/presupuesto|orçamento|tarifa|factura|cliente|obra|reemplazo|substitui|soldador|montador|tubero/.test(fullText)) {
      topicCounters['🏢 Comercial, Negociações & Solicitações de Clientes'].count++
    }

    // Detectar trabalhador nervoso / reclamação de pagamento / desconto
    if (
      /no me pagaron|não recebi|descuento injusto|desconto indevido|falta dinero|falta dinheiro|reclama|denuncia|abogado|advogado|inspeccion|molesto|indignado|urgente|esperando un mes|sin dinero|sem dinheiro|mal trato/.test(
        inboundText
      )
    ) {
      const sampleMsg = inboundMsgs[inboundMsgs.length - 1]?.content || msgs[msgs.length - 1]?.content || ''
      risks.push({
        type: 'Trabalhador Insatisfeito / Reclamação de Pagamento',
        severity: 'high',
        conversation_id: conv.id,
        contact_name: contactLabel,
        contact_phone: conv.contact_phone || '',
        agent_name: lastAgent,
        reason: `Trabalhador ${contactLabel} demonstrou forte insatisfação ou questionamento sobre pagamento/descontos/condições.`,
        excerpt: String(sampleMsg).slice(0, 220),
      })
    } else if (/reemplazo|substituir|no se presento|não compareceu|queja|reclamação|problema en obra/.test(inboundText)) {
      const sampleMsg = inboundMsgs[inboundMsgs.length - 1]?.content || ''
      risks.push({
        type: 'Alerta Operacional / Cliente em Obra',
        severity: 'high',
        conversation_id: conv.id,
        contact_name: contactLabel,
        contact_phone: conv.contact_phone || '',
        agent_name: lastAgent,
        reason: `Ocorrência de obra, ausência ou solicitação de substituição identificada na conversa de ${contactLabel}.`,
        excerpt: String(sampleMsg).slice(0, 220),
      })
    }
  }

  // Adicionar conversas sem resposta críticas no radar de riscos
  for (const un of unansweredList.slice(0, 6)) {
    risks.push({
      type: 'Sem Resposta / Aguardando Retorno',
      severity: un.waiting_minutes > 120 ? 'high' : 'medium',
      conversation_id: un.conversation_id,
      contact_name: un.contact_name,
      contact_phone: un.contact_phone,
      agent_name: un.assigned_to_name || 'Fila Aberta (Sem Atendente)',
      reason: `Contato aguarda resposta há ${un.waiting_minutes} min no canal ${un.channel_name}.`,
      excerpt: String(un.last_message || '').slice(0, 220),
    })
  }

  const topic_stats = Object.entries(topicCounters)
    .filter(([, v]) => v.count > 0)
    .map(([topic, v]) => ({
      topic,
      count: v.count,
      percentage: totalConvs > 0 ? Math.min(100, Math.round((v.count / totalConvs) * 100)) : 0,
      summary: `${v.count} conversa(s) trataram deste tema no período analisado.`,
      sentiment: v.sentiment,
    }))
    .sort((a, b) => b.count - a.count)

  if (topic_stats.length === 0 && totalConvs > 0) {
    topic_stats.push({
      topic: '💬 Comunicações Gerais & Acompanhamento Diário',
      count: totalConvs,
      percentage: 100,
      summary: `${totalConvs} conversa(s) operacionais registradas no canal.`,
      sentiment: 'Normal',
    })
  }

  const unansweredPenalty = Math.min(40, unansweredList.length * 6)
  const riskPenalty = Math.min(25, risks.filter(r => r.type !== 'Sem Resposta / Aguardando Retorno').length * 5)
  const quality_score = Math.max(35, 100 - unansweredPenalty - riskPenalty)

  const summaryText =
    `Relatório de Auditoria Diária (${targetDate}) — Canal: ${channelLabel} (${getProfileLabel(profile)}).\n\n` +
    `Foram auditadas ${totalConvs} conversas no período. ` +
    (unansweredList.length > 0
      ? `Atenção: existem ${unansweredList.length} conversa(s) aguardando resposta da equipe que precisam de retorno imediato no início do expediente. `
      : `Todas as conversas ativas do dia receberam acompanhamento da equipe. `) +
    (topic_stats.length > 0
      ? `Os assuntos predominantes foram: ${topic_stats.slice(0, 3).map(t => `${t.topic} (${t.count})`).join(', ')}.`
      : '')

  const action_recommendations = [
    ...(unansweredList.length > 0
      ? [
          {
            sector: profile === 'hiring' ? 'CONTRATACAO' : profile === 'clients' ? 'COMERCIAL' : 'RH',
            priority: 'high',
            recommendation: `Priorizar o retorno imediato das ${unansweredList.length} conversa(s) que ficaram sem resposta (${unansweredList
              .slice(0, 3)
              .map(u => u.contact_name)
              .join(', ')}).`,
          },
        ]
      : []),
    {
      sector: profile === 'hiring' ? 'CONTRATACAO' : profile === 'clients' ? 'COMERCIAL' : 'RH',
      priority: 'normal',
      recommendation:
        profile === 'hiring'
          ? 'Conferir candidatos com documentação ou link de contrato pendente de assinatura para acelerar o ingresso.'
          : profile === 'clients'
          ? 'Acompanhar solicitações de clientes e negociações abertas garantindo retorno comercial rápido.'
          : 'Revisar a empatia e clareza nas explicações de holerites, descontos e horas aos trabalhadores.',
    },
  ]

  return {
    summary: summaryText,
    quality_score,
    topic_stats,
    risks_detected: risks.slice(0, 12),
    action_recommendations,
  }
}

export async function runAuditForChannelOrAll(params: {
  supabase: any
  targetDate: string
  channelId: string | null
  customPrompt?: string
  force?: boolean
  createTask?: boolean
  overrideRecipients?: string[]
  overrideDepartmentCode?: string
  overrideProfile?: AuditProfileType
}) {
  const {
    supabase,
    targetDate,
    channelId,
    customPrompt = '',
    force = false,
    createTask = false,
    overrideRecipients,
    overrideDepartmentCode,
    overrideProfile,
  } = params

  // 1. Buscar canal e config de auditoria
  let channelObj: any = null
  if (channelId) {
    const { data: ch } = await supabase
      .from('chat_channels')
      .select('*')
      .eq('id', channelId)
      .maybeSingle()
    channelObj = ch
  }

  const { data: auditConfigs } = await supabase
    .from('chat_audit_configs')
    .select('*')

  const specificConfig = channelId
    ? (auditConfigs || []).find((c: any) => c.channel_id === channelId)
    : null
  const globalConfig = (auditConfigs || []).find((c: any) => c.channel_id === null)
  const activeConfig = specificConfig || globalConfig

  const profile: AuditProfileType = inferAuditProfile(
    channelObj,
    overrideProfile || specificConfig?.audit_profile || globalConfig?.audit_profile
  )
  const channelLabel = channelObj
    ? channelObj.display_label || `${channelObj.company_name || ''} • ${channelObj.name}`.replace(/^ • /, '')
    : 'Todos os Canais (Consolidado Geral)'

  // 2. Verificar se já existe resumo para a data/canal
  let q = supabase
    .from('chat_daily_summaries')
    .select('*')
    .eq('summary_date', targetDate)

  if (channelId) q = q.eq('channel_id', channelId)
  else q = q.is('channel_id', null)

  const { data: existingList } = await q.order('created_at', { ascending: false }).limit(1)
  const existingSummary = existingList?.[0] || null

  if (existingSummary && existingSummary.status === 'completed' && !force && !createTask) {
    return {
      success: true,
      alreadyCompleted: true,
      summary: existingSummary,
    }
  }

  let summaryId = existingSummary?.id
  if (!summaryId) {
    const { data: newSum } = await supabase
      .from('chat_daily_summaries')
      .insert({
        summary_date: targetDate,
        status: 'processing',
        channel_id: channelId,
        channel_name: channelLabel,
        audit_profile: profile,
      })
      .select('id')
      .single()
    summaryId = newSum?.id
  } else {
    await supabase
      .from('chat_daily_summaries')
      .update({
        status: 'processing',
        channel_name: channelLabel,
        audit_profile: profile,
      })
      .eq('id', summaryId)
  }

  // 3. Buscar mensagens do dia
  const startOfDay = new Date(`${targetDate}T00:00:00.000Z`).toISOString()
  const endOfDay = new Date(`${targetDate}T23:59:59.999Z`).toISOString()

  let messageQuery = supabase
    .from('chat_messages')
    .select(`
      id,
      conversation_id,
      content,
      direction,
      sender_name,
      sender_department,
      created_at,
      message_type,
      status,
      chat_conversations!inner(
        id,
        channel_id,
        contact_name,
        contact_phone,
        status,
        assigned_to,
        assigned_to_name,
        worker_company_name,
        worker_client_name,
        last_message_at,
        last_message_direction
      )
    `)
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay)
    .neq('message_type', 'internal_note')
    .neq('message_type', 'system_block')
    .order('created_at', { ascending: true })

  if (channelId) {
    messageQuery = messageQuery.eq('chat_conversations.channel_id', channelId)
  }

  const { data: messages, error: msgError } = await messageQuery

  // Buscar também nomes dos canais para exibir nas conversas sem resposta
  const { data: allChannels } = await supabase
    .from('chat_channels')
    .select('id, name, display_label, company_name')
  const channelNameMap = new Map<string, string>()
  ;(allChannels || []).forEach((ch: any) => {
    channelNameMap.set(ch.id, ch.display_label || ch.company_name || ch.name)
  })

  if (msgError || !messages || messages.length === 0) {
    const emptyPayload = {
      total_conversations: 0,
      total_messages: 0,
      inbound_messages: 0,
      outbound_messages: 0,
      unanswered_count: 0,
      quality_score: 100,
      summary: `Nenhuma mensagem registrada em ${targetDate} para ${channelLabel}.`,
      topic_stats: [],
      unanswered_conversations: [],
      risks_detected: [],
      agent_performance: [],
      action_recommendations: [],
      status: 'completed',
      updated_at: new Date().toISOString(),
    }
    await supabase.from('chat_daily_summaries').update(emptyPayload).eq('id', summaryId)
    return {
      success: true,
      empty: true,
      summary: { id: summaryId, summary_date: targetDate, channel_id: channelId, channel_name: channelLabel, ...emptyPayload },
    }
  }

  // 4. Agrupar por conversa e calcular métricas exatas (incluindo Sem Resposta e Performance por Atendente)
  const convMap = new Map<string, { conv: any; msgs: any[] }>()
  let inboundCount = 0
  let outboundCount = 0
  const agentMap = new Map<string, { agent_name: string; convIds: Set<string>; messages_sent: number }>()

  for (const m of messages) {
    const convObj = Array.isArray(m.chat_conversations) ? m.chat_conversations[0] : m.chat_conversations
    const convId = m.conversation_id
    if (!convMap.has(convId)) {
      convMap.set(convId, { conv: convObj || { id: convId }, msgs: [] })
    }
    convMap.get(convId)!.msgs.push(m)

    if (m.direction === 'inbound') {
      inboundCount++
    } else if (m.direction === 'outbound') {
      outboundCount++
      const agName = (m.sender_name || convObj?.assigned_to_name || 'Equipe MCS').trim()
      if (!agentMap.has(agName)) {
        agentMap.set(agName, { agent_name: agName, convIds: new Set(), messages_sent: 0 })
      }
      const ag = agentMap.get(agName)!
      ag.convIds.add(convId)
      ag.messages_sent++
    }
  }

  const unansweredList: any[] = []
  const nowMs = Date.now()

  for (const [convId, { conv, msgs }] of convMap.entries()) {
    const lastMsg = msgs[msgs.length - 1]
    // Se a última mensagem do dia na conversa foi enviada pelo trabalhador/cliente (inbound), ficou sem resposta!
    if (lastMsg && lastMsg.direction === 'inbound') {
      const msgTime = new Date(lastMsg.created_at).getTime()
      const waitingMinutes = Math.max(1, Math.round((nowMs - msgTime) / 60000))
      unansweredList.push({
        conversation_id: convId,
        contact_name: conv.contact_name || conv.contact_phone || 'Trabalhador',
        contact_phone: conv.contact_phone || '',
        channel_id: conv.channel_id,
        channel_name: channelNameMap.get(conv.channel_id) || channelLabel,
        worker_company_name: conv.worker_company_name || null,
        worker_client_name: conv.worker_client_name || null,
        last_message: String(lastMsg.content || '🎵 Áudio / Mídia').slice(0, 200),
        last_message_at: lastMsg.created_at,
        waiting_minutes: waitingMinutes,
        assigned_to_name: conv.assigned_to_name || 'Fila Aberta (Sem Atendente)',
      })
    }
  }

  // Ordenar sem resposta pelas mais antigas/críticas
  unansweredList.sort((a, b) => b.waiting_minutes - a.waiting_minutes)

  const agentPerformanceList = Array.from(agentMap.values())
    .map(ag => ({
      agent_name: ag.agent_name,
      conversations_handled: ag.convIds.size,
      messages_sent: ag.messages_sent,
      evaluation: `${ag.convIds.size} conversa(s) atendida(s) • ${ag.messages_sent} msg(s) enviadas`,
      score: 90,
    }))
    .sort((a, b) => b.conversations_handled - a.conversations_handled)

  // 5. Montar transcrição enxuta e estruturada para a IA
  let transcriptBlock = ''
  for (const [convId, { conv, msgs }] of convMap.entries()) {
    const cName = conv.contact_name || conv.contact_phone || 'Contato'
    const chTitle = channelNameMap.get(conv.channel_id) || channelLabel
    const lastDir = msgs[msgs.length - 1]?.direction === 'inbound' ? ' [⚠️ FICOU SEM RESPOSTA]' : ' [✅ RESPONDIDA]'
    transcriptBlock += `\n--- CONVERSA (ID: ${convId}) | Contato: ${cName} (+${conv.contact_phone || ''}) | Canal: ${chTitle} | Atendente: ${conv.assigned_to_name || 'Fila'}${lastDir} ---\n`
    for (const m of msgs.slice(-25)) {
      if (!m.content) continue
      const author = m.direction === 'inbound' ? `Contato (${cName})` : `Atendente (${m.sender_name || 'Equipe'})`
      const timeStr = new Date(m.created_at).toISOString().slice(11, 16)
      transcriptBlock += `[${timeStr}] ${author}: ${String(m.content).slice(0, 350)}\n`
    }
  }

  if (transcriptBlock.length > 180000) {
    transcriptBlock = transcriptBlock.substring(0, 180000) + '\n...[TRUNCADO]'
  }

  const effectiveInstructions =
    customPrompt ||
    specificConfig?.custom_instructions ||
    globalConfig?.custom_instructions ||
    ''

  let aiResult = buildHeuristicAudit({
    targetDate,
    channelLabel,
    profile,
    convList: Array.from(convMap.values()),
    unansweredList,
    agentStats: agentPerformanceList,
  })

  if (process.env.OPENAI_API_KEY) {
    try {
      const profileGuidance =
        profile === 'hiring'
          ? `FOCO ESPECIAL (CANAL DE CONTRATAÇÃO / RECRUTAMENTO):
- Avalie a velocidade de resposta aos candidatos, coleta de documentos (NIE, Passaporte, NISS, IBAN), envio e assinatura de contratos.
- Aponte candidatos que ficaram esperando resposta ou que tiveram dúvidas sobre vaga/alojamento/tarifa.`
          : profile === 'clients'
          ? `FOCO ESPECIAL (CANAL COMERCIAL & MANUTENÇÃO DE CLIENTES):
- Avalie negociações comerciais em andamento, solicitações de novos pedidos/orçamentos, reclamações de clientes sobre trabalhadores em obra e pedidos de substituição (reemplazo).`
          : `FOCO ESPECIAL (CANAL OPERACIONAL RH & ATENÇÃO AO TRABALHADOR):
- O trabalhador é o maior patrimônio da empresa. Meça a qualidade, empatia, educação e resolutividade dos atendentes.
- Fique muito atento às reclamações de pagamento, descontos em holerite/nómina (especialmente após o dia 15), adiantamentos, horas trabalhadas e alojamento.
- Identifique trabalhadores muito nervosos, exaltados ou desmotivados e como o RH conduziu a situação.`

      const systemPrompt = `Você é um Diretor de Operações e Auditor Sênior de Qualidade do Grupo MCS.
Analise as conversas de WhatsApp do dia ${targetDate} no canal "${channelLabel}" (${getProfileLabel(profile)}).
Responda SEMPRE em Português claro, executivo e bem estruturado.

${profileGuidance}

Estatísticas exatas já apuradas pelo sistema:
- Total de conversas ativas: ${convMap.size}
- Total de mensagens: ${messages.length} (${inboundCount} recebidas, ${outboundCount} enviadas)
- Conversas que terminaram o dia SEM RESPOSTA da equipe: ${unansweredList.length}
${effectiveInstructions ? `\nINSTRUÇÕES ESPECÍFICAS DA DIRETORIA:\n${effectiveInstructions}` : ''}`

      const { object: gptObj } = await generateObject({
        model: openai('gpt-4o-mini'),
        system: systemPrompt,
        prompt: `Analise as transcrições abaixo e gere o relatório estruturado:\n\n${transcriptBlock}`,
        schema: z.object({
          summary: z
            .string()
            .describe('Resumo executivo completo (3 a 4 parágrafos) detalhando o que ocorreu no canal, principais demandas, qualidade do atendimento prestado pela equipe e pontos críticos.'),
          quality_score: z
            .number()
            .describe('Nota de 0 a 100 avaliando a qualidade, empatia, clareza e tempo de resposta do setor neste canal.'),
          topic_stats: z
            .array(
              z.object({
                topic: z.string().describe('Nome do assunto (ex: Pagamento / Descontos no Holerite, Controle de Horas, Contratação / Documentos, Alojamento, Negociação Comercial)'),
                count: z.number().describe('Quantidade aproximada de conversas sobre este assunto'),
                percentage: z.number().describe('Percentual de 0 a 100'),
                summary: z.string().describe('Resumo do que foi comentado neste assunto e como o setor respondeu'),
                sentiment: z.string().describe('Clima predominante: Positivo, Neutro, Atenção ou Crítico'),
              })
            )
            .describe('Lista dos assuntos falados no dia com resumo por assunto.'),
          risks_detected: z
            .array(
              z.object({
                type: z.string().describe('Categoria: Trabalhador Nervoso/Exaltado, Reclamação de Holerite/Desconto, Reclamação de Cliente, Negociação Comercial, Falha de Atendimento, Sem Resposta ou Acidente/Legal'),
                severity: z.enum(['high', 'medium', 'low']),
                conversation_id: z.string().describe('O UUID exato da conversa informado no cabeçalho CONVERSA (ID: ...)'),
                contact_name: z.string().describe('Nome do trabalhador ou cliente'),
                contact_phone: z.string().describe('Telefone do contato'),
                agent_name: z.string().describe('Nome do atendente responsável'),
                reason: z.string().describe('Explicação clara do ponto-chave ou problema identificado'),
                excerpt: z.string().describe('Trecho real da conversa que evidencia o ponto'),
              })
            )
            .describe('Pontos-chave, trabalhadores nervosos, reclamações de desconto/holerite, clientes reclamando ou falhas de atendimento.'),
          action_recommendations: z
            .array(
              z.object({
                sector: z.string().describe('Setor responsável (ex: RH, CONTRATACAO, COMERCIAL, LOGISTICA, FINANCEIRO, OPERACOES)'),
                priority: z.enum(['urgent', 'high', 'normal']),
                recommendation: z.string().describe('Ação prática recomendada para melhoria do setor ou resolução no dia seguinte'),
              })
            )
            .describe('Lista de 2 a 5 ações práticas de melhoria para o gestor cobrar da equipe.'),
        }),
        temperature: 0.15,
      })

      aiResult = {
        summary: gptObj.summary,
        quality_score: Math.max(0, Math.min(100, Math.round(gptObj.quality_score))),
        topic_stats: gptObj.topic_stats,
        risks_detected: gptObj.risks_detected,
        action_recommendations: gptObj.action_recommendations,
      }
    } catch (aiErr: any) {
      console.warn('[daily-summary] OpenAI fallback to heuristic analyzer:', aiErr?.message || aiErr)
    }
  }

  // 6. Se createTask === true (ou configurado na auditoria automática), criar Tarefa na Super Gaveta Operacional (core_operacoes.solicitud_tareas)
  const recipientIds: string[] =
    overrideRecipients && overrideRecipients.length > 0
      ? overrideRecipients
      : activeConfig?.recipient_user_ids && activeConfig.recipient_user_ids.length > 0
      ? activeConfig.recipient_user_ids
      : ['86ca2db1-07fd-42d9-a62c-739f091da519'] // Kawan Kotrik padrão

  const targetDeptCode =
    overrideDepartmentCode ||
    activeConfig?.target_department_code ||
    (profile === 'hiring' ? 'CONTRATACAO' : profile === 'clients' ? 'COMERCIAL' : 'OPERACOES')

  const generatedTasksLog: any[] = Array.isArray(existingSummary?.tasks_generated)
    ? [...existingSummary.tasks_generated]
    : []

  if (createTask && recipientIds.length > 0) {
    const { data: recUsers } = await supabase
      .from('mcs_users')
      .select('id, email, display_name, name')
      .in('id', recipientIds)

    const topTopicsStr = (aiResult.topic_stats || [])
      .slice(0, 4)
      .map((t: any) => `• ${t.topic}: ${t.count || ''} (${t.percentage}%) — ${t.summary || ''}`)
      .join('\n')

    const topRisksStr = (aiResult.risks_detected || [])
      .slice(0, 4)
      .map((r: any) => `• [${r.type}] ${r.contact_name}: ${r.reason}`)
      .join('\n')

    const unansweredStr =
      unansweredList.length > 0
        ? `\n⚠️ CONVERSAS SEM RESPOSTA (${unansweredList.length}):\n` +
          unansweredList
            .slice(0, 5)
            .map(u => `• ${u.contact_name} (+${u.contact_phone}) — aguardando há ${u.waiting_minutes} min: "${u.last_message}"`)
            .join('\n')
        : '\n✅ Nenhuma conversa ficou sem resposta.'

    const actionsStr = (aiResult.action_recommendations || [])
      .map((a: any) => `• [${a.sector}] ${a.recommendation}`)
      .join('\n')

    const taskTitle = `📊 [Auditoria WhatsApp] ${channelLabel} (${targetDate}) — Nota ${aiResult.quality_score}/100 • ${unansweredList.length} s/ resposta`
    const taskDescription =
      `RESUMO DIÁRIO DE AUDITORIA (${getProfileLabel(profile)})\n` +
      `📊 Volume: ${convMap.size} conversas | ${messages.length} mensagens (${inboundCount} recebidas / ${outboundCount} enviadas) | Qualidade: ${aiResult.quality_score}/100\n\n` +
      `📝 VISÃO GERAL:\n${aiResult.summary}\n\n` +
      (topTopicsStr ? `📌 PRINCIPAIS ASSUNTOS:\n${topTopicsStr}\n` : '') +
      unansweredStr +
      (topRisksStr ? `\n\n🚨 PONTOS DE ATENÇÃO / TRABALHADORES OU CLIENTES CRÍTICOS:\n${topRisksStr}` : '') +
      (actionsStr ? `\n\n🎯 PLANO DE AÇÃO RECOMENDADO:\n${actionsStr}` : '')

    const auditUrl = `https://mcs-chat.vercel.app/inbox/admin/audit?date=${targetDate}${channelId ? `&channelId=${channelId}` : ''}`

    for (const u of recUsers || []) {
      try {
        const { data: rpcRes } = await supabase
          .schema('core_operacoes')
          .rpc('criar_tarefa_direta', {
            payload: {
              department_code: targetDeptCode,
              title: taskTitle,
              description: taskDescription,
              priority: unansweredList.length > 0 || (aiResult.risks_detected || []).length > 0 ? 'high' : 'normal',
              assigned_to: u.id,
              assigned_to_email: u.email,
              assigned_to_name: u.display_name || u.name || u.email,
              created_by_name: 'Auditor IA (MCS-Chat)',
              task_source: 'chat',
              metadata: {
                audit_summary_id: summaryId,
                channel_id: channelId,
                channel_name: channelLabel,
                summary_date: targetDate,
                audit_url: auditUrl,
                quality_score: aiResult.quality_score,
                unanswered_count: unansweredList.length,
              },
            },
          })

        generatedTasksLog.push({
          task_id: rpcRes?.task_id || null,
          recipient_id: u.id,
          recipient_name: u.display_name || u.name || u.email,
          recipient_email: u.email,
          created_at: new Date().toISOString(),
        })
      } catch (taskErr: any) {
        console.error('[daily-summary] Error creating task in solicitud_tareas:', taskErr?.message || taskErr)
      }
    }
  }

  const finalPayload = {
    channel_name: channelLabel,
    audit_profile: profile,
    total_conversations: convMap.size,
    total_messages: messages.length,
    inbound_messages: inboundCount,
    outbound_messages: outboundCount,
    unanswered_count: unansweredList.length,
    quality_score: aiResult.quality_score,
    summary: aiResult.summary,
    topic_stats: aiResult.topic_stats,
    unanswered_conversations: unansweredList,
    risks_detected: aiResult.risks_detected,
    agent_performance: agentPerformanceList,
    action_recommendations: aiResult.action_recommendations,
    tasks_generated: generatedTasksLog,
    status: 'completed',
    updated_at: new Date().toISOString(),
  }

  await supabase.from('chat_daily_summaries').update(finalPayload).eq('id', summaryId)

  return {
    success: true,
    summary: {
      id: summaryId,
      summary_date: targetDate,
      channel_id: channelId,
      ...finalPayload,
    },
  }
}

export async function POST(req: Request) {
  try {
    const reqData = await req.json().catch(() => ({}))
    const targetDate = reqData.date || new Date().toISOString().split('T')[0]
    const mode = reqData.mode || 'single' // 'single' | 'run_all_channels' | 'save_config'
    const supabase = createAdminClient()

    if (mode === 'save_config') {
      const {
        channelId = null,
        enabled = true,
        auditProfile = 'workers',
        scheduleTime = '00:00',
        autoCreateTasks = true,
        recipientUserIds = [],
        targetDepartmentCode = 'OPERACOES',
        customInstructions = '',
      } = reqData

      let existingCfgQuery = supabase.from('chat_audit_configs').select('id')
      if (channelId) existingCfgQuery = existingCfgQuery.eq('channel_id', channelId)
      else existingCfgQuery = existingCfgQuery.is('channel_id', null)
      const { data: existingCfg } = await existingCfgQuery.maybeSingle()

      const payload = {
        channel_id: channelId || null,
        enabled: Boolean(enabled),
        audit_profile: auditProfile,
        schedule_time: scheduleTime,
        auto_create_tasks: Boolean(autoCreateTasks),
        recipient_user_ids: recipientUserIds,
        target_department_code: targetDepartmentCode,
        custom_instructions: customInstructions,
        updated_at: new Date().toISOString(),
      }

      if (existingCfg?.id) {
        await supabase.from('chat_audit_configs').update(payload).eq('id', existingCfg.id)
      } else {
        await supabase.from('chat_audit_configs').insert(payload)
      }

      return NextResponse.json({ success: true })
    }

    if (mode === 'run_all_channels') {
      const { data: activeChannels } = await supabase
        .from('chat_channels')
        .select('id, name, display_label, company_name, channel_type')
        .eq('is_active', true)

      const results = []
      // 1. Auditar cada canal individualmente
      for (const ch of activeChannels || []) {
        const res = await runAuditForChannelOrAll({
          supabase,
          targetDate,
          channelId: ch.id,
          customPrompt: reqData.customPrompt,
          force: Boolean(reqData.force),
          createTask: Boolean(reqData.createTask ?? true),
          overrideRecipients: reqData.recipientUserIds,
          overrideDepartmentCode: reqData.targetDepartmentCode,
        })
        if (!res.empty) {
          results.push(res.summary)
        }
      }

      // 2. Gerar também o consolidado geral de todos os canais
      const consolidated = await runAuditForChannelOrAll({
        supabase,
        targetDate,
        channelId: null,
        customPrompt: reqData.customPrompt,
        force: Boolean(reqData.force),
        createTask: Boolean(reqData.createTask && results.length === 0),
        overrideRecipients: reqData.recipientUserIds,
        overrideDepartmentCode: reqData.targetDepartmentCode,
      })

      return NextResponse.json({
        success: true,
        auditedChannelsCount: results.length,
        summaries: results,
        consolidated: consolidated.summary,
      })
    }

    // Modo 'single' (um canal específico ou 'all' = null)
    const channelId = reqData.channelId && reqData.channelId !== 'all' ? reqData.channelId : null
    const result = await runAuditForChannelOrAll({
      supabase,
      targetDate,
      channelId,
      customPrompt: reqData.customPrompt,
      force: Boolean(reqData.force ?? true),
      createTask: Boolean(reqData.createTask),
      overrideRecipients: reqData.recipientUserIds,
      overrideDepartmentCode: reqData.targetDepartmentCode,
      overrideProfile: reqData.auditProfile,
    })

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('Daily summary failed:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
