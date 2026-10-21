"use client"
import Link from 'next/link'
import { useState, useMemo, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Search, Plus, Bot, BotOff, Star, Calendar, Bell, ArrowRightLeft, X, Check } from 'lucide-react'
import { useInbox } from '../hooks/use-inbox'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { NewChatModal } from './new-chat-modal'
import { useI18n } from '@/contexts/i18n-context'
import { supabase } from '@/lib/supabase/client'
import { MCS_QUICK_TAGS, isLightTagColor } from '../constants/mcs-tags-and-transfers'

function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()
    osc1.type = 'sine'
    osc2.type = 'triangle'
    osc1.frequency.setValueAtTime(587.33, now) // D5
    osc1.frequency.setValueAtTime(880, now + 0.14) // A5
    osc2.frequency.setValueAtTime(293.66, now)
    osc2.frequency.setValueAtTime(440, now + 0.14)
    gain.gain.setValueAtTime(0.18, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55)
    osc1.connect(gain)
    osc2.connect(gain)
    gain.connect(ctx.destination)
    osc1.start(now)
    osc2.start(now)
    osc1.stop(now + 0.55)
    osc2.stop(now + 0.55)
  } catch {}
}

type FilterType = 'minhas' | 'favoritos' | 'abertas' | 'todos' | 'fechadas'

function formatPhoneDisplay(rawPhone?: string | null): string {
  if (!rawPhone) return ''
  const clean = rawPhone.replace(/\D/g, '')
  if (!clean) return rawPhone
  if (clean.startsWith('34') && clean.length === 11) {
    return `+34 ${clean.slice(2, 5)} ${clean.slice(5, 7)} ${clean.slice(7, 9)} ${clean.slice(9, 11)}`
  }
  if (clean.startsWith('351') && clean.length === 12) {
    return `+351 ${clean.slice(3, 6)} ${clean.slice(6, 9)} ${clean.slice(9, 12)}`
  }
  if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
    const ddd = clean.slice(2, 4)
    const rest = clean.slice(4)
    return `+55 (${ddd}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`
  }
  return `+${clean}`
}

export default function InboxSidebar() {
  const { t } = useI18n()
  const router = useRouter()
  const {
    conversations,
    departments,
    channels,
    loading,
    currentUserId,
    currentUserDepartmentId,
    selectedDepartmentFilter,
    setSelectedDepartmentFilter,
    refetch
  } = useInbox()
  const params = useParams()
  const activeId = params?.id as string
  const [isModalOpen, setIsModalOpen] = useState(false)

  const [activeFilter, setActiveFilter] = useState<FilterType>('abertas')
  const [audienceFilter, setAudienceFilter] = useState<'all' | 'workers' | 'clients' | 'general'>('all')
  const [companyFilter, setCompanyFilter] = useState<string>('all')
  const [channelIdFilter, setChannelIdFilter] = useState<string>('all')
  const [clientFilter, setClientFilter] = useState<string>('all')
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Real-Time Transfer Notifications State
  const [notifications, setNotifications] = useState<any[]>([])
  const [showNotifMenu, setShowNotifMenu] = useState(false)
  const [liveToastNotif, setLiveToastNotif] = useState<any | null>(null)

  useEffect(() => {
    if (!currentUserId) return

    const loadNotifications = async () => {
      const { data } = await supabase
        .from('chat_notifications')
        .select('*')
        .eq('recipient_user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (data) setNotifications(data)
    }

    loadNotifications()

    const notifChannel = supabase
      .channel(`user_transfer_notifs_${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_notifications',
          filter: `recipient_user_id=eq.${currentUserId}`,
        },
        (payload) => {
          const newNotif = payload.new as any
          setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)])
          setLiveToastNotif(newNotif)
          playNotificationChime()
          refetch()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(notifChannel)
    }
  }, [currentUserId, refetch])

  const unreadNotifCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  )

  const handleOpenNotification = async (notif: any) => {
    await supabase.from('chat_notifications').update({ is_read: true }).eq('id', notif.id)
    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
    )
    setShowNotifMenu(false)
    if (liveToastNotif?.id === notif.id) setLiveToastNotif(null)
    if (notif.conversation_id) {
      router.push(`/inbox/${notif.conversation_id}`)
    }
  }

  const handleMarkAllNotifsRead = async () => {
    if (!currentUserId) return
    await supabase
      .from('chat_notifications')
      .update({ is_read: true })
      .eq('recipient_user_id', currentUserId)
      .eq('is_read', false)
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  // Global worker search (allows Prevenção / Logística / RH to find any worker from Luminous, Wiseowe, Stocco etc.)
  const [globalWorkers, setGlobalWorkers] = useState<any[]>([])
  const [searchingWorkers, setSearchingWorkers] = useState(false)

  useEffect(() => {
    if (searchQuery.trim().length < 3) {
      setGlobalWorkers([])
      setSearchingWorkers(false)
      return
    }
    setSearchingWorkers(true)
    const timer = setTimeout(async () => {
      try {
        const q = searchQuery.trim()
        const { data } = await supabase
          .schema('core_personal')
          .from('workers')
          .select('id, cod_colab, nome, movil, contratante, cliente, funcion, status_trabajador')
          .or(`nome.ilike.%${q}%,movil.ilike.%${q}%,cliente.ilike.%${q}%,contratante.ilike.%${q}%`)
          .limit(8)
        setGlobalWorkers(data || [])
      } catch (e) {
        console.error('Error searching global workers:', e)
      } finally {
        setSearchingWorkers(false)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Helper to resolve conversation audience ('workers' | 'clients' | 'general')
  const resolveConvAudience = (conv: any): 'workers' | 'clients' | 'general' => {
    const chType = conv.channel?.channel_type
    if (chType === 'clients' || chType === 'workers' || chType === 'general') {
      return chType
    }
    const chName = (conv.channel?.name || '').toLowerCase()
    if (chName.includes('cliente')) return 'clients'
    if (chName.includes('centralcars') || chName.includes('safetyprevi')) return 'general'
    return 'workers'
  }

  // Derive unique companies (Wiseowe, Luminous, Stocco, etc.)
  const availableCompanies = useMemo(() => {
    const set = new Set<string>()
    channels.forEach(ch => {
      if (ch.company_name) set.add(ch.company_name.toUpperCase())
    })
    conversations.forEach(c => {
      const comp = c.worker_company_name || c.channel?.company_name
      if (comp) set.add(comp.toUpperCase())
    })
    return Array.from(set).sort()
  }, [conversations, channels])

  // Channels filtered by selected company and audience
  const availableChannels = useMemo(() => {
    return channels.filter(ch => {
      if (companyFilter !== 'all' && (ch.company_name || '').toUpperCase() !== companyFilter) return false
      if (audienceFilter !== 'all' && (ch.channel_type || 'workers') !== audienceFilter) return false
      return true
    })
  }, [channels, companyFilter, audienceFilter])

  // Derive unique clients / obras from conversations
  const availableClients = useMemo(() => {
    const set = new Set<string>()
    conversations.forEach(c => {
      if (c.worker_client_name && c.worker_client_name.trim()) {
        set.add(c.worker_client_name.trim())
      }
    })
    return Array.from(set).sort()
  }, [conversations])

  // Derive available tags (MCS default tags + any custom tags on conversations)
  const availableTags = useMemo(() => {
    const map = new Map<string, string>()
    MCS_QUICK_TAGS.forEach((t) => map.set(t.name, t.color))
    conversations.forEach((c) => {
      if (Array.isArray(c.tags)) {
        c.tags.forEach((tg: any) => {
          if (tg?.name && !map.has(tg.name)) {
            map.set(tg.name, tg.color || '#16a34a')
          }
        })
      }
    })
    return Array.from(map.entries()).map(([name, color]) => ({ name, color }))
  }, [conversations])

  // Derive unique assignees on conversations
  const availableAssignees = useMemo(() => {
    const map = new Map<string, string>()
    conversations.forEach((c) => {
      if (c.assigned_to && c.assigned_to_name) {
        map.set(c.assigned_to, c.assigned_to_name)
      }
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [conversations])

  // Counts for audience pills (only open conversations)
  const audienceCounts = useMemo(() => {
    let all = 0
    let workers = 0
    let clients = 0
    let general = 0
    conversations.forEach(conv => {
      const isClosed = conv.status === 'closed' || conv.status === 'resolved'
      if (isClosed && activeFilter !== 'fechadas') return
      all++
      const aud = resolveConvAudience(conv)
      if (aud === 'workers') workers++
      else if (aud === 'clients') clients++
      else general++
    })
    return { all, workers, clients, general }
  }, [conversations, activeFilter])

  // Counts for tabs
  const tabCounts = useMemo(() => {
    let minhas = 0
    let favoritos = 0
    let abertas = 0
    let todos = 0
    let fechadas = 0

    conversations.forEach(conv => {
      if (audienceFilter !== 'all' && resolveConvAudience(conv) !== audienceFilter) return
      if (companyFilter !== 'all') {
        const comp = (conv.worker_company_name || conv.channel?.company_name || '').toUpperCase()
        if (comp !== companyFilter) return
      }
      if (channelIdFilter !== 'all' && conv.channel_id !== channelIdFilter) return

      const isClosed = conv.status === 'closed' || conv.status === 'resolved'
      if (conv.is_pinned) favoritos++
      if (isClosed) {
        fechadas++
      } else {
        todos++
        if (conv.assigned_to && conv.assigned_to === currentUserId) {
          minhas++
        }
        if (!conv.assigned_to || (currentUserDepartmentId && conv.department_id === currentUserDepartmentId)) {
          abertas++
        }
      }
    })
    return { minhas, favoritos, abertas, todos, fechadas }
  }, [conversations, currentUserId, currentUserDepartmentId, audienceFilter, companyFilter, channelIdFilter])

  const filteredConversations = useMemo(() => {
    const list = conversations.filter(conv => {
      // 1. Audience Filter (Trabalhadores vs Clientes vs Geral)
      if (audienceFilter !== 'all') {
        if (resolveConvAudience(conv) !== audienceFilter) return false
      }

      // 2. Specific WhatsApp Channel Filter
      if (channelIdFilter !== 'all') {
        if (conv.channel_id !== channelIdFilter) return false
      }

      // 3. Department Filter (Dropdown)
      if (selectedDepartmentFilter !== 'all') {
        if (selectedDepartmentFilter === 'unassigned') {
          if (conv.department_id) return false
        } else if (selectedDepartmentFilter === 'my_dept') {
          if (currentUserDepartmentId && conv.department_id !== currentUserDepartmentId) return false
        } else {
          if (conv.department_id !== selectedDepartmentFilter) return false
        }
      }

      // 4. Company Filter (Dropdown)
      if (companyFilter !== 'all') {
        const comp = (conv.worker_company_name || conv.channel?.company_name || '').toUpperCase()
        if (comp !== companyFilter) return false
      }

      // 5. Client / Obra Filter (Dropdown)
      if (clientFilter !== 'all') {
        if ((conv.worker_client_name || '').trim() !== clientFilter) return false
      }

      // 5.1 Tag Filter (Dropdown)
      if (tagFilter !== 'all') {
        const hasTag =
          Array.isArray(conv.tags) &&
          conv.tags.some((t: any) => (t?.name || '').toLowerCase() === tagFilter.toLowerCase())
        if (!hasTag) return false
      }

      // 5.2 Assignee / Attendant Filter (Dropdown)
      if (assigneeFilter !== 'all') {
        if (assigneeFilter === 'me') {
          if (conv.assigned_to !== currentUserId) return false
        } else if (assigneeFilter === 'unassigned') {
          if (conv.assigned_to) return false
        } else {
          if (conv.assigned_to !== assigneeFilter) return false
        }
      }

      // 6. Search Filter (Name, Phone, Last Message, Company, Client, Function, Channel, Tags, Attendant)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const cleanQuery = query.replace(/\D/g, '')
        const matchName = conv.contact_name?.toLowerCase().includes(query)
        const matchPhone =
          conv.contact_phone?.toLowerCase().includes(query) ||
          (cleanQuery.length >= 3 && conv.contact_phone?.replace(/\D/g, '').includes(cleanQuery))
        const matchMsg = (conv.lastMessage || conv.last_message_text || conv.last_message_preview || '').toLowerCase().includes(query)
        const matchCompany = (conv.worker_company_name || conv.channel?.company_name || '').toLowerCase().includes(query)
        const matchClient = (conv.worker_client_name || '').toLowerCase().includes(query)
        const matchFunc = (conv.worker_function_name || '').toLowerCase().includes(query)
        const matchChannel = (conv.channel?.display_label || conv.channel?.name || '').toLowerCase().includes(query)
        const matchAssignee = (conv.assigned_to_name || '').toLowerCase().includes(query)
        const matchTag =
          Array.isArray(conv.tags) &&
          conv.tags.some((t: any) => (t?.name || '').toLowerCase().includes(query))
        if (!matchName && !matchPhone && !matchMsg && !matchCompany && !matchClient && !matchFunc && !matchChannel && !matchAssignee && !matchTag) return false
        return true
      }

      // 7. Status Tab Filter (CRM Pattern)
      const isClosed = conv.status === 'closed' || conv.status === 'resolved'
      if (activeFilter === 'favoritos') {
        return conv.is_pinned === true
      }
      if (activeFilter === 'minhas') {
        return conv.assigned_to === currentUserId && !isClosed
      }
      if (activeFilter === 'abertas') {
        if (isClosed) return false
        return true
      }
      if (activeFilter === 'todos') {
        return !isClosed
      }
      if (activeFilter === 'fechadas') {
        return isClosed
      }

      return true
    })

    // Sempre ordenar pela mensagem mais recente no topo (subindo conversas vivas automaticamente!)
    return [...list].sort((a, b) => {
      const tA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
      const tB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
      return tB - tA
    })
  }, [conversations, audienceFilter, channelIdFilter, selectedDepartmentFilter, companyFilter, clientFilter, tagFilter, assigneeFilter, activeFilter, searchQuery, currentUserId, currentUserDepartmentId])

  const resolveWorkerChannel = (contratante?: string | null) => {
    const workerChannels = channels.filter(ch => (ch.channel_type || 'workers') === 'workers')
    if (contratante) {
      const norm = contratante.trim().toUpperCase()
      const exact = workerChannels.find(ch => (ch.company_name || '').trim().toUpperCase() === norm)
      if (exact) return exact
      const partial = workerChannels.find(
        ch =>
          (ch.company_name || '').toUpperCase().includes(norm) ||
          norm.includes((ch.company_name || '').toUpperCase())
      )
      if (partial) return partial
    }
    return workerChannels[0] || channels[0] || null
  }

  const handleOpenOrCreateWorkerChat = async (worker: any) => {
    const cleanPhone = (worker.movil || '').replace(/\D/g, '')
    if (!cleanPhone) {
      alert('Este trabalhador não possui telefone celular cadastrado na ficha.')
      return
    }

    // 1. Determinar obrigatoriamente o canal oficial da empresa contratante do trabalhador (ex: WISEOWE -> canal WISEOWE)
    const matchedChannel = resolveWorkerChannel(worker.contratante)
    if (!matchedChannel) {
      alert('Nenhum canal WhatsApp ativo encontrado.')
      return
    }

    // 2. Procurar conversa existente DESTE trabalhador ESPECIFICAMENTE no canal correto da empresa dele
    const existingOnCorrectChannel = conversations.find(
      c =>
        c.channel_id === matchedChannel.id &&
        (c.worker_id === worker.id || (cleanPhone.length >= 8 && c.contact_phone?.includes(cleanPhone.slice(-8))))
    )
    if (existingOnCorrectChannel) {
      setSearchQuery('')
      router.push(`/inbox/${existingOnCorrectChannel.id}`)
      return
    }

    // Checar também no banco para evitar duplicata no mesmo canal
    const { data: dbExisting } = await supabase
      .from('chat_conversations')
      .select('id')
      .eq('channel_id', matchedChannel.id)
      .ilike('contact_phone', `%${cleanPhone.slice(-8)}%`)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (dbExisting?.id) {
      await supabase
        .from('chat_conversations')
        .update({
          worker_id: worker.id,
          contact_name: worker.nome,
          worker_company_name: worker.contratante || matchedChannel.company_name || null,
          worker_client_name: worker.cliente || null,
          worker_function_name: worker.funcion || null
        })
        .eq('id', dbExisting.id)
      await refetch()
      setSearchQuery('')
      router.push(`/inbox/${dbExisting.id}`)
      return
    }

    const { data: newConv, error } = await supabase
      .from('chat_conversations')
      .insert({
        channel_id: matchedChannel.id,
        contact_phone: cleanPhone,
        contact_name: worker.nome,
        worker_id: worker.id,
        worker_company_name: worker.contratante || matchedChannel.company_name || null,
        worker_client_name: worker.cliente || null,
        worker_function_name: worker.funcion || null,
        status: 'open',
        unread_count: 0,
        last_message_at: new Date().toISOString()
      })
      .select('id')
      .single()

    if (!error && newConv) {
      await refetch()
      setSearchQuery('')
      router.push(`/inbox/${newConv.id}`)
    }
  }

  return (
    <>
      <aside className="w-[395px] flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col h-full z-40 transition-colors select-none">
        {/* Header estilo CRM */}
        <div className="h-14 px-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h1 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2 tracking-tight">
            <span>Conversas</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold">
              {filteredConversations.length}
            </span>
            <span
              className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"
              title="Fila em Tempo Real Ativa (Live)"
            />
          </h1>
          <div className="flex items-center gap-1.5 relative">
            {/* Sino de Notificações de Transferências Recebidas */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifMenu(!showNotifMenu)}
                className={`p-1.5 rounded-lg border transition-colors flex items-center justify-center relative cursor-pointer ${
                  unreadNotifCount > 0
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs animate-bounce'
                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                }`}
                title="Conversas transferidas para você"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-1 rounded-full bg-rose-500 text-white text-[9.5px] font-extrabold flex items-center justify-center border border-white">
                    {unreadNotifCount}
                  </span>
                )}
              </button>

              {showNotifMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotifMenu(false)} />
                  <div className="absolute top-full right-0 mt-2 w-[340px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden animate-in fade-in zoom-in-95 origin-top-right">
                    <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/60">
                      <div className="flex items-center gap-1.5">
                        <Bell className="w-3.5 h-3.5 text-indigo-600" />
                        <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
                          Transferências Recebidas ({unreadNotifCount})
                        </span>
                      </div>
                      {unreadNotifCount > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllNotifsRead}
                          className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                        >
                          Marcar lidas
                        </button>
                      )}
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400">
                          Nenhuma transferência recebida recentemente.
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => handleOpenNotification(n)}
                            className={`w-full text-left p-3 transition-colors flex items-start gap-2.5 cursor-pointer ${
                              !n.is_read
                                ? 'bg-indigo-50/70 dark:bg-indigo-950/40 hover:bg-indigo-100/70'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                                  {n.contact_name || 'Trabalhador'}
                                </span>
                                {!n.is_read && (
                                  <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                                )}
                              </div>
                              <p className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 mt-0.5">
                                De: <strong>{n.sender_name || 'Colega'}</strong>
                                {n.category ? ` • 📌 ${n.category}` : ''}
                              </p>
                              {n.reason && (
                                <p className="text-[11px] text-slate-600 dark:text-slate-300 italic truncate mt-0.5">
                                  "{n.reason}"
                                </p>
                              )}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <Link
              href="/inbox/agenda"
              className="flex items-center gap-1 px-2.5 py-1.5 bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-800/70 text-orange-700 dark:text-orange-300 rounded-lg text-xs font-bold hover:bg-orange-100 transition-colors"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{t('inboxSidebar', 'agenda')}</span>
            </Link>
            <button
              onClick={() => setIsModalOpen(true)}
              className="p-1.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors flex items-center justify-center shadow-xs cursor-pointer"
              title={t('inboxSidebar', 'newChat')}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Busca + Seletores de Público (Trabalhadores vs Clientes), Empresa, Canal e Setor */}
        <div className="p-3 space-y-2 border-b border-slate-200/70 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar mensagens, trabalhador, cliente ou tel..."
              className="w-full pl-8 pr-7 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-800 dark:text-slate-100 font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Seletor Rápido do Tipo de Canal: Todos | 👷 Trabalhadores | 🏢 Clientes | 🚗 Frota/EPI */}
          <div className="grid grid-cols-4 gap-1 bg-slate-200/60 dark:bg-slate-900 p-1 rounded-xl text-[10.5px] font-bold">
            <button
              type="button"
              onClick={() => { setAudienceFilter('all'); setChannelIdFilter('all') }}
              className={`py-1.5 px-1.5 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                audienceFilter === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
              title="Todos os tipos de canais"
            >
              <span>Todos</span>
              <span className="text-[9.5px] opacity-70">({audienceCounts.all})</span>
            </button>

            <button
              type="button"
              onClick={() => { setAudienceFilter('workers'); setChannelIdFilter('all') }}
              className={`py-1.5 px-1.5 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                audienceFilter === 'workers'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-teal-700'
              }`}
              title="Canais de WhatsApp de Trabalhadores"
            >
              <span>👷 Trab.</span>
              <span className="text-[9.5px] opacity-85">({audienceCounts.workers})</span>
            </button>

            <button
              type="button"
              onClick={() => { setAudienceFilter('clients'); setChannelIdFilter('all') }}
              className={`py-1.5 px-1.5 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                audienceFilter === 'clients'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-purple-700'
              }`}
              title="Canais de WhatsApp de Clientes / Obras"
            >
              <span>🏢 Clientes</span>
              <span className="text-[9.5px] opacity-85">({audienceCounts.clients})</span>
            </button>

            <button
              type="button"
              onClick={() => { setAudienceFilter('general'); setChannelIdFilter('all') }}
              className={`py-1.5 px-1.5 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                audienceFilter === 'general'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-amber-700'
              }`}
              title="Canais Gerais (CentralCars, SafetyPrevi)"
            >
              <span>🚗 Geral</span>
              <span className="text-[9.5px] opacity-85">({audienceCounts.general})</span>
            </button>
          </div>

          {/* Linha de Dropdowns: Empresa + Setor */}
          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={companyFilter}
              onChange={e => {
                setCompanyFilter(e.target.value)
                setChannelIdFilter('all')
              }}
              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-[11px] font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 truncate"
              title="Filtrar por Empresa Contratante"
            >
              <option value="all">🏢 Todas Empresas</option>
              {availableCompanies.map(comp => (
                <option key={comp} value={comp}>
                  🏢 {comp}
                </option>
              ))}
            </select>

            <select
              value={selectedDepartmentFilter}
              onChange={e => setSelectedDepartmentFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-[11px] font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 truncate"
              title="Filtrar por Departamento / Fila"
            >
              <option value="all">📂 Todos Setores</option>
              {currentUserDepartmentId && (
                <option value="my_dept">📍 Meu Departamento</option>
              )}
              {departments.map(dept => (
                <option key={dept.id} value={dept.id}>
                  📂 {dept.name}
                </option>
              ))}
              <option value="unassigned">⚠️ Sem Departamento</option>
            </select>
          </div>

          {/* Linha 2 de Dropdowns: Canal de WhatsApp Específico + Cliente/Obra */}
          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={channelIdFilter}
              onChange={e => setChannelIdFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-[11px] font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 truncate"
              title="Filtrar por Número / Canal de WhatsApp Específico"
            >
              <option value="all">📱 Todos Canais WhatsApp ({availableChannels.length})</option>
              {availableChannels.map(ch => {
                const icon = ch.channel_type === 'clients' ? '🏢' : ch.channel_type === 'general' ? '🚗' : '👷'
                const label = ch.display_label || ch.name
                return (
                  <option key={ch.id} value={ch.id}>
                    {icon} {label} {ch.phone_number ? `(+${ch.phone_number.slice(-4)})` : ''}
                  </option>
                )
              })}
            </select>

            <select
              value={clientFilter}
              onChange={e => setClientFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-[11px] font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 truncate"
              title="Filtrar trabalhadores por Cliente / Obra"
            >
              <option value="all">🏗️ Clientes / Obras ({availableClients.length})</option>
              {availableClients.map(cli => (
                <option key={cli} value={cli}>
                  🏗️ {cli}
                </option>
              ))}
            </select>
          </div>

          {/* Linha 3 de Dropdowns: Etiqueta (Assunto/Especialidade) + Atendente Responsável */}
          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={tagFilter}
              onChange={e => setTagFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-[11px] font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 truncate"
              title="Filtrar por Etiqueta / Assunto (Horário, Seguridade, Nómina, Adiantamento...)"
            >
              <option value="all">🏷️ Todas Etiquetas</option>
              {availableTags.map(tg => (
                <option key={tg.name} value={tg.name}>
                  🏷️ {tg.name}
                </option>
              ))}
            </select>

            <select
              value={assigneeFilter}
              onChange={e => setAssigneeFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-[11px] font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 truncate"
              title="Filtrar por Atendente Responsável"
            >
              <option value="all">👤 Todos Atendentes</option>
              {currentUserId && <option value="me">📥 Minhas Conversas</option>}
              <option value="unassigned">⚠️ Sem Atendente (Fila)</option>
              {availableAssignees.map(asg => (
                <option key={asg.id} value={asg.id}>
                  👤 {asg.name}
                </option>
              ))}
            </select>
          </div>

          {/* Abas de Status no Padrão CRM: Minhas | Favoritos | Abertas | Todos | Fechados */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-800 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setActiveFilter('minhas')}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                activeFilter === 'minhas'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <span>Minhas</span>
              {tabCounts.minhas > 0 && (
                <span className={`px-1 rounded text-[10px] ${activeFilter === 'minhas' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800'}`}>
                  {tabCounts.minhas}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('favoritos')}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                activeFilter === 'favoritos'
                  ? 'bg-amber-500 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
              title="Conversas Favoritas / Fixadas"
            >
              <Star className="w-3 h-3 fill-current" />
              <span>Fav</span>
              {tabCounts.favoritos > 0 && (
                <span className={`px-1 rounded text-[10px] ${activeFilter === 'favoritos' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800'}`}>
                  {tabCounts.favoritos}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('abertas')}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                activeFilter === 'abertas'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <span>Abertas</span>
              <span className={`px-1 rounded text-[10px] ${activeFilter === 'abertas' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800'}`}>
                {tabCounts.todos}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('todos')}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                activeFilter === 'todos'
                  ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              Todos
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('fechadas')}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                activeFilter === 'fechadas'
                  ? 'bg-slate-700 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              Fechados
            </button>
          </div>
        </div>

        {/* Resultados da Busca Global de Trabalhadores */}
        {searchQuery.trim().length >= 3 && globalWorkers.length > 0 && (
          <div className="bg-indigo-50/70 dark:bg-indigo-950/30 border-b border-indigo-200 dark:border-indigo-800/60 px-3 py-2 max-h-48 overflow-y-auto">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 mb-1.5 flex items-center justify-between">
              <span>🔍 Trabalhadores no MCS Personal ({globalWorkers.length})</span>
              {searchingWorkers && <span className="animate-pulse">Buscando...</span>}
            </div>
            <div className="space-y-1">
              {globalWorkers.map(w => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => handleOpenOrCreateWorkerChat(w)}
                  className="w-full text-left p-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-slate-800 border border-indigo-100 dark:border-indigo-900/50 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                  title={`Iniciar ou abrir conversa pelo canal WhatsApp oficial da empresa ${w.contratante || ''}`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                      {w.nome}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 truncate">
                      {w.contratante && <span className="font-bold text-emerald-600">📱 Canal: {w.contratante}</span>}
                      {w.cliente && <span>• 🏗️ {w.cliente}</span>}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-600 text-white rounded-md shrink-0">
                    Conversar via {w.contratante || 'WhatsApp'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Lista de Conversas (Padrão Evoluído CRM IPTV) */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Carregando conversas...
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 space-y-1">
              <p className="font-semibold text-slate-600 dark:text-slate-300">Nenhuma conversa neste filtro</p>
              <p className="text-[11px]">Use os filtros de Público (Trabalhadores / Clientes) ou busque acima.</p>
            </div>
          ) : (
            filteredConversations.map(conv => {
              const isSelected = activeId === conv.id
              const formattedTime = conv.last_message_at
                ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true, locale: ptBR })
                : ''
              const channelCompany = (conv.channel?.company_name || '').toUpperCase()
              const workerCompany = (conv.worker_company_name || '').toUpperCase()
              const companyBadge = channelCompany || workerCompany
              const isChannelMismatch = Boolean(workerCompany && channelCompany && workerCompany !== channelCompany)
              const clientBadge = conv.worker_client_name
              const convAudience = resolveConvAudience(conv)
              const channelLabel = conv.channel?.display_label || conv.channel?.name
              const readableLastMsg = conv.lastMessage || conv.last_message_text || conv.last_message_preview || 'Conversa iniciada'
              const isOutboundLast = (conv.lastMessageDirection || conv.last_message_direction) === 'outbound'
              const unreadCount = Number(conv.unread_count || 0)

              return (
                <Link
                  key={conv.id}
                  href={`/inbox/${conv.id}`}
                  className={`block px-3.5 py-3 transition-colors relative ${
                    isSelected
                      ? 'bg-emerald-50/90 dark:bg-emerald-950/35 border-l-4 border-emerald-500'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className={`relative w-[42px] h-[42px] rounded-full text-white flex items-center justify-center shrink-0 overflow-hidden font-bold text-xs shadow-2xs mt-0.5 ${
                      convAudience === 'clients'
                        ? 'bg-gradient-to-tr from-purple-600 to-indigo-500'
                        : convAudience === 'general'
                          ? 'bg-gradient-to-tr from-amber-600 to-orange-500'
                          : 'bg-gradient-to-tr from-emerald-600 to-teal-500'
                    }`}>
                      <span>{(conv.contact_name || conv.contact_phone || 'U').substring(0, 2).toUpperCase()}</span>
                      {conv.contact_avatar_url && (
                        <img
                          src={conv.contact_avatar_url}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      {/* Linha 1: Nome do Contato + Badges de Canal WhatsApp / Empresa + Tempo */}
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="font-bold text-[13px] text-slate-900 dark:text-slate-100 truncate">
                            {conv.contact_name || formatPhoneDisplay(conv.contact_phone)}
                          </span>
                          {conv.is_pinned && (
                            <span className="text-amber-500 text-[11px] shrink-0" title="Favorito">⭐</span>
                          )}
                          {isChannelMismatch ? (
                            <span
                              className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700 uppercase shrink-0"
                              title={`Atenção: Esta conversa está no número WhatsApp da ${channelCompany}, mas o trabalhador pertence à ${workerCompany}`}
                            >
                              ⚠️ Canal {channelCompany} (Trab: {workerCompany})
                            </span>
                          ) : companyBadge ? (
                            <span
                              className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 uppercase shrink-0"
                              title={`Canal WhatsApp: ${channelLabel || companyBadge}${conv.channel?.phone_number ? ` (+${conv.channel.phone_number})` : ''}`}
                            >
                              📱 {companyBadge}
                            </span>
                          ) : null}
                          {convAudience === 'clients' ? (
                            <span
                              className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0"
                              title={`Canal de Clientes: ${channelLabel || ''}`}
                            >
                              Clientes
                            </span>
                          ) : convAudience === 'general' ? (
                            <span
                              className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 shrink-0"
                              title={`Canal Geral: ${channelLabel || ''}`}
                            >
                              {conv.channel?.name === 'safetyprevi' ? 'EPI' : 'Frota'}
                            </span>
                          ) : (
                            <span
                              className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0"
                              title={`Canal de Trabalhadores: ${channelLabel || ''}`}
                            >
                              Trab.
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0 whitespace-nowrap">
                          {formattedTime}
                        </span>
                      </div>

                      {/* Linha 2: Preview da Última Mensagem Enviada/Recebida (Estilo CRM IPTV com "Você: ...") + Badge Não Lidas */}
                      <div className="flex items-center justify-between gap-2 w-full">
                        <p
                          className={`text-[12px] leading-snug truncate flex-1 min-w-0 ${
                            unreadCount > 0
                              ? 'font-semibold text-slate-900 dark:text-white'
                              : 'text-slate-600 dark:text-slate-300'
                          }`}
                          title={isOutboundLast ? `Você: ${readableLastMsg}` : readableLastMsg}
                        >
                          {isOutboundLast && (
                            <span className="font-semibold text-slate-500 dark:text-slate-400 mr-1">
                              Você:
                            </span>
                          )}
                          {readableLastMsg}
                        </p>
                        {unreadCount > 0 && (
                          <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-extrabold text-white shadow-xs shrink-0">
                            {unreadCount}
                          </span>
                        )}
                      </div>

                      {/* Linha 3: Telefone Formatado + Badges de Obra/Cliente, Setor, Atendente e Tags */}
                      <div className="flex items-center justify-between gap-1.5 pt-0.5">
                        <div className="flex items-center gap-1 flex-wrap min-w-0">
                          <span className="text-[10.5px] font-mono text-slate-400 dark:text-slate-500 mr-1 shrink-0">
                            {formatPhoneDisplay(conv.contact_phone)}
                          </span>

                          {clientBadge && (
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/70 truncate max-w-[130px]"
                              title={`Cliente / Obra: ${clientBadge}`}
                            >
                              🏗️ {clientBadge}
                            </span>
                          )}

                          {conv.department?.name && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-800/70">
                              {conv.department.name}
                            </span>
                          )}

                          {conv.assigned_to_name && (
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded truncate max-w-[120px] ${
                                conv.assigned_to === currentUserId
                                  ? 'bg-indigo-600 text-white shadow-2xs'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                              }`}
                              title={`Em atendimento por: ${conv.assigned_to_name}`}
                            >
                              👤 {conv.assigned_to_name.split('@')[0]}
                            </span>
                          )}

                          {(conv as any).transferred_by_name && conv.assigned_to === currentUserId && (
                            <span
                              className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 whitespace-nowrap"
                              title={
                                (conv as any).transfer_note
                                  ? `Transferida por ${(conv as any).transferred_by_name}: "${(conv as any).transfer_note}"`
                                  : `Transferida por ${(conv as any).transferred_by_name}`
                              }
                            >
                              📥 De {(conv as any).transferred_by_name.split(' ')[0]}
                            </span>
                          )}

                          {Array.isArray(conv.tags) &&
                            conv.tags.slice(0, 3).map((tag: any, idx: number) => {
                              const darkTxt = isLightTagColor(tag.color)
                              return (
                                <span
                                  key={idx}
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold shadow-2xs whitespace-nowrap ${
                                    darkTxt ? 'text-slate-900 border border-black/10' : 'text-white'
                                  }`}
                                  style={{ backgroundColor: tag.color || '#16a34a' }}
                                >
                                  {tag.name}
                                </span>
                              )
                            })}
                        </div>

                        <div className="shrink-0">
                          {conv.bot_status === 'active' ? (
                            <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center gap-0.5">
                              <Bot className="w-2.5 h-2.5" /> IA
                            </span>
                          ) : (
                            <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                              <BotOff className="w-2.5 h-2.5" /> Hum
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })
          )}
        </div>
      </aside>

      {/* Toast Flutuante ao Vivo quando uma conversa é transferida para o usuário logado */}
      {liveToastNotif && (
        <div className="fixed top-4 right-4 z-[100] w-[380px] max-w-[92vw] bg-indigo-950 text-white rounded-2xl shadow-2xl border border-indigo-500/60 p-4 animate-in slide-in-from-top-4 fade-in">
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-indigo-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-md">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="inline-block px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-extrabold uppercase tracking-wider mb-1">
                  🔔 Nova Conversa Transferida para Você
                </span>
                <h4 className="text-sm font-extrabold text-white truncate">
                  {liveToastNotif.contact_name || 'Trabalhador'}
                </h4>
                <p className="text-xs text-indigo-200 mt-0.5">
                  Enviada por <strong>{liveToastNotif.sender_name || 'Colega'}</strong>
                  {liveToastNotif.category ? ` • 📌 ${liveToastNotif.category}` : ''}
                </p>
                {liveToastNotif.reason && (
                  <p className="text-xs italic text-white bg-indigo-900/80 border border-indigo-700 rounded-lg px-2.5 py-1.5 mt-1.5">
                    "{liveToastNotif.reason}"
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLiveToastNotif(null)}
              className="text-indigo-300 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-end gap-2 mt-3 pt-2.5 border-t border-indigo-800/80">
            <button
              type="button"
              onClick={() => setLiveToastNotif(null)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-200 hover:bg-indigo-900 cursor-pointer"
            >
              Depois
            </button>
            <button
              type="button"
              onClick={() => handleOpenNotification(liveToastNotif)}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-extrabold shadow-sm cursor-pointer"
            >
              Abrir Atendimento Agora →
            </button>
          </div>
        </div>
      )}

      <NewChatModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  )
}
