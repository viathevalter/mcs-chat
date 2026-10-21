import { supabase } from '@/lib/supabase/client'

export interface TagColorOption {
  name: string
  hex: string
  darkText?: boolean
}

export interface QuickTagSuggestion {
  name: string
  color: string
  category: 'rh' | 'financeiro' | 'operacoes' | 'clientes' | 'geral'
}

export const MCS_QUICK_TAGS: QuickTagSuggestion[] = [
  { name: 'Horário / Ponto', color: '#16a34a', category: 'operacoes' },
  { name: 'Seguridade Social', color: '#2563eb', category: 'rh' },
  { name: 'Nómina / Salário', color: '#7c3aed', category: 'financeiro' },
  { name: 'Adiantamento', color: '#f97316', category: 'financeiro' },
  { name: 'Contrato / Assinatura', color: '#0891b2', category: 'rh' },
  { name: 'Docs Pendentes', color: '#eab308', category: 'rh' },
  { name: 'Falta / Atestado', color: '#e11d48', category: 'rh' },
  { name: 'Alojamento / Coche', color: '#854d0e', category: 'operacoes' },
  { name: 'EPI / Prevenção', color: '#0d9488', category: 'operacoes' },
  { name: 'Cliente / Obra', color: '#4f46e5', category: 'clientes' },
  { name: 'Aviso Prévio / Baixa', color: '#9f1239', category: 'rh' },
  { name: 'Prioridade', color: '#ef4444', category: 'geral' },
]

export const CRM_MAIN_COLORS: TagColorOption[] = [
  { name: 'Cinza', hex: '#4b5563' },
  { name: 'Vermelho', hex: '#ef4444' },
  { name: 'Laranja', hex: '#f97316' },
  { name: 'Amarelo', hex: '#eab308' },
  { name: 'Verde', hex: '#16a34a' },
  { name: 'Turquesa', hex: '#06b6d4' },
  { name: 'Azul', hex: '#3b82f6' },
  { name: 'Roxo', hex: '#8b5cf6' },
]

export const CRM_MORE_COLORS: TagColorOption[] = [
  { name: 'Rosa', hex: '#f43f5e' },
  { name: 'Rosa claro', hex: '#fbcfe8', darkText: true },
  { name: 'Vinho', hex: '#881337' },
  { name: 'Lilás', hex: '#c084fc' },
  { name: 'Índigo', hex: '#6366f1' },
  { name: 'Azul claro', hex: '#bfdbfe', darkText: true },
  { name: 'Ciano', hex: '#22d3ee', darkText: true },
  { name: 'Azul petr.', hex: '#0369a1' },
  { name: 'Verde cl.', hex: '#bbf7d0', darkText: true },
  { name: 'Menta', hex: '#34d399', darkText: true },
  { name: 'Oliva', hex: '#84cc16' },
  { name: 'Limão', hex: '#fef08a', darkText: true },
  { name: 'Âmbar', hex: '#f59e0b' },
  { name: 'Marrom', hex: '#78350f' },
  { name: 'Bege', hex: '#e7e5e4', darkText: true },
  { name: 'Cinza cl.', hex: '#cbd5e1', darkText: true },
]

export function isLightTagColor(hex?: string): boolean {
  if (!hex) return false
  const found = [...CRM_MAIN_COLORS, ...CRM_MORE_COLORS].find(
    (c) => c.hex.toLowerCase() === hex.toLowerCase()
  )
  return Boolean(found?.darkText)
}

export interface TransferSpecialty {
  id: string
  label: string
  shortLabel: string
  tagName: string
  tagColor: string
  description: string
}

export const MCS_TRANSFER_SPECIALTIES: TransferSpecialty[] = [
  {
    id: 'horario_ponto',
    label: '⏱️ Horário de Trabalho / Ponto',
    shortLabel: 'Horário / Ponto',
    tagName: 'Horário / Ponto',
    tagColor: '#16a34a',
    description: 'Controle de horas, folha de ponto, turno ou obra',
  },
  {
    id: 'seguridade',
    label: '🛡️ Seguridade Social (Alta / Baixa)',
    shortLabel: 'Seguridade Social',
    tagName: 'Seguridade Social',
    tagColor: '#2563eb',
    description: 'Alta, baixa, TA.2 ou documentação de Seguridade Social',
  },
  {
    id: 'nomina',
    label: '💰 Nómina / Salário / Pagamento',
    shortLabel: 'Nómina / Salário',
    tagName: 'Nómina / Salário',
    tagColor: '#7c3aed',
    description: 'Dúvidas de folha, recibo de salário, horas pagas ou IBAN',
  },
  {
    id: 'adiantamento',
    label: '💸 Adiantamento (Anticipo)',
    shortLabel: 'Adiantamento',
    tagName: 'Adiantamento',
    tagColor: '#f97316',
    description: 'Solicitação ou aprovação de adiantamento a trabalhador',
  },
  {
    id: 'contrato_docs',
    label: '📄 Contrato / Documentação RH',
    shortLabel: 'Contrato / Docs',
    tagName: 'Contrato / Assinatura',
    tagColor: '#0891b2',
    description: 'Assinatura de contrato, envio de NIE/DNI ou documentos',
  },
  {
    id: 'falta_baixa',
    label: '🩺 Falta / Atestado / Aviso Prévio',
    shortLabel: 'Falta / Baixa',
    tagName: 'Falta / Atestado',
    tagColor: '#e11d48',
    description: 'Ausência, baixa médica ou desligamento',
  },
  {
    id: 'alojamento_frota',
    label: '🚗 Alojamento / Transporte / Frota',
    shortLabel: 'Alojamento / Frota',
    tagName: 'Alojamento / Coche',
    tagColor: '#854d0e',
    description: 'Viatura, combustível, alojamento ou deslocamento',
  },
  {
    id: 'epi_prevencao',
    label: '🦺 EPI / Prevenção (PRL)',
    shortLabel: 'EPI / Prevenção',
    tagName: 'EPI / Prevenção',
    tagColor: '#0d9488',
    description: 'Entrega de EPI, cursos PRL ou certificado médico',
  },
]

export async function executeConversationTransfer(params: {
  conversationId: string
  currentTags?: any[]
  targetDeptId?: string | null
  targetDeptName?: string | null
  targetUserId?: string | null
  targetUserName?: string | null
  senderUserId?: string | null
  senderUserName?: string | null
  specialtyId?: string | null
  reason?: string | null
  contactName?: string | null
  contactPhone?: string | null
}) {
  const {
    conversationId,
    currentTags = [],
    targetDeptId,
    targetDeptName,
    targetUserId,
    targetUserName,
    senderUserId,
    senderUserName,
    specialtyId,
    reason,
    contactName,
    contactPhone,
  } = params

  const specialty = MCS_TRANSFER_SPECIALTIES.find((s) => s.id === specialtyId) || null
  const nowIso = new Date().toISOString()

  // Auto-attach specialty tag if selected and not already present
  let nextTags = Array.isArray(currentTags) ? [...currentTags] : []
  if (specialty) {
    const exists = nextTags.some(
      (t: any) => (t?.name || '').toLowerCase() === specialty.tagName.toLowerCase()
    )
    if (!exists) {
      nextTags.push({
        id: `spec_${Date.now()}`,
        name: specialty.tagName,
        color: specialty.tagColor,
      })
    }
  }

  const targetParts: string[] = []
  if (targetUserName) targetParts.push(`👤 ${targetUserName}`)
  if (targetDeptName) targetParts.push(`📂 ${targetDeptName}`)
  const targetSummary = targetParts.length > 0 ? targetParts.join(' • ') : 'Fila Geral'

  const fromLabel = senderUserName ? ` por ${senderUserName}` : ''
  const specLabel = specialty ? ` • Assunto: [${specialty.shortLabel}]` : ''
  const reasonLabel = reason?.trim() ? ` — "${reason.trim()}"` : ''
  const blockContent = `🔄 CONVERSA TRANSFERIDA${fromLabel} PARA: ${targetSummary}${specLabel}${reasonLabel}`

  const { error: convErr } = await supabase
    .from('chat_conversations')
    .update({
      department_id: targetDeptId || null,
      assigned_to: targetUserId || null,
      assigned_to_name: targetUserName || null,
      transferred_by_id: senderUserId || null,
      transferred_by_name: senderUserName || 'Equipe MCS',
      transfer_note: reason?.trim() || null,
      transfer_category: specialty?.shortLabel || null,
      transferred_at: nowIso,
      tags: nextTags,
      status: 'open',
      unread_count: 1,
      last_message_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', conversationId)

  if (convErr) throw convErr

  // Insert timeline system_block
  await supabase.from('chat_messages').insert({
    conversation_id: conversationId,
    direction: 'outbound',
    sender_name: senderUserName || targetUserName || 'Transferência MCS',
    sender_department: targetDeptName || 'Atendimento',
    message_type: 'system_block',
    content: blockContent,
    status: 'delivered',
  })

  // Create notification in chat_notifications if transferred to a specific user (or to all users in target department if no specific user selected)
  if (targetUserId) {
    await supabase.from('chat_notifications').insert({
      recipient_user_id: targetUserId,
      recipient_name: targetUserName || null,
      sender_user_id: senderUserId || null,
      sender_name: senderUserName || 'Colega MCS',
      department_id: targetDeptId || null,
      department_name: targetDeptName || null,
      conversation_id: conversationId,
      contact_name: contactName || 'Trabalhador',
      contact_phone: contactPhone || null,
      category: specialty?.shortLabel || 'Atendimento',
      reason: reason?.trim() || null,
      is_read: false,
    })
  } else if (targetDeptId) {
    const { data: deptUsers } = await supabase
      .from('mcs_users')
      .select('id, display_name, name')
      .eq('department_id', targetDeptId)
      .eq('active', true)

    if (deptUsers && deptUsers.length > 0) {
      const rows = deptUsers
        .filter((u) => u.id !== senderUserId)
        .map((u) => ({
          recipient_user_id: u.id,
          recipient_name: u.display_name || u.name || null,
          sender_user_id: senderUserId || null,
          sender_name: senderUserName || 'Colega MCS',
          department_id: targetDeptId,
          department_name: targetDeptName || null,
          conversation_id: conversationId,
          contact_name: contactName || 'Trabalhador',
          contact_phone: contactPhone || null,
          category: specialty?.shortLabel || 'Fila do Setor',
          reason: reason?.trim() || null,
          is_read: false,
        }))
      if (rows.length > 0) {
        await supabase.from('chat_notifications').insert(rows)
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mcs-chat-updated', { detail: { conversationId } }))
  }

  return {
    nextTags,
    targetSummary,
    specialtyLabel: specialty?.shortLabel || null,
  }
}
