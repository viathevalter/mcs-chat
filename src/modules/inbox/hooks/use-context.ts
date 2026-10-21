import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

export interface AllocationHistoryItem {
  id: string
  cliente_nome?: string
  empresa_nome?: string
  effective_date?: string
  new_value?: string
  comments?: string
}

export interface ConversationContextData {
  conversation: any
  worker: any
  company: any
  departments: any[]
  coreDepartments: any[]
  users: any[]
  workerTasks: any[]
  allocations: AllocationHistoryItem[]
}

export function useConversationContext(conversationId: string) {
  const [context, setContext] = useState<ConversationContextData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!conversationId) return

    async function load() {
      // 1. Fetch conversation
      const { data: conv } = await supabase
        .from('chat_conversations')
        .select('*, channel:chat_channels(*), department:mcs_departments(*)')
        .eq('id', conversationId)
        .single()
      
      if (!conv) { setLoading(false); return }

      let workerData: any = null
      let companyData: any = null
      let allocationHistory: AllocationHistoryItem[] = []

      // 2. Fetch Worker if worker_id is set or match by phone (movil) or name
      const workerCols = 'id, empresa_id, cod_colab, nome, movil, dni, nie, nif, pasaporte, status_trabajador, status_seguridad, contratante, cliente, cod_cliente, funcion, cod_funcion, data_ingresso, data_baixa, data_alta_seguridad, data_baixa_seguridad, foto'

      if (conv.worker_id) {
        const { data: wrk } = await supabase
          .schema('core_personal')
          .from('workers')
          .select(workerCols)
          .eq('id', conv.worker_id)
          .single()
        
        if (wrk) workerData = wrk
      } 
      
      if (!workerData && conv.contact_phone) {
        const cleanPhone = conv.contact_phone.replace(/\D/g, '')
        if (cleanPhone.length >= 8) {
          const last8 = cleanPhone.slice(-8)
          const { data: wrks } = await supabase
            .schema('core_personal')
            .from('workers')
            .select(workerCols)
            .ilike('movil', `%${last8}%`)
            .limit(1)
          
          if (wrks && wrks.length > 0) {
            workerData = wrks[0]
            await supabase.from('chat_conversations').update({ worker_id: workerData.id }).eq('id', conv.id)
          }
        }
      }

      // Fallback matching by name
      if (!workerData && conv.contact_name && conv.contact_name !== 'Contato WhatsApp') {
        const { data: wrksByName } = await supabase
          .schema('core_personal')
          .from('workers')
          .select(workerCols)
          .ilike('nome', `%${conv.contact_name.trim()}%`)
          .limit(1)

        if (wrksByName && wrksByName.length > 0) {
          workerData = wrksByName[0]
          await supabase.from('chat_conversations').update({ worker_id: workerData.id }).eq('id', conv.id)
        }
      }

      // 3. Fetch Allocation History if worker found
      if (workerData?.id) {
        const { data: history } = await supabase
          .schema('core_personal')
          .from('worker_status_history')
          .select('id, cliente_nome, empresa_nome, effective_date, new_value, comments')
          .eq('worker_id', workerData.id)
          .order('effective_date', { ascending: false })
          .limit(5)

        if (history) allocationHistory = history
      }

      // 4. Fetch Company from core_common.empresas
      const companyQueryName = workerData?.contratante || conv.channel?.company_name
      if (workerData?.empresa_id) {
        const { data: empById } = await supabase
          .schema('core_common')
          .from('empresas')
          .select('id, codigo, nome, trade_name, legal_name, invoice_logo_url, tax_id')
          .eq('id', workerData.empresa_id)
          .single()
        if (empById) companyData = empById
      }
      if (!companyData && companyQueryName) {
        const { data: emp } = await supabase
          .schema('core_common')
          .from('empresas')
          .select('id, codigo, nome, trade_name, legal_name, invoice_logo_url, tax_id')
          .or(`trade_name.ilike.%${companyQueryName}%,nome.ilike.%${companyQueryName}%`)
          .limit(1)
          .single()

        if (emp) companyData = emp
      }

      const resolvedEmpresaId = companyData?.id || workerData?.empresa_id || conv.company_id || null

      // 5. Fetch available active departments, users, department members, coreDepartments, and workerTasks
      const [deptsRes, usersRes, membersRes, coreDeptsRes, tasksRes] = await Promise.all([
        supabase
          .from('mcs_departments')
          .select('*')
          .eq('active', true)
          .order('name', { ascending: true }),
        supabase
          .from('mcs_users')
          .select('id, name, display_name, full_name, email, department_id, role, active')
          .order('display_name', { ascending: true }),
        supabase
          .from('mcs_department_members')
          .select('id, user_id, nombrecompleto, correoempresarial, department_id, active')
          .eq('active', true),
        resolvedEmpresaId
          ? supabase
              .schema('core_common')
              .from('departments')
              .select('id, name, code')
              .eq('empresa_id', resolvedEmpresaId)
              .eq('is_active', true)
              .order('name')
          : Promise.resolve({ data: [] as any[] }),
        workerData?.id
          ? supabase
              .schema('core_operacoes')
              .from('solicitud_tareas')
              .select('id, title, status, priority, due_date, scheduled_for, task_origin, department:departments(name, code)')
              .eq('worker_id', workerData.id)
              .neq('status', 'completed')
              .order('created_at', { ascending: false })
              .limit(10)
          : Promise.resolve({ data: [] as any[] })
      ])

      const deptMap = new Map<string, string>()
      for (const d of deptsRes.data || []) {
        deptMap.set(d.id, d.name)
      }

      const membersList = membersRes.data || []
      const unifiedUsers = (usersRes.data || [])
        .filter((u: any) => u.active !== false && u.email !== 'demo@mastercorp.local')
        .map((u: any) => {
          const linkedMember = membersList.find(
            (m: any) =>
              m.user_id === u.id ||
              (m.correoempresarial && u.email && m.correoempresarial.trim().toLowerCase() === u.email.trim().toLowerCase())
          )
          const resolvedName =
            (u.display_name && !u.display_name.includes('@') ? u.display_name.trim() : '') ||
            (linkedMember?.nombrecompleto ? linkedMember.nombrecompleto.trim() : '') ||
            (u.full_name ? u.full_name.trim() : '') ||
            (u.display_name ? u.display_name.trim() : '') ||
            (u.name ? u.name.trim() : '') ||
            u.email
          const resolvedDeptId = u.department_id || linkedMember?.department_id || null
          return {
            ...u,
            name: resolvedName,
            display_name: resolvedName,
            department_id: resolvedDeptId,
            department_name: resolvedDeptId ? deptMap.get(resolvedDeptId) || null : null
          }
        })
        .sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))

      // Standardize document field
      if (workerData) {
        workerData.documento = workerData.dni || workerData.nie || workerData.nif || workerData.pasaporte || null
      }

      setContext({
        conversation: conv,
        worker: workerData,
        company: companyData || { id: resolvedEmpresaId, trade_name: companyQueryName || 'MCS Group' },
        departments: deptsRes.data || [],
        coreDepartments: coreDeptsRes.data || [],
        users: unifiedUsers,
        workerTasks: tasksRes.data || [],
        allocations: allocationHistory
      })
      setLoading(false)
    }

    load()

    const subscription = supabase
      .channel(`public:chat_conversations:${conversationId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'chat_conversations',
        filter: `id=eq.${conversationId}`
      }, () => {
        load()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [conversationId])

  return { context, setContext, loading }
}
