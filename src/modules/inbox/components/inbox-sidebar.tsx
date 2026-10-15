"use client"
import Link from 'next/link'
import { useState, useMemo, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Search, Plus, User, Bot, BotOff, Building2, Briefcase, UserCheck, Star, Calendar } from 'lucide-react'
import { useInbox } from '../hooks/use-inbox'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { NewChatModal } from './new-chat-modal'
import { useI18n } from '@/contexts/i18n-context'
import { supabase } from '@/lib/supabase/client'

type FilterType = 'minhas' | 'favoritos' | 'abertas' | 'todos' | 'fechadas'

export default function InboxSidebar() {
  const { t } = useI18n()
  const router = useRouter()
  const { 
    conversations, 
    departments, 
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
  const [companyFilter, setCompanyFilter] = useState<string>('all')
  const [clientFilter, setClientFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

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

  // Derive unique companies (Wiseowe, Luminous, Stocco, etc.)
  const availableCompanies = useMemo(() => {
    const set = new Set<string>()
    conversations.forEach(c => {
      const comp = c.worker_company_name || c.channel?.company_name
      if (comp) set.add(comp.toUpperCase())
    })
    return Array.from(set).sort()
  }, [conversations])

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

  // Counts for tabs
  const tabCounts = useMemo(() => {
    let minhas = 0
    let favoritos = 0
    let abertas = 0
    let todos = 0
    let fechadas = 0

    conversations.forEach(conv => {
      const isClosed = conv.status === 'closed' || conv.status === 'resolved'
      if (conv.is_pinned) favoritos++
      if (isClosed) {
        fechadas++
      } else {
        todos++
        if (conv.assigned_to && conv.assigned_to === currentUserId) {
          minhas++
        }
        // Abertas: sem dono ou do meu departamento
        if (!conv.assigned_to || (currentUserDepartmentId && conv.department_id === currentUserDepartmentId)) {
          abertas++
        }
      }
    })
    return { minhas, favoritos, abertas, todos, fechadas }
  }, [conversations, currentUserId, currentUserDepartmentId])

  const filteredConversations = useMemo(() => {
    return conversations.filter(conv => {
      // 1. Department Filter (Dropdown)
      if (selectedDepartmentFilter !== 'all') {
        if (selectedDepartmentFilter === 'unassigned') {
          if (conv.department_id) return false
        } else if (selectedDepartmentFilter === 'my_dept') {
          if (currentUserDepartmentId && conv.department_id !== currentUserDepartmentId) return false
        } else {
          if (conv.department_id !== selectedDepartmentFilter) return false
        }
      }

      // 2. Company / Channel Filter (Dropdown)
      if (companyFilter !== 'all') {
        const comp = (conv.worker_company_name || conv.channel?.company_name || '').toUpperCase()
        if (comp !== companyFilter) return false
      }

      // 3. Client / Obra Filter (Dropdown)
      if (clientFilter !== 'all') {
        if ((conv.worker_client_name || '').trim() !== clientFilter) return false
      }
      
      // 4. Search Filter (Name, Phone, Company, Client, Function)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchName = conv.contact_name?.toLowerCase().includes(query)
        const matchPhone = conv.contact_phone?.toLowerCase().includes(query)
        const matchCompany = (conv.worker_company_name || conv.channel?.company_name || '').toLowerCase().includes(query)
        const matchClient = (conv.worker_client_name || '').toLowerCase().includes(query)
        const matchFunc = (conv.worker_function_name || '').toLowerCase().includes(query)
        if (!matchName && !matchPhone && !matchCompany && !matchClient && !matchFunc) return false
        // When actively searching, don't hide results due to status tab unless closed tab is selected
        return true
      }

      // 5. Status Tab Filter (CRM Pattern)
      const isClosed = conv.status === 'closed' || conv.status === 'resolved'
      if (activeFilter === 'favoritos') {
        return conv.is_pinned === true
      }
      if (activeFilter === 'minhas') {
        return conv.assigned_to === currentUserId && !isClosed
      }
      if (activeFilter === 'abertas') {
        if (isClosed) return false
        // Se tem filtro de departamento específico selecionado, respeita ele; caso contrário mostra fila aberta
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
  }, [conversations, selectedDepartmentFilter, companyFilter, clientFilter, activeFilter, searchQuery, currentUserId, currentUserDepartmentId])

  const handleOpenOrCreateWorkerChat = async (worker: any) => {
    const cleanPhone = (worker.movil || '').replace(/\D/g, '')
    const existing = conversations.find(
      c => c.worker_id === worker.id || (cleanPhone.length >= 8 && c.contact_phone?.includes(cleanPhone.slice(-8)))
    )
    if (existing) {
      setSearchQuery('')
      router.push(`/inbox/${existing.id}`)
      return
    }

    if (!cleanPhone) {
      alert('Este trabalhador não possui telefone celular cadastrado na ficha.')
      return
    }

    // Find matching channel for worker's company (or default first active channel)
    const { data: channels } = await supabase
      .from('chat_channels')
      .select('id, name, company_name')
      .eq('status', 'active')

    const matchedChannel =
      channels?.find(ch =>
        worker.contratante && ch.company_name?.toLowerCase().includes(worker.contratante.toLowerCase())
      ) || channels?.[0]

    if (!matchedChannel) {
      alert('Nenhum canal WhatsApp ativo encontrado.')
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
      <aside className="w-[375px] flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col h-full z-40 transition-colors select-none">
        {/* Header estilo CRM */}
        <div className="h-14 px-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h1 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2 tracking-tight">
            <span>Conversas</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold">
              {filteredConversations.length}
            </span>
          </h1>
          <div className="flex items-center gap-1.5">
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

        {/* Busca + Seletores Dropdown Compactos (Fim dos Departamentos Cortados na Horizontal) */}
        <div className="p-3 space-y-2 border-b border-slate-200/70 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar trabalhador, cliente/obra, empresa ou tel..."
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

          {/* Linha de Dropdowns: Empresa (Wiseowe/Luminous/Stocco) + Departamento */}
          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={companyFilter}
              onChange={e => setCompanyFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-[11px] font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 truncate"
              title="Filtrar por Empresa Contratante / Canal"
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
              title="Filtrar por Departamento"
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

          {/* Seletor Dropdown de Cliente / Obra */}
          {availableClients.length > 0 && (
            <div>
              <select
                value={clientFilter}
                onChange={e => setClientFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-[11px] font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 truncate"
                title="Filtrar trabalhadores por Cliente / Obra"
              >
                <option value="all">🏗️ Todos os Clientes / Obras ({availableClients.length})</option>
                {availableClients.map(cli => (
                  <option key={cli} value={cli}>
                    🏗️ {cli}
                  </option>
                ))}
              </select>
            </div>
          )}

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

        {/* Resultados da Busca Global de Trabalhadores (Prevenção / Logística / RH procurando trabalhador de qualquer empresa) */}
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
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                      {w.nome}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 truncate">
                      {w.contratante && <span className="font-bold text-emerald-600">{w.contratante}</span>}
                      {w.cliente && <span>• 🏗️ {w.cliente}</span>}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-600 text-white rounded-md shrink-0">
                    Conversar
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Lista de Conversas */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Carregando conversas...
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 space-y-1">
              <p className="font-semibold text-slate-600 dark:text-slate-300">Nenhuma conversa neste filtro</p>
              <p className="text-[11px]">Use a busca acima para localizar qualquer trabalhador da Wiseowe, Stocco ou Luminous.</p>
            </div>
          ) : (
            filteredConversations.map(conv => {
              const isSelected = activeId === conv.id
              const formattedTime = conv.last_message_at 
                ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true, locale: ptBR })
                : ''
              const companyBadge = conv.worker_company_name || conv.channel?.company_name
              const clientBadge = conv.worker_client_name

              return (
                <Link
                  key={conv.id}
                  href={`/inbox/${conv.id}`}
                  className={`block p-3.5 transition-colors relative ${
                    isSelected 
                      ? 'bg-emerald-50/90 dark:bg-emerald-950/35 border-l-4 border-emerald-500' 
                      : 'hover:bg-slate-50 dark:hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="relative w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shrink-0 overflow-hidden font-bold text-xs shadow-2xs">
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
                      {conv.is_pinned && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-amber-400 text-white rounded-full flex items-center justify-center text-[8px] z-10">
                          ★
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                          {conv.contact_name || conv.contact_phone}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {Number(conv.unread_count) > 0 && (
                            <span className="px-1.5 py-0.5 text-[10px] font-extrabold bg-emerald-500 text-white rounded-full leading-none">
                              {conv.unread_count}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400">{formattedTime}</span>
                        </div>
                      </div>

                      {/* Preview da última mensagem */}
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mb-1.5">
                        {conv.last_message_text || conv.contact_phone}
                      </p>

                      {/* Badges de Empresa (Wiseowe/Luminous/Stocco), Cliente/Obra, Departamento e Atendente do Bloco */}
                      <div className="flex items-center gap-1 flex-wrap">
                        {companyBadge && (
                          <span className="text-[9.5px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 uppercase">
                            {companyBadge}
                          </span>
                        )}

                        {clientBadge && (
                          <span
                            className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60 truncate max-w-[135px]"
                            title={`Cliente / Obra: ${clientBadge}`}
                          >
                            🏗️ {clientBadge}
                          </span>
                        )}

                        {conv.department?.name && (
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                            {conv.department.name}
                          </span>
                        )}

                        {conv.assigned_to_name && (
                          <span
                            className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 truncate max-w-[100px]"
                            title={`Em atendimento por: ${conv.assigned_to_name}`}
                          >
                            👤 {conv.assigned_to_name.split('@')[0]}
                          </span>
                        )}

                        {conv.bot_status === 'active' ? (
                          <span className="text-[9.5px] font-medium px-1 py-0.5 rounded bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center gap-0.5">
                            <Bot className="w-2.5 h-2.5" /> IA
                          </span>
                        ) : (
                          <span className="text-[9.5px] font-medium px-1 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                            <BotOff className="w-2.5 h-2.5" /> Humano
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })
          )}
        </div>
      </aside>

      <NewChatModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  )
}
