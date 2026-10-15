"use client"
import { useState } from 'react'
import { 
  User, 
  Briefcase, 
  Building2, 
  Calendar, 
  FileText, 
  Bot, 
  BotOff, 
  ArrowRightLeft, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  Phone, 
  Loader2, 
  Sparkles,
  Layers,
  ExternalLink,
  History,
  Megaphone,
  Clock,
  UserMinus,
  Plus,
  UserCheck,
  Check
} from 'lucide-react'
import { useConversationContext } from '../hooks/use-context'
import { supabase } from '@/lib/supabase/client'
import { useI18n } from '@/contexts/i18n-context'
import Link from 'next/link'

export default function ChatContextPanel({ conversationId }: { conversationId: string }) {
  const { t } = useI18n()
  const { context, setContext, loading } = useConversationContext(conversationId)
  const [updatingDept, setUpdatingDept] = useState(false)
  const [updatingAgent, setUpdatingAgent] = useState(false)
  const [updatingBot, setUpdatingBot] = useState(false)

  // Operational Actions State (Etapa 3: MCS Chat <-> MCS Personal Bridge)
  const [showResignForm, setShowResignForm] = useState(false)
  const [cumprira15Dias, setCumprira15Dias] = useState(true)
  const [ultimoDia, setUltimoDia] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 15)
    return d.toISOString().split('T')[0]
  })
  const [resignNotes, setResignNotes] = useState('')
  const [submittingResign, setSubmittingResign] = useState(false)

  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [taskDeptId, setTaskDeptId] = useState('')
  const [taskUserId, setTaskUserId] = useState('')
  const [taskPriority, setTaskPriority] = useState<'normal' | 'high' | 'urgent'>('high')
  const [taskScheduledFor, setTaskScheduledFor] = useState('')
  const [submittingTask, setSubmittingTask] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)

  if (loading) {
     return (
       <aside className="w-[380px] flex-shrink-0 bg-white dark:bg-slate-900 flex flex-col items-center justify-center h-full border-l border-slate-200 dark:border-slate-800 hidden lg:flex">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mb-3" />
          <p className="text-xs font-medium text-slate-500">Carregando ficha do trabalhador...</p>
       </aside>
     )
  }

  if (!context) {
     return (
       <aside className="w-[380px] flex-shrink-0 bg-white dark:bg-slate-900 flex flex-col items-center p-8 text-center h-full border-l border-slate-200 dark:border-slate-800 hidden lg:flex">
          <p className="text-xs text-slate-500">Nenhum contexto disponível</p>
       </aside>
     )
  }

  const { worker, conversation, company, departments, coreDepartments = [], users = [], workerTasks = [], allocations } = context

  const isActiveWorker = worker?.status_trabajador?.toLowerCase() === 'ativo' || worker?.status_trabajador?.toLowerCase() === 'active'
  const isAltaSeguridad = worker?.status_seguridad?.toUpperCase() === 'ALTA'
  const resolvedEmpresaId = company?.id || worker?.empresa_id || conversation?.company_id || null

  const handleDepartmentChange = async (newDeptId: string) => {
    setUpdatingDept(true)
    const { error } = await supabase
      .from('chat_conversations')
      .update({ department_id: newDeptId || null })
      .eq('id', conversationId)

    if (!error) {
      const selectedDept = departments.find(d => d.id === newDeptId)
      setContext((prev: any) => ({
        ...prev,
        conversation: { ...prev.conversation, department_id: newDeptId, department: selectedDept }
      }))
    }
    setUpdatingDept(false)
  }

  const handleAgentChange = async (newAgentId: string) => {
    setUpdatingAgent(true)
    const { error } = await supabase
      .from('chat_conversations')
      .update({ assigned_to: newAgentId || null })
      .eq('id', conversationId)

    if (!error) {
      setContext((prev: any) => ({
        ...prev,
        conversation: { ...prev.conversation, assigned_to: newAgentId || null }
      }))
      setFeedbackMsg(newAgentId ? 'Atendente atribuído na mesma conversa!' : 'Conversa liberada para a fila.')
      setTimeout(() => setFeedbackMsg(null), 3500)
    }
    setUpdatingAgent(false)
  }

  const handleBotStatusToggle = async () => {
    setUpdatingBot(true)
    const nextStatus = conversation?.bot_status === 'active' ? 'paused' : 'active'
    const { error } = await supabase
      .from('chat_conversations')
      .update({ bot_status: nextStatus })
      .eq('id', conversationId)

    if (!error) {
      setContext((prev: any) => ({
        ...prev,
        conversation: { ...prev.conversation, bot_status: nextStatus }
      }))
    }
    setUpdatingBot(false)
  }

  const handleStartResignationFlow = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!worker?.id || !resolvedEmpresaId) {
      setFeedbackMsg('Trabalhador ou empresa não vinculados a esta conversa.')
      return
    }
    setSubmittingResign(true)
    try {
      const { data, error } = await supabase
        .schema('core_operacoes')
        .rpc('iniciar_baixa_trabalhador_chat', {
          p_empresa_id: resolvedEmpresaId,
          p_worker_id: worker.id,
          p_pedido_id: conversation?.pedido_id || null,
          p_conversation_id: conversationId,
          p_cumprira_15_dias: cumprira15Dias,
          p_ultimo_dia_trabalhado: ultimoDia || null,
          p_observacoes: resignNotes || null,
          p_user_id: null
        })

      if (error) throw error

      // Also log official notice in chat messages
      await supabase.from('chat_messages').insert({
        conversation_id: conversationId,
        direction: 'outbound',
        sender_name: 'Sistema MCS (Aviso Prévio)',
        message_type: 'text',
        content: `📋 [FLUXO DE BAIXA INICIADO - ${(data as any)?.codigo || 'PLAYBOOK'}]\nRegra de Aviso Prévio (15 dias): ${
          cumprira15Dias ? 'Cumprirá os 15 dias' : 'Saída imediata (sujeito a desconto nas horas finais)'
        }\nÚltimo dia previsto: ${ultimoDia}`,
        status: 'sent'
      })

      setShowResignForm(false)
      setResignNotes('')
      setFeedbackMsg('✅ Playbook de Demissão/Aviso Prévio disparado para RH, Operações, Seguridade, Logística e Financeiro!')
      setTimeout(() => setFeedbackMsg(null), 5000)
    } catch (err: any) {
      setFeedbackMsg(`Erro: ${err.message || 'Falha ao iniciar baixa'}`)
    } finally {
      setSubmittingResign(false)
    }
  }

  const handleCreateDirectTaskFromChat = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskTitle.trim() || !resolvedEmpresaId) return
    setSubmittingTask(true)
    try {
      const { error } = await supabase
        .schema('core_operacoes')
        .rpc('criar_tarefa_direta', {
          p_empresa_id: resolvedEmpresaId,
          p_title: taskTitle.trim(),
          p_description: taskDesc.trim() || `Originada na conversa WhatsApp de ${worker?.nome || conversation?.contact_name}`,
          p_department_id: taskDeptId || null,
          p_assigned_to_user_id: taskUserId || null,
          p_priority: taskPriority,
          p_scheduled_for: taskScheduledFor ? new Date(taskScheduledFor).toISOString() : null,
          p_worker_id: worker?.id || null,
          p_pedido_id: conversation?.pedido_id || null,
          p_client_id: null,
          p_conversation_id: conversationId,
          p_task_origin: 'chat',
          p_created_by: null
        })

      if (error) throw error

      setTaskTitle('')
      setTaskDesc('')
      setTaskScheduledFor('')
      setShowTaskForm(false)
      setFeedbackMsg('✅ Tarefa criada no MCS Personal para o setor/pessoa!')
      setTimeout(() => setFeedbackMsg(null), 4000)
    } catch (err: any) {
      setFeedbackMsg(`Erro: ${err.message || 'Falha ao criar tarefa'}`)
    } finally {
      setSubmittingTask(false)
    }
  }

  const handleCompleteWorkerTask = async (taskId: string) => {
    const { error } = await supabase
      .schema('core_operacoes')
      .from('solicitud_tareas')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', taskId)

    if (!error) {
      setContext((prev: any) => ({
        ...prev,
        workerTasks: (prev.workerTasks || []).filter((t: any) => t.id !== taskId)
      }))
      setFeedbackMsg('✅ Tarefa concluída!')
      setTimeout(() => setFeedbackMsg(null), 3000)
    }
  }

  return (
    <aside className="w-[380px] flex-shrink-0 bg-slate-50/50 dark:bg-slate-900 flex flex-col h-full overflow-y-auto hidden lg:flex border-l border-slate-200 dark:border-slate-800 select-none custom-scrollbar">
      
      {/* Header com Foto e Identificação */}
      <div className="flex flex-col items-center pt-6 pb-4 px-5 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
        <div className="relative mb-3">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center text-2xl font-bold shadow-md overflow-hidden ring-4 ring-slate-100 dark:ring-slate-800">
            {worker?.foto ? (
              <img src={worker.foto} alt="Foto" className="w-full h-full object-cover" />
            ) : conversation?.contact_avatar_url ? (
              <img src={conversation.contact_avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User className="w-9 h-9 text-white/90" />
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-center mb-1">
          {/* Status Trabalhador Badge */}
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm ${
            isActiveWorker 
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300' 
              : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300'
          }`}>
            {isActiveWorker ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
            {worker?.status_trabajador || 'Ativo'}
          </span>

          {/* Status Seguridade Social Badge */}
          {worker?.status_seguridad && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm ${
              isAltaSeguridad
                ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300'
                : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300'
            }`}>
              <ShieldCheck className="w-2.5 h-2.5" />
              Seguridad: {worker.status_seguridad}
            </span>
          )}
        </div>

        <h3 className="text-base font-bold text-slate-800 dark:text-white text-center line-clamp-1">
          {worker?.nome || conversation?.contact_name || 'Contato WhatsApp'}
        </h3>

        {worker?.cod_colab && (
          <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            Cód: {worker.cod_colab}
          </p>
        )}
        
        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5 font-mono">
          <Phone className="w-3 h-3 text-slate-400" />
          {conversation?.contact_phone || 'Sem número'}
        </p>

        {worker?.documento && (
          <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-md mt-1.5 border border-slate-200 dark:border-slate-700">
            DNI/NIE: {worker.documento}
          </span>
        )}

        {/* Link para Ficha no MCS Personal */}
        {worker?.id && (
          <a 
            href={`https://mcs.gestaologinpro.com/workers/${worker.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <span>Ver Ficha no MCS Personal</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div className="mx-4 mt-3 p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 text-center">
          {feedbackMsg}
        </div>
      )}

      {/* Ações de Controle: Bot IA, Departamento & Atendente Responsável (Mesma Conversa) */}
      <div className="p-4 space-y-3 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
        
        {/* Controle do Bot de IA */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              conversation?.bot_status === 'active' 
                ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400' 
                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
            }`}>
              {conversation?.bot_status === 'active' ? <Bot className="w-4 h-4" /> : <BotOff className="w-4 h-4" />}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                {conversation?.bot_status === 'active' ? 'IA Ativa no Chat' : 'IA Pausada (Humano)'}
              </p>
              <p className="text-[10px] text-slate-400">
                {conversation?.bot_status === 'active' ? 'Triagem automática' : 'Atendimento manual'}
              </p>
            </div>
          </div>

          <button
            onClick={handleBotStatusToggle}
            disabled={updatingBot}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              conversation?.bot_status === 'active'
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {updatingBot ? '...' : conversation?.bot_status === 'active' ? 'Pausar IA' : 'Ativar IA'}
          </button>
        </div>

        {/* Transferência de Departamento */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <ArrowRightLeft className="w-3 h-3 text-slate-400" />
            Departamento Atual
          </label>
          <div className="relative">
            <select
              value={conversation?.department_id || ''}
              onChange={(e) => handleDepartmentChange(e.target.value)}
              disabled={updatingDept}
              className="w-full text-xs font-medium bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">Fila Geral (Sem departamento)</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Transferência para Pessoa Específica (Ex: Especialista de Retenção / Aviso Prévio) mantendo o MESMO NÚMERO */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
            <UserCheck className="w-3 h-3" />
            Atendente Responsável (Mesmo Número)
          </label>
          <div className="relative">
            <select
              value={conversation?.assigned_to || ''}
              onChange={(e) => handleAgentChange(e.target.value)}
              disabled={updatingAgent}
              className="w-full text-xs font-semibold bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl px-3 py-2 text-indigo-900 dark:text-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="">Qualquer atendente do setor</option>
              {users.map((u: any) => (
                <option key={u.id} value={u.id}>
                  👤 {u.name || u.email}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Botões de Ação Operacional Direta (Playbook de Baixa 15d + Nova Tarefa Direta) */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Gatilhos Operacionais (MCS Personal)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setShowResignForm(!showResignForm)
                setShowTaskForm(false)
              }}
              className="py-2 px-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <UserMinus className="w-3.5 h-3.5 shrink-0" />
              <span>Baixa / 15 Dias</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowTaskForm(!showTaskForm)
                setShowResignForm(false)
              }}
              className="py-2 px-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Criar Tarefa</span>
            </button>
          </div>

          {/* Formulário Inline: Iniciar Baixa / Carta de Renúncia (15 dias) */}
          {showResignForm && (
            <form onSubmit={handleStartResignationFlow} className="p-3 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 space-y-2.5 mt-2">
              <div className="text-[11px] font-bold text-purple-900 dark:text-purple-200">
                🚪 Pedido de Demissão & Aviso Prévio (15d)
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Cumprirá os 15 dias de Aviso Prévio?
                </label>
                <select
                  value={cumprira15Dias ? 'sim' : 'nao'}
                  onChange={e => setCumprira15Dias(e.target.value === 'sim')}
                  className="w-full text-xs rounded-lg border border-purple-200 dark:border-purple-800 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                >
                  <option value="sim">✅ Sim - Cumpre 15 dias (Sem desconto)</option>
                  <option value="nao">⚠️ Não - Saída imediata (Descontar horas)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Último Dia Trabalhado
                </label>
                <input
                  type="date"
                  required
                  value={ultimoDia}
                  onChange={e => setUltimoDia(e.target.value)}
                  className="w-full text-xs rounded-lg border border-purple-200 dark:border-purple-800 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                />
              </div>

              <div>
                <input
                  type="text"
                  value={resignNotes}
                  onChange={e => setResignNotes(e.target.value)}
                  placeholder="Motivo / Resumo da tentativa de retenção..."
                  className="w-full text-xs rounded-lg border border-purple-200 dark:border-purple-800 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                />
              </div>

              <button
                type="submit"
                disabled={submittingResign}
                className="w-full py-1.5 px-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                {submittingResign ? 'Disparando Playbook...' : 'Disparar Playbook nos Setores'}
              </button>
            </form>
          )}

          {/* Formulário Inline: Criar Tarefa Direta para Setor ou Pessoa */}
          {showTaskForm && (
            <form onSubmit={handleCreateDirectTaskFromChat} className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 space-y-2.5 mt-2">
              <div className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200">
                ⚡ Nova Tarefa para Setor ou Pessoa
              </div>

              <input
                type="text"
                required
                value={taskTitle}
                onChange={e => setTaskTitle(e.target.value)}
                placeholder="Título da tarefa (ex: Verificar alojamento...)"
                className="w-full text-xs rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 px-2.5 py-1.5"
              />

              <select
                value={taskDeptId}
                onChange={e => setTaskDeptId(e.target.value)}
                className="w-full text-xs rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 px-2.5 py-1.5"
              >
                <option value="">Selecione o Setor no MCS Personal...</option>
                {coreDepartments.map((d: any) => (
                  <option key={d.id} value={d.id}>
                    🏢 {d.name} ({d.code})
                  </option>
                ))}
              </select>

              <select
                value={taskUserId}
                onChange={e => setTaskUserId(e.target.value)}
                className="w-full text-xs rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 px-2.5 py-1.5"
              >
                <option value="">Qualquer pessoa do setor</option>
                {users.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    👤 {u.name || u.email}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={taskPriority}
                  onChange={e => setTaskPriority(e.target.value as any)}
                  className="w-full text-xs rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 px-2 py-1.5"
                >
                  <option value="normal">Prioridade Normal</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente 🔥</option>
                </select>

                <input
                  type="datetime-local"
                  value={taskScheduledFor}
                  onChange={e => setTaskScheduledFor(e.target.value)}
                  className="w-full text-[11px] rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 px-2 py-1.5"
                  title="Programar para data/hora"
                />
              </div>

              <textarea
                rows={2}
                value={taskDesc}
                onChange={e => setTaskDesc(e.target.value)}
                placeholder="Detalhes adicionais..."
                className="w-full text-xs rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 px-2.5 py-1.5"
              />

              <button
                type="submit"
                disabled={submittingTask}
                className="w-full py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                {submittingTask ? 'Enviando...' : 'Enviar Tarefa para MCS Personal'}
              </button>
            </form>
          )}
        </div>

      </div>

      {/* Ficha Completa do Trabalhador & Alocações */}
      <div className="p-4 space-y-3 flex-1">
        
        {/* Tarefas Ativas deste Trabalhador no MCS Personal */}
        {workerTasks && workerTasks.length > 0 && (
          <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-indigo-200/80 dark:border-indigo-900/60 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                ⚡ Tarefas Pendentes ({workerTasks.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {workerTasks.map((tItem: any) => (
                <div
                  key={tItem.id}
                  className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                      {tItem.department?.name || 'Setor'}
                    </span>
                    <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 mt-1 leading-snug">
                      {tItem.title}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCompleteWorkerTask(tItem.id)}
                    className="p-1 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-700 shrink-0 cursor-pointer"
                    title="Concluir tarefa"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
          Alocação e Obras
        </h4>

        {/* Empresa Contratante */}
        <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400">Empresa Contratante</p>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                {worker?.contratante || company?.trade_name || company?.nome || 'Stocco / MCS'}
              </p>
            </div>
          </div>
          {company?.invoice_logo_url && (
            <img src={company.invoice_logo_url} alt="Logo" className="h-6 w-auto object-contain max-w-[60px]" />
          )}
        </div>

        {/* Cliente / Última Obra Alocada */}
        <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center shrink-0">
              <Briefcase className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase text-slate-400">
                  {isActiveWorker ? 'Cliente / Obra Atual' : 'Última Obra / Cliente'}
                </p>
                {worker?.cod_cliente && (
                  <span className="text-[10px] text-slate-400 font-mono">Cód: {worker.cod_cliente}</span>
                )}
              </div>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate mt-0.5">
                {worker?.cliente || 'Não informado / Em trânsito'}
              </p>

              {/* Função / Cargo */}
              {worker?.funcion && (
                <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                  <Layers className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="font-semibold">{worker.funcion}</span>
                </div>
              )}

              {/* Datas de Ingresso e Baixa */}
              <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                <span>Início: <strong className="text-slate-700 dark:text-slate-300">{worker?.data_ingresso || '-'}</strong></span>
                {worker?.data_baixa && (
                  <span>Saída: <strong className="text-rose-600 dark:text-rose-400">{worker.data_baixa}</strong></span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Histórico de Alocações Anteriores */}
        {allocations && allocations.length > 0 && (
          <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200">
              <History className="w-3.5 h-3.5 text-slate-400" />
              <span>Histórico de Alocações</span>
            </div>
            <div className="space-y-1.5">
              {allocations.map((item, idx) => (
                <div key={item.id || idx} className="text-[11px] p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between font-medium">
                    <span className="text-slate-800 dark:text-slate-200 font-semibold truncate max-w-[190px]">
                      {item.cliente_nome || item.empresa_nome || 'Obra'}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {item.effective_date ? new Date(item.effective_date).toLocaleDateString('pt-BR') : ''}
                    </span>
                  </div>
                  {item.comments && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 italic">
                      "{item.comments}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Botão de Campanha Segmentada para a Obra */}
        {worker?.cliente && (
          <div className="pt-2">
            <Link
              href={`/inbox/automations?client=${encodeURIComponent(worker.cliente)}&company=${encodeURIComponent(worker.contratante || '')}`}
              className="w-full py-2 px-3 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Megaphone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Criar Campanha para "{worker.cliente}"</span>
            </Link>
          </div>
        )}

      </div>
    </aside>
  )
}
