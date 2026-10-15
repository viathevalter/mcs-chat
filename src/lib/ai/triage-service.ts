import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '@/lib/supabase/config'

export interface TriageResult {
  shouldReply: boolean
  replyText?: string
  shouldHandoff: boolean
  targetDepartmentId?: string
  targetDepartmentName?: string
  internalSummary?: string
  isUrgent?: boolean
}

export async function processAITriage(params: {
  channelId: string
  conversationId: string
  contactPhone: string
  contactName: string
  inboundText: string
  history: Array<{ direction: string; content: string }>
}): Promise<TriageResult> {
  const { channelId, conversationId, contactPhone, contactName, inboundText, history } = params

  const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
  )

  // 1. Fetch Channel, Company and AI Agent
  const { data: channel } = await supabase
    .from('chat_channels')
    .select('*, ai_agent:chat_ai_agents(*)')
    .eq('id', channelId)
    .single()

  const agent = channel?.ai_agent

  // 2. Fetch Worker Data from core_personal.workers
  let worker: any = null
  let companyName = channel?.company_name || 'MCS Group'

  const last8 = contactPhone.replace(/\D/g, '').slice(-8)
  if (last8.length >= 8) {
    const { data: wrks } = await supabase
      .schema('core_personal')
      .from('workers')
      .select('id, nome, documento, telefono, status_trabajador, contratante, cliente, cod_cliente, funcion, data_ingresso')
      .ilike('telefono', `%${last8}%`)
      .limit(1)

    if (wrks && wrks.length > 0) {
      worker = wrks[0]
      if (worker.contratante) companyName = worker.contratante
      // Update conversation with worker_id
      await supabase
        .from('chat_conversations')
        .update({ worker_id: worker.id, contact_name: worker.nome })
        .eq('id', conversationId)
    }
  }

  // 3. Fetch Departments
  const { data: departments } = await supabase
    .from('mcs_departments')
    .select('id, name')
    .eq('active', true)

  const deptMap: Record<string, string> = {}
  departments?.forEach(d => {
    deptMap[d.name.toLowerCase()] = d.id
  })

  const rhDeptId = deptMap['recursos humanos'] || deptMap['rh'] || null
  const finDeptId = deptMap['financeiro'] || null
  const logDeptId = deptMap['logística'] || deptMap['logistica'] || null
  const segDeptId = deptMap['segurança'] || deptMap['safetyprevi'] || rhDeptId

  const textLower = inboundText.toLowerCase()
  const today = new Date()
  const currentDay = today.getDate()
  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  const currentMonthName = monthNames[today.getMonth()]

  // 4. Quick Rule Evaluation

  // 🔴 Emergency / Acidente de Trabalho
  if (
    textLower.includes('acidente') ||
    textLower.includes('machuquei') ||
    textLower.includes('hospital') ||
    textLower.includes('urgente') ||
    textLower.includes('ambulancia') ||
    textLower.includes('emergencia') ||
    textLower.includes('emergência')
  ) {
    return {
      shouldReply: true,
      replyText: `🚨 Olá ${worker?.nome ? worker.nome.split(' ')[0] : contactName}! Identificamos uma situação de urgência. Por favor, mantenha a calma. Já acionamos imediatamente a equipe de Segurança e Recursos Humanos da ${companyName} para prestar todo o suporte necessário. Um responsável entrará em contato agora mesmo.`,
      shouldHandoff: true,
      targetDepartmentId: (segDeptId || rhDeptId) || undefined,
      targetDepartmentName: 'Segurança / Recursos Humanos',
      isUrgent: true,
      internalSummary: `🚨 ALERTA DE URGÊNCIA / ACIDENTE DE TRABALHO\n• Trabalhador: ${worker?.nome || contactName} (${worker?.status_trabajador || 'Status N/A'})\n• Empresa: ${companyName} | Cliente/Obra: ${worker?.cliente || 'Não informado'}\n• Mensagem: "${inboundText}"\n• Ação: Handoff Imediato com Prioridade Máxima.`
    }
  }

  // 💰 Adiantamento / Vales (Regra do dia 10)
  if (
    textLower.includes('adiantamento') ||
    textLower.includes('vale') ||
    textLower.includes('anticipo') ||
    textLower.includes('pedir vale') ||
    textLower.includes('solicitar adiantamento')
  ) {
    if (currentDay > 10) {
      // Expirado
      return {
        shouldReply: true,
        replyText: `Olá ${worker?.nome ? worker.nome.split(' ')[0] : contactName}! Informamos que o prazo para solicitação de adiantamentos/vales é do dia 01 ao dia 10 de cada mês.\n\nHoje é dia ${currentDay} de ${currentMonthName}, portanto o período para adiantamentos deste mês já foi encerrado. Caso necessite de uma tratativa excepcional com o Financeiro, estou transferindo você para a nossa equipe.`,
        shouldHandoff: true,
        targetDepartmentId: finDeptId || undefined,
        targetDepartmentName: 'Financeiro',
        isUrgent: false,
        internalSummary: `💰 SOLICITAÇÃO DE ADIANTAMENTO (FORA DO PRAZO - DIA ${currentDay})\n• Trabalhador: ${worker?.nome || contactName}\n• Empresa: ${companyName} | Obra: ${worker?.cliente || 'N/A'}\n• Mensagem: "${inboundText}"\n• Status da Regra: Prazo encerrado no dia 10. Transferido para análise excepcional do Financeiro.`
      }
    } else {
      // No prazo
      return {
        shouldReply: true,
        replyText: `Olá ${worker?.nome ? worker.nome.split(' ')[0] : contactName}! Estamos no período de solicitações de adiantamento (até dia 10). Já registrei sua solicitação e estou transferindo você para o departamento Financeiro da ${companyName} concluir o processamento.`,
        shouldHandoff: true,
        targetDepartmentId: finDeptId || undefined,
        targetDepartmentName: 'Financeiro',
        isUrgent: false,
        internalSummary: `💰 SOLICITAÇÃO DE ADIANTAMENTO (DENTRO DO PRAZO)\n• Trabalhador: ${worker?.nome || contactName}\n• Empresa: ${companyName} | Obra: ${worker?.cliente || 'N/A'}\n• Mensagem: "${inboundText}"\n• Ação: Aguardando conferência do Financeiro.`
      }
    }
  }

  // 📄 Holerite / Descontos / Pagamento
  if (
    textLower.includes('holerite') ||
    textLower.includes('recibo') ||
    textLower.includes('desconto') ||
    textLower.includes('salario') ||
    textLower.includes('salário') ||
    textLower.includes('nomina') ||
    textLower.includes('nómina') ||
    textLower.includes('comprovante')
  ) {
    return {
      shouldReply: true,
      replyText: `Olá ${worker?.nome ? worker.nome.split(' ')[0] : contactName}! Recebemos sua dúvida referente a pagamentos/holerite. Estou direcionando sua conversa diretamente para o departamento Financeiro da ${companyName}. Um atendente já vai te responder por aqui!`,
      shouldHandoff: true,
      targetDepartmentId: finDeptId || undefined,
      targetDepartmentName: 'Financeiro',
      isUrgent: false,
      internalSummary: `📄 DÚVIDA DE HOLERITE / PAGAMENTO\n• Trabalhador: ${worker?.nome || contactName}\n• Empresa: ${companyName} | Obra: ${worker?.cliente || 'N/A'}\n• Mensagem: "${inboundText}"\n• Ação: Transferido para fila do Financeiro.`
    }
  }

  // 🏠 Alojamento / Transporte / Carros
  if (
    textLower.includes('alojamento') ||
    textLower.includes('moradia') ||
    textLower.includes('apartamento') ||
    textLower.includes('carro') ||
    textLower.includes('coche') ||
    textLower.includes('van') ||
    textLower.includes('transporte') ||
    textLower.includes('multa')
  ) {
    return {
      shouldReply: true,
      replyText: `Olá ${worker?.nome ? worker.nome.split(' ')[0] : contactName}! Entendido. Estou transferindo seu atendimento para o departamento de Logística e Frotas da ${companyName} para verificar sua solicitação.`,
      shouldHandoff: true,
      targetDepartmentId: logDeptId || undefined,
      targetDepartmentName: 'Logística',
      isUrgent: false,
      internalSummary: `🚗 SOLICITAÇÃO DE LOGÍSTICA / ALOJAMENTO / FROTAS\n• Trabalhador: ${worker?.nome || contactName}\n• Empresa: ${companyName} | Obra: ${worker?.cliente || 'N/A'}\n• Mensagem: "${inboundText}"\n• Ação: Transferido para fila de Logística.`
    }
  }

  // 👥 Falar com Humano / Atendente / RH
  if (
    textLower.includes('humano') ||
    textLower.includes('atendente') ||
    textLower.includes('pessoa') ||
    textLower.includes('falar com alguem') ||
    textLower.includes('rh') ||
    textLower.includes('recursos humanos') ||
    textLower.includes('ferias') ||
    textLower.includes('férias') ||
    textLower.includes('atestado')
  ) {
    return {
      shouldReply: true,
      replyText: `Olá ${worker?.nome ? worker.nome.split(' ')[0] : contactName}! Transferi seu atendimento para um atendente humano da equipe de Recursos Humanos da ${companyName}. Por favor, aguarde um momento que você será atendido em breve!`,
      shouldHandoff: true,
      targetDepartmentId: rhDeptId || undefined,
      targetDepartmentName: 'Recursos Humanos',
      isUrgent: false,
      internalSummary: `👥 SOLICITAÇÃO DE ATENDIMENTO HUMANO / RH\n• Trabalhador: ${worker?.nome || contactName}\n• Empresa: ${companyName} | Obra: ${worker?.cliente || 'N/A'}\n• Mensagem: "${inboundText}"\n• Ação: Handoff para atendente de RH.`
    }
  }

  // Default Greeting / Menu
  const workerFirstName = worker?.nome ? worker.nome.split(' ')[0] : contactName
  return {
    shouldReply: true,
    replyText: `Olá ${workerFirstName}! Seja bem-vindo(a) ao canal de atendimento da *${companyName}*.\n\nComo posso ajudar você hoje?\n\n1️⃣ *Holerites, Vales e Pagamentos*\n2️⃣ *Férias, Atestados e Recursos Humanos*\n3️⃣ *Alojamentos, Carros e Logística*\n4️⃣ *Falar com um Atendente Humano*\n\nPor favor, digite o número da opção ou descreva sua dúvida!`,
    shouldHandoff: false
  }
}
