"use client"
import { useState, useEffect } from 'react'
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
  Layers,
  ExternalLink,
  History,
  Megaphone,
  Clock,
  UserMinus,
  Plus,
  UserCheck,
  Check,
  StickyNote,
  Send
} from 'lucide-react'
import { useConversationContext } from '../hooks/use-context'
import { supabase } from '@/lib/supabase/client'
import { useI18n } from '@/contexts/i18n-context'
import Link from 'next/link'
import {
  MCS_TRANSFER_SPECIALTIES,
  executeConversationTransfer,
} from '../constants/mcs-tags-and-transfers'

export default function ChatContextPanel({ conversationId }: { conversationId: string }) {
  const { t } = useI18n()
  const { context, setContext, loading } = useConversationContext(conversationId)
  const [activeTab, setActiveTab] = useState<'dados' | 'tarefas' | 'notas' | 'agenda'>('dados')

  // Transfer Modal / Box State
  const [showTransferBox, setShowTransferBox] = useState(false)
  const [transferSpecialty, setTransferSpecialty] = useState('')
  const [transferDeptId, setTransferDeptId] = useState('')
  const [transferUserId, setTransferUserId] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [submittingTransfer, setSubmittingTransfer] = useState(false)
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

  // Notes & Schedule State
  const [internalNotes, setInternalNotes] = useState<any[]>([])
  const [newNoteText, setNewNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const [scheduleTitle, setScheduleTitle] = useState('')
  const [scheduleDateTime, setScheduleDateTime] = useState('')
  const [savingSchedule, setSavingSchedule] = useState(false)

  // Manual Worker Linking State (Vincular Número ao Trabalhador)
  const [showLinkWorkerBox, setShowLinkWorkerBox] = useState(false)
  const [workerSearchTerm, setWorkerSearchTerm] = useState('')
  const [workerSearchResults, setWorkerSearchResults] = useState<any[]>([])
  const [searchingWorkers, setSearchingWorkers] = useState(false)
  const [linkingWorker, setLinkingWorker] = useState(false)
  const [updateWorkerPhone, setUpdateWorkerPhone] = useState(true)

  useEffect(() => {
    const q = workerSearchTerm.trim()
    if (!showLinkWorkerBox || q.length < 2) {
      setWorkerSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearchingWorkers(true)
      const { data } = await supabase
        .schema('core_personal')
        .from('workers')
        .select('id, cod_colab, nome, contratante, cliente, funcion, status_trabajador, status_seguridad, movil, nie, dni, pasaporte, foto')
        .or(`nome.ilike.%${q}%,cod_colab.ilike.%${q}%,nie.ilike.%${q}%,dni.ilike.%${q}%,pasaporte.ilike.%${q}%,movil.ilike.%${q}%`)
        .limit(12)
      setWorkerSearchResults(data || [])
      setSearchingWorkers(false)
    }, 260)
    return () => clearTimeout(timer)
  }, [workerSearchTerm, showLinkWorkerBox])

  const handleLinkConversationToWorker = async (selectedW: any) => {
    if (linkingWorker) return
    setLinkingWorker(true)
    try {
      const { error } = await supabase.rpc('link_conversation_to_worker', {
        p_conversation_id: conversationId,
        p_worker_id: selectedW.id,
        p_update_worker_phone: updateWorkerPhone
      })
      if (error) throw error

      setContext((prev: any) => ({
        ...prev,
        worker: {
          ...selectedW,
          documento: selectedW.nie || selectedW.dni || selectedW.pasaporte || null
        },
        conversation: {
          ...prev.conversation,
          worker_id: selectedW.id,
          contact_name: selectedW.nome,
          worker_company_name: selectedW.contratante,
          worker_client_name: selectedW.cliente,
          worker_function_name: selectedW.funcion
        }
      }))

      setShowLinkWorkerBox(false)
      setWorkerSearchTerm('')
      setFeedbackMsg(
        updateWorkerPhone
          ? `✅ Vinculado a ${selectedW.nome} e telefone WhatsApp salvo no cadastro do trabalhador!`
          : `✅ Conversa vinculada a ${selectedW.nome}!`
      )
      setTimeout(() => setFeedbackMsg(null), 4500)
    } catch (err: any) {
      setFeedbackMsg(`Erro ao vincular: ${err.message}`)
    } finally {
      setLinkingWorker(false)
    }
  }

  useEffect(() => {
    if (context?.conversation) {
      setTransferDeptId(context.conversation.department_id || '')
      setTransferUserId(context.conversation.assigned_to || '')
    }
  }, [context?.conversation?.department_id, context?.conversation?.assigned_to])

  useEffect(() => {
    if (!conversationId) return
    supabase
      .from('chat_messages')
      .select('id, content, sender_name, sender_department, created_at')
      .eq('conversation_id', conversationId)
      .eq('message_type', 'internal_note')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setInternalNotes(data)
      })
  }, [conversationId])

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

  const isActiveWorker =
    worker?.status_trabajador?.toLowerCase() === 'ativo' || worker?.status_trabajador?.toLowerCase() === 'active'
  const isAltaSeguridad = worker?.status_seguridad?.toUpperCase() === 'ALTA'
  const resolvedEmpresaId = company?.id || worker?.empresa_id || conversation?.company_id || null

  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmittingTransfer(true)
    try {
      const { data: authData } = await supabase.auth.getUser()
      const currentUid = authData?.user?.id || null
      const currentUObj = users.find((u: any) => u.id === currentUid)
      const senderName =
        currentUObj?.display_name ||
        currentUObj?.name ||
        authData?.user?.email?.split('@')[0] ||
        'Atendente MCS'

      const selectedUser = users.find((u: any) => u.id === transferUserId)
      const effectiveDeptId = transferDeptId || selectedUser?.department_id || ''
      const selectedDept = departments.find((d) => d.id === effectiveDeptId)
      const assignedName = selectedUser ? selectedUser.display_name || selectedUser.name || selectedUser.email : null

      const { nextTags, targetSummary } = await executeConversationTransfer({
        conversationId,
        currentTags: conversation?.tags || [],
        targetDeptId: effectiveDeptId || null,
        targetDeptName: selectedDept?.name || null,
        targetUserId: transferUserId || null,
        targetUserName: assignedName,
        senderUserId: currentUid,
        senderUserName: senderName,
        specialtyId: transferSpecialty || null,
        reason: transferReason,
        contactName: worker?.nome || conversation?.contact_name || conversation?.contact_phone || 'Trabalhador',
        contactPhone: conversation?.contact_phone || null,
      })

      const specObj = MCS_TRANSFER_SPECIALTIES.find((s) => s.id === transferSpecialty)
      setContext((prev: any) => ({
        ...prev,
        conversation: {
          ...prev.conversation,
          department_id: effectiveDeptId || null,
          department: selectedDept || null,
          assigned_to: transferUserId || null,
          assigned_to_name: assignedName,
          transferred_by_name: senderName,
          transfer_category: specObj?.shortLabel || null,
          transfer_note: transferReason.trim() || null,
          tags: nextTags,
        }
      }))

      setShowTransferBox(false)
      setTransferReason('')
      setTransferSpecialty('')
      setFeedbackMsg(`✅ Conversa transferida e notificada para ${targetSummary}!`)
      setTimeout(() => setFeedbackMsg(null), 4000)
    } catch (err: any) {
      setFeedbackMsg(`Erro ao transferir: ${err.message}`)
    } finally {
      setSubmittingTransfer(false)
    }
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

      await supabase.from('chat_messages').insert({
        conversation_id: conversationId,
        direction: 'outbound',
        sender_name: 'Sistema MCS (Aviso Prévio)',
        sender_department: 'RH',
        message_type: 'system_block',
        content: `📋 FLUXO DE BAIXA INICIADO (${(data as any)?.codigo || 'PLAYBOOK'}) — Aviso Prévio 15d: ${
          cumprira15Dias ? 'Cumprirá 15 dias' : 'Saída imediata (desconto nas horas)'
        } • Último dia: ${ultimoDia}`,
        status: 'sent'
      })

      setShowResignForm(false)
      setResignNotes('')
      setFeedbackMsg('✅ Playbook de Demissão/Aviso Prévio disparado para todos os setores!')
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

  const handleAddInternalNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newNoteText.trim() || savingNote) return
    setSavingNote(true)
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: conversationId,
          direction: 'outbound',
          sender_name: conversation?.assigned_to_name || 'Equipe MCS',
          sender_department: conversation?.department?.name || 'Interno',
          message_type: 'internal_note',
          content: newNoteText.trim(),
          status: 'sent'
        })
        .select('id, content, sender_name, sender_department, created_at')
        .single()

      if (!error && data) {
        setInternalNotes((prev) => [data, ...prev])
        setNewNoteText('')
        setFeedbackMsg('✅ Nota privada salva na conversa!')
        setTimeout(() => setFeedbackMsg(null), 3000)
      }
    } finally {
      setSavingNote(false)
    }
  }

  const handleAddQuickSchedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scheduleTitle.trim() || !scheduleDateTime || !resolvedEmpresaId) return
    setSavingSchedule(true)
    try {
      const { error } = await supabase
        .schema('core_operacoes')
        .rpc('criar_tarefa_direta', {
          p_empresa_id: resolvedEmpresaId,
          p_title: `📅 [Retorno Agendado] ${scheduleTitle.trim()}`,
          p_description: `Follow-up agendado no MCS Chat para ${worker?.nome || conversation?.contact_name}`,
          p_department_id: null,
          p_assigned_to_user_id: conversation?.assigned_to || null,
          p_priority: 'high',
          p_scheduled_for: new Date(scheduleDateTime).toISOString(),
          p_worker_id: worker?.id || null,
          p_pedido_id: conversation?.pedido_id || null,
          p_client_id: null,
          p_conversation_id: conversationId,
          p_task_origin: 'chat',
          p_created_by: null
        })

      if (error) throw error
      setScheduleTitle('')
      setScheduleDateTime('')
      setFeedbackMsg('✅ Agendamento criado no Command Center!')
      setTimeout(() => setFeedbackMsg(null), 3500)
    } catch (err: any) {
      setFeedbackMsg(`Erro ao agendar: ${err.message}`)
    } finally {
      setSavingSchedule(false)
    }
  }

  const scheduledTasks = (workerTasks || []).filter((t: any) => Boolean(t.scheduled_for))

  return (
    <aside className="w-[380px] flex-shrink-0 bg-slate-50/50 dark:bg-slate-900 flex flex-col h-full overflow-hidden hidden lg:flex border-l border-slate-200 dark:border-slate-800 select-none">
      {/* Compact CRM-Style Worker Header */}
      <div className="p-4 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center text-xl font-bold shadow-md overflow-hidden ring-2 ring-slate-100 dark:ring-slate-800 shrink-0">
            {worker?.foto ? (
              <img src={worker.foto} alt="Foto" className="w-full h-full object-cover" />
            ) : conversation?.contact_avatar_url ? (
              <img src={conversation.contact_avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User className="w-7 h-7 text-white/90" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap mb-1">
              <span
                className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                  isActiveWorker
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                {isActiveWorker ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                {worker?.status_trabajador || 'Ativo'}
              </span>

              {worker?.status_seguridad && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                    isAltaSeguridad
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  <ShieldCheck className="w-2.5 h-2.5" />
                  {worker.status_seguridad}
                </span>
              )}
            </div>

            <h3 className="text-sm font-bold text-slate-800 dark:text-white truncate">
              {worker?.nome || conversation?.contact_name || 'Contato WhatsApp'}
            </h3>

            <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 flex-wrap">
              <span className="font-mono flex items-center gap-1">
                <Phone className="w-2.5 h-2.5 text-slate-400" />
                {conversation?.contact_phone || 'Sem número'}
              </span>
              {worker?.documento && (
                <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded border border-slate-200 dark:border-slate-700">
                  {worker.documento}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 2 Top Action Buttons: Transferir Bloco & Ver Ficha MCS / Vincular Trabalhador */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            type="button"
            onClick={() => {
              setShowTransferBox(!showTransferBox)
              setShowLinkWorkerBox(false)
            }}
            className={`py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
              showTransferBox
                ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Transferir</span>
          </button>

          {worker?.id ? (
            <div className="flex items-center gap-1">
              <a
                href={`https://mcs.gestaologinpro.com/workers/${worker.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-colors"
              >
                <span>Ficha MCS</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                type="button"
                onClick={() => {
                  setShowLinkWorkerBox(!showLinkWorkerBox)
                  setShowTransferBox(false)
                }}
                title="Alterar Trabalhador Vinculado"
                className="p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setShowLinkWorkerBox(!showLinkWorkerBox)
                setShowTransferBox(false)
              }}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                showLinkWorkerBox
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Vincular Trabalhador</span>
            </button>
          )}
        </div>

        {/* Inline Box: Vincular Número WhatsApp a um Trabalhador (e atualizar telefone no MCS Personal) */}
        {showLinkWorkerBox && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-2.5 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                Vincular WhatsApp ao Trabalhador
              </span>
            </div>

            <input
              type="text"
              value={workerSearchTerm}
              onChange={(e) => setWorkerSearchTerm(e.target.value)}
              placeholder="Buscar por Nome, DNI/NIE ou Código..."
              className="w-full text-xs bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 rounded-lg px-2.5 py-1.5 focus:outline-none"
            />

            <label className="flex items-center gap-2 text-[10.5px] font-semibold text-emerald-900 dark:text-emerald-200 cursor-pointer">
              <input
                type="checkbox"
                checked={updateWorkerPhone}
                onChange={(e) => setUpdateWorkerPhone(e.target.checked)}
                className="rounded text-emerald-600"
              />
              <span>Salvar este número ({conversation?.contact_phone}) na ficha do trabalhador</span>
            </label>

            {searchingWorkers && (
              <p className="text-[11px] text-emerald-700 text-center py-1">Buscando trabalhadores...</p>
            )}

            {!searchingWorkers && workerSearchResults.length > 0 && (
              <div className="max-h-44 overflow-y-auto space-y-1 pr-0.5">
                {workerSearchResults.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    disabled={linkingWorker}
                    onClick={() => handleLinkConversationToWorker(w)}
                    className="w-full text-left p-2 rounded-lg bg-white hover:bg-emerald-100/70 border border-emerald-200/80 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{w.nome}</p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {w.contratante || 'MCS'} {w.cliente ? `• 🏗️ ${w.cliente}` : ''} {w.nie || w.dni ? `• ${w.nie || w.dni}` : ''}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold shrink-0">
                      Vincular
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Inline Transfer Box (Creates Bloco de Atendimento in Chat) */}
        {showTransferBox && (
          <form
            onSubmit={handleConfirmTransfer}
            className="mt-3 p-3 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 space-y-2.5 animate-in fade-in slide-in-from-top-1"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600" />
                Transferir Bloco de Atendimento
              </span>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Assunto / Especialidade (Etiqueta Automática)
              </label>
              <select
                value={transferSpecialty}
                onChange={(e) => setTransferSpecialty(e.target.value)}
                className="w-full text-xs font-medium bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-100"
              >
                <option value="">📌 Sem especialidade específica</option>
                {MCS_TRANSFER_SPECIALTIES.map((spec) => (
                  <option key={spec.id} value={spec.id}>
                    {spec.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Setor de Destino</label>
              <select
                value={transferDeptId}
                onChange={(e) => {
                  const nextDeptId = e.target.value
                  setTransferDeptId(nextDeptId)
                  if (nextDeptId && transferUserId) {
                    const currentSelected = users.find((u: any) => u.id === transferUserId)
                    if (currentSelected && currentSelected.department_id !== nextDeptId) {
                      setTransferUserId('')
                    }
                  }
                }}
                className="w-full text-xs font-medium bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-100"
              >
                <option value="">Fila Geral (Sem setor específico)</option>
                {departments.map((dept) => {
                  const deptUsersCount = users.filter((u: any) => u.department_id === dept.id).length
                  return (
                    <option key={dept.id} value={dept.id}>
                      📂 {dept.name} ({deptUsersCount})
                    </option>
                  )
                })}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                {transferDeptId
                  ? `Funcionários do Setor (${users.filter((u: any) => u.department_id === transferDeptId).length})`
                  : 'Funcionário Responsável (Mesmo Número)'}
              </label>
              <select
                value={transferUserId}
                onChange={(e) => {
                  const nextUserId = e.target.value
                  setTransferUserId(nextUserId)
                  if (nextUserId && !transferDeptId) {
                    const chosen = users.find((u: any) => u.id === nextUserId)
                    if (chosen?.department_id) {
                      setTransferDeptId(chosen.department_id)
                    }
                  }
                }}
                className="w-full text-xs font-medium bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-100"
              >
                <option value="">Qualquer funcionário do setor</option>
                {(transferDeptId
                  ? users.filter((u: any) => u.department_id === transferDeptId)
                  : users
                ).map((u: any) => (
                  <option key={u.id} value={u.id}>
                    👤 {u.display_name || u.name || u.email}
                    {!transferDeptId && u.department_name ? ` — ${u.department_name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <input
                type="text"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="Motivo / Resumo para o próximo atendente..."
                className="w-full text-xs bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg px-2.5 py-1.5"
              />
            </div>

            <button
              type="submit"
              disabled={submittingTransfer}
              className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              {submittingTransfer ? 'Transferindo...' : 'Confirmar Transferência no Chat'}
            </button>
          </form>
        )}
      </div>

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div className="mx-3 mt-2 p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 text-center shrink-0">
          {feedbackMsg}
        </div>
      )}

      {/* 4 Horizontal CRM Tabs */}
      <div className="grid grid-cols-4 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-2 pt-1 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('dados')}
          className={`py-2.5 text-[11px] font-bold border-b-2 transition-colors flex items-center justify-center gap-1 cursor-pointer ${
            activeTab === 'dados'
              ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>Dados</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tarefas')}
          className={`py-2.5 text-[11px] font-bold border-b-2 transition-colors flex items-center justify-center gap-1 cursor-pointer ${
            activeTab === 'tarefas'
              ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Tarefas</span>
          {workerTasks.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-indigo-100 text-indigo-700">
              {workerTasks.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('notas')}
          className={`py-2.5 text-[11px] font-bold border-b-2 transition-colors flex items-center justify-center gap-1 cursor-pointer ${
            activeTab === 'notas'
              ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <StickyNote className="w-3.5 h-3.5" />
          <span>Notas</span>
          {internalNotes.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-amber-100 text-amber-700">
              {internalNotes.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('agenda')}
          className={`py-2.5 text-[11px] font-bold border-b-2 transition-colors flex items-center justify-center gap-1 cursor-pointer ${
            activeTab === 'agenda'
              ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Agenda</span>
        </button>
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {/* TAB 1: DADOS & ALOCAÇÃO */}
        {activeTab === 'dados' && (
          <>
            {/* Resumo do Atendimento Atual */}
            <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-semibold">Setor Atual:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {conversation?.department?.name || 'Fila Geral'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-semibold">Atendente:</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                  {conversation?.assigned_to_name || 'Não atribuído'}
                </span>
              </div>
            </div>

            {/* Empresa Contratante */}
            <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">Empresa Contratante</p>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    {worker?.contratante || company?.trade_name || company?.nome || conversation?.worker_company_name || 'Grupo MCS'}
                  </p>
                </div>
              </div>
              {company?.invoice_logo_url && (
                <img src={company.invoice_logo_url} alt="Logo" className="h-6 w-auto object-contain max-w-[60px]" />
              )}
            </div>

            {/* Cliente / Obra Alocada */}
            <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
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
                    {worker?.cliente || conversation?.worker_client_name || 'Não informado / Em trânsito'}
                  </p>

                  {(worker?.funcion || conversation?.worker_function_name) && (
                    <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-600 dark:text-slate-300">
                      <Layers className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="font-semibold">{worker?.funcion || conversation?.worker_function_name}</span>
                    </div>
                  )}

                  <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                    <span>
                      Início: <strong className="text-slate-700 dark:text-slate-300">{worker?.data_ingresso || '-'}</strong>
                    </span>
                    {worker?.data_baixa && (
                      <span>
                        Saída: <strong className="text-rose-600 dark:text-rose-400">{worker.data_baixa}</strong>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Controle do Bot de IA */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    conversation?.bot_status === 'active'
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-amber-100 text-amber-600'
                  }`}
                >
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
                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {updatingBot ? '...' : conversation?.bot_status === 'active' ? 'Pausar IA' : 'Ativar IA'}
              </button>
            </div>

            {/* Histórico de Alocações Anteriores */}
            {allocations && allocations.length > 0 && (
              <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                  <History className="w-3.5 h-3.5 text-slate-400" />
                  <span>Histórico de Alocações</span>
                </div>
                <div className="space-y-1.5">
                  {allocations.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="text-[11px] p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                    >
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
              <div className="pt-1">
                <Link
                  href={`/inbox/automations?client=${encodeURIComponent(worker.cliente)}&company=${encodeURIComponent(worker.contratante || '')}`}
                  className="w-full py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-2xs"
                >
                  <Megaphone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Criar Campanha para "{worker.cliente}"</span>
                </Link>
              </div>
            )}
          </>
        )}

        {/* TAB 2: TAREFAS & BAIXA (PLAYBOOKS MCS PERSONAL) */}
        {activeTab === 'tarefas' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowResignForm(!showResignForm)
                  setShowTaskForm(false)
                }}
                className="py-2 px-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
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
                className="py-2 px-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>Nova Tarefa</span>
              </button>
            </div>

            {showResignForm && (
              <form
                onSubmit={handleStartResignationFlow}
                className="p-3 rounded-xl bg-purple-50/70 border border-purple-200 space-y-2.5"
              >
                <div className="text-[11px] font-bold text-purple-900">
                  🚪 Pedido de Demissão & Aviso Prévio (15d)
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Cumprirá os 15 dias de Aviso Prévio?
                  </label>
                  <select
                    value={cumprira15Dias ? 'sim' : 'nao'}
                    onChange={(e) => setCumprira15Dias(e.target.value === 'sim')}
                    className="w-full text-xs rounded-lg border border-purple-200 bg-white px-2.5 py-1.5"
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
                    onChange={(e) => setUltimoDia(e.target.value)}
                    className="w-full text-xs rounded-lg border border-purple-200 bg-white px-2.5 py-1.5"
                  />
                </div>

                <div>
                  <input
                    type="text"
                    value={resignNotes}
                    onChange={(e) => setResignNotes(e.target.value)}
                    placeholder="Motivo / Resumo da tentativa de retenção..."
                    className="w-full text-xs rounded-lg border border-purple-200 bg-white px-2.5 py-1.5"
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

            {showTaskForm && (
              <form
                onSubmit={handleCreateDirectTaskFromChat}
                className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-2.5"
              >
                <div className="text-[11px] font-bold text-indigo-900">⚡ Nova Tarefa para Setor ou Pessoa</div>

                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Título da tarefa (ex: Enviar EPI...)"
                  className="w-full text-xs rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5"
                />

                <select
                  value={taskDeptId}
                  onChange={(e) => setTaskDeptId(e.target.value)}
                  className="w-full text-xs rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5"
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
                  onChange={(e) => setTaskUserId(e.target.value)}
                  className="w-full text-xs rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5"
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
                    onChange={(e) => setTaskPriority(e.target.value as any)}
                    className="w-full text-xs rounded-lg border border-indigo-200 bg-white px-2 py-1.5"
                  >
                    <option value="normal">Prioridade Normal</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente 🔥</option>
                  </select>

                  <input
                    type="datetime-local"
                    value={taskScheduledFor}
                    onChange={(e) => setTaskScheduledFor(e.target.value)}
                    className="w-full text-[11px] rounded-lg border border-indigo-200 bg-white px-2 py-1.5"
                    title="Programar para data/hora"
                  />
                </div>

                <textarea
                  rows={2}
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  placeholder="Detalhes adicionais..."
                  className="w-full text-xs rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5"
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

            {/* Lista de Tarefas Pendentes */}
            <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block">
                ⚡ Tarefas Pendentes ({workerTasks.length})
              </span>

              {workerTasks.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">Nenhuma tarefa pendente para este trabalhador.</p>
              ) : (
                <div className="space-y-1.5">
                  {workerTasks.map((tItem: any) => (
                    <div
                      key={tItem.id}
                      className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                          {tItem.department?.name || 'Setor'}
                        </span>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1 leading-snug">
                          {tItem.title}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCompleteWorkerTask(tItem.id)}
                        className="p-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 shrink-0 cursor-pointer"
                        title="Concluir tarefa"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB 3: NOTAS INTERNAS */}
        {activeTab === 'notas' && (
          <div className="space-y-3">
            <form onSubmit={handleAddInternalNote} className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
              <label className="block text-[11px] font-bold text-amber-900">
                🔒 Adicionar Nota Interna do Trabalhador
              </label>
              <textarea
                rows={3}
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Escreva uma observação interna (visível apenas para a equipe MCS)..."
                className="w-full text-xs rounded-lg border border-amber-200 bg-white p-2 focus:outline-none"
              />
              <button
                type="submit"
                disabled={savingNote || !newNoteText.trim()}
                className="w-full py-1.5 px-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3 h-3" />
                <span>{savingNote ? 'Salvando...' : 'Salvar Nota Privada'}</span>
              </button>
            </form>

            <div className="space-y-2">
              {internalNotes.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">Nenhuma nota interna registrada nesta conversa.</p>
              ) : (
                internalNotes.map((note) => (
                  <div key={note.id} className="p-3 rounded-xl bg-amber-50/50 border border-amber-200/80 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-amber-800">
                      <span>
                        👤 {note.sender_name || 'Equipe'} {note.sender_department ? `• ${note.sender_department}` : ''}
                      </span>
                      <span>
                        {note.created_at ? new Date(note.created_at).toLocaleDateString('pt-BR') : ''}
                      </span>
                    </div>
                    <p className="text-xs text-amber-950 whitespace-pre-wrap">{note.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 4: AGENDA & FOLLOW-UP */}
        {activeTab === 'agenda' && (
          <div className="space-y-3">
            <form onSubmit={handleAddQuickSchedule} className="p-3 bg-white dark:bg-slate-950 border border-slate-200 rounded-xl space-y-2.5 shadow-xs">
              <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                <span>Agendar Retorno / Lembrete</span>
              </div>

              <input
                type="text"
                required
                value={scheduleTitle}
                onChange={(e) => setScheduleTitle(e.target.value)}
                placeholder="Ex: Confirmar assinatura do contrato..."
                className="w-full text-xs rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"
              />

              <input
                type="datetime-local"
                required
                value={scheduleDateTime}
                onChange={(e) => setScheduleDateTime(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"
              />

              <button
                type="submit"
                disabled={savingSchedule}
                className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                {savingSchedule ? 'Agendando...' : 'Agendar Follow-up'}
              </button>
            </form>

            <div className="p-3 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                📅 Próximos Compromissos ({scheduledTasks.length})
              </span>
              {scheduledTasks.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">Nenhum retorno programado.</p>
              ) : (
                scheduledTasks.map((st: any) => (
                  <div key={st.id} className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                    <p className="font-bold text-slate-800">{st.title}</p>
                    <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                      ⏰ {new Date(st.scheduled_for).toLocaleString('pt-BR')}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
