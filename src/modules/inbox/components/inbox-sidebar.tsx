"use client"
import Link from 'next/link'
import { useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { Search, Plus, User, Bot, BotOff, Building2, Layers } from 'lucide-react'
import { useInbox } from '../hooks/use-inbox'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { NewChatModal } from './new-chat-modal'
import { useI18n } from '@/contexts/i18n-context'

type FilterType = 'minhas' | 'favoritos' | 'abertas' | 'todos' | 'fechadas'

export default function InboxSidebar() {
  const { t } = useI18n()
  const { 
    conversations, 
    departments, 
    loading, 
    currentUserId,
    selectedDepartmentFilter,
    setSelectedDepartmentFilter 
  } = useInbox()
  const params = useParams()
  const activeId = params?.id as string
  const [isModalOpen, setIsModalOpen] = useState(false)
  
  const [activeFilter, setActiveFilter] = useState<FilterType>('todos')
  const [channelFilter, setChannelFilter] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // Derive unique channels from current conversation list
  const availableChannels = useMemo(() => {
    const channelsMap = new Map<string, string>()
    conversations.forEach(c => {
      if (c.channel_id && c.channel?.name) {
        channelsMap.set(c.channel_id, c.channel.name)
      }
    })
    return Array.from(channelsMap.entries()).map(([id, name]) => ({ id, name }))
  }, [conversations])

  const filteredConversations = useMemo(() => {
    return conversations.filter(conv => {
      // 1. Department Filter
      if (selectedDepartmentFilter !== 'all') {
        if (selectedDepartmentFilter === 'unassigned') {
          if (conv.department_id) return false
        } else {
          if (conv.department_id !== selectedDepartmentFilter) return false
        }
      }

      // 2. Channel Filter
      if (channelFilter.length > 0 && conv.channel_id && !channelFilter.includes(conv.channel_id)) return false
      
      // 3. Search Filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchName = conv.contact_name?.toLowerCase().includes(query)
        const matchPhone = conv.contact_phone?.toLowerCase().includes(query)
        const matchCompany = conv.channel?.company_name?.toLowerCase().includes(query)
        if (!matchName && !matchPhone && !matchCompany) return false
      }

      // 4. Status Filter
      if (activeFilter === 'favoritos') { return conv.is_pinned === true; }
      if (activeFilter === 'minhas') {
        return conv.assigned_to === currentUserId && conv.status !== 'closed'
      }
      if (activeFilter === 'abertas') {
        return (!conv.assigned_to || conv.assigned_to === null) && conv.status !== 'closed'
      }
      if (activeFilter === 'todos') {
        return conv.status !== 'closed'
      }
      if (activeFilter === 'fechadas') {
        return conv.status === 'closed' || conv.status === 'resolved'
      }
      
      return true
    })
  }, [conversations, selectedDepartmentFilter, activeFilter, channelFilter, searchQuery, currentUserId])

  return (
    <>
    <aside className="w-[370px] flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-chat-surface-bg flex flex-col h-full z-40 transition-colors">
      {/* Header */}
      <div className="h-16 px-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-950">
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          {t('sidebar', 'inbox')}
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
            {filteredConversations.length}
          </span>
        </h1>
        <div className="flex items-center gap-1.5">
           <Link href="/inbox/agenda" className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              {t('inboxSidebar', 'agenda')}
           </Link>
           <button onClick={() => setIsModalOpen(true)} className="p-1.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors flex items-center justify-center" title={t('inboxSidebar', 'newChat')}>
             <Plus className="w-4 h-4" />
           </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-3 border-b border-slate-100 dark:border-slate-800/60 bg-white dark:bg-slate-950">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('inboxSidebar', 'searchPlaceholder')}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-800 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Filtros por Departamento (Abas Rápidas) */}
      <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200/60 dark:border-slate-800 flex items-center gap-1 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setSelectedDepartmentFilter('all')}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
            selectedDepartmentFilter === 'all'
              ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          Todos
        </button>

        {departments.map(dept => (
          <button
            key={dept.id}
            onClick={() => setSelectedDepartmentFilter(dept.id)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
              selectedDepartmentFilter === dept.id
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            {dept.name}
          </button>
        ))}

        <button
          onClick={() => setSelectedDepartmentFilter('unassigned')}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
            selectedDepartmentFilter === 'unassigned'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
          }`}
        >
          Sem Depto
        </button>
      </div>

      {/* Lista de Conversas */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Carregando conversas...
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Nenhuma conversa encontrada neste departamento.
          </div>
        ) : (
          filteredConversations.map(conv => {
            const isSelected = activeId === conv.id
            const formattedTime = conv.last_message_at 
              ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true, locale: ptBR })
              : ''

            return (
              <Link
                key={conv.id}
                href={`/inbox/${conv.id}`}
                className={`block p-3.5 transition-colors relative ${
                  isSelected 
                    ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-l-4 border-emerald-500' 
                    : 'hover:bg-slate-50 dark:hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-slate-200 to-slate-100 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center shrink-0 overflow-hidden font-bold text-slate-600 dark:text-slate-300 text-sm">
                    {conv.contact_avatar_url ? (
                      <img src={conv.contact_avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-slate-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">
                        {conv.contact_name || conv.contact_phone}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">{formattedTime}</span>
                    </div>

                    {/* Badges de Empresa, Departamento e Bot */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {conv.channel?.company_name && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {conv.channel.company_name}
                        </span>
                      )}

                      {conv.department?.name && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                          {conv.department.name}
                        </span>
                      )}

                      {conv.bot_status === 'active' ? (
                        <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center gap-0.5" title="IA Ativa">
                          <Bot className="w-2.5 h-2.5" /> IA
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center gap-0.5" title="Atendimento Humano">
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
