"use client"
import Link from 'next/link'
import { useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { Search, Plus, User } from 'lucide-react'
import { useInbox } from '../hooks/use-inbox'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { NewChatModal } from './new-chat-modal'

import { useI18n } from '@/contexts/i18n-context'

type FilterType = 'minhas' | 'favoritos' | 'abertas' | 'todos' | 'fechadas'

export default function InboxSidebar() {
  const { t } = useI18n()
  const { conversations, loading, currentUserId } = useInbox()
  const params = useParams()
  const activeId = params?.id as string
  const [isModalOpen, setIsModalOpen] = useState(false)
  
  const [activeFilter, setActiveFilter] = useState<FilterType>('abertas')
  const [channelFilter, setChannelFilter] = useState<string[]>([])
  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false)
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
      // 1. Channel Filter
      if (channelFilter.length > 0 && conv.channel_id && !channelFilter.includes(conv.channel_id)) return false
      
      // 2. Search Filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchName = conv.contact_name?.toLowerCase().includes(query)
        const matchPhone = conv.contact_phone?.toLowerCase().includes(query)
        if (!matchName && !matchPhone) return false
      }

      // 3. Status Filter
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
  }, [conversations, activeFilter, channelFilter, searchQuery, currentUserId])

  const openCount = conversations.filter(c => (!c.assigned_to || c.assigned_to === null) && c.status !== 'closed').length

  return (
    <>
    <aside className="w-[370px] flex-shrink-0 border-r border-slate-200 dark:border-slate-800 sunset:border-[#ffd5d9] ocean:border-sky-200 bg-chat-surface-bg flex flex-col h-full z-40 transition-colors">
      {/* Header */}
      <div className="h-20 px-4 border-b border-slate-100 dark:border-slate-800 sunset:border-[#ffd5d9] ocean:border-sky-200 flex items-center justify-between shrink-0">
        <h1 className="text-[22px] font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          {t('sidebar', 'inbox')}
        </h1>
        <div className="flex items-center gap-1.5">

           <Link href="/inbox/agenda" className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>
              {t('inboxSidebar', 'agenda')}
           </Link>
           <button onClick={() => setIsModalOpen(true)} className="p-1.5 bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-200 dark:shadow-none rounded-lg transition-colors flex items-center justify-center relative group" title={t('inboxSidebar', 'newChat')}>
             <Plus className="w-4 h-4" />
           </button>
        </div>
      </div>

      {/* Search and Channel Bar */}
      <div className="p-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('inboxSidebar', 'searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
          />
        </div>
        {availableChannels.length > 0 && (
          <div className="relative">
             <button 
               onClick={() => setIsChannelDropdownOpen(!isChannelDropdownOpen)}
               className="w-full flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm px-3 py-2 text-slate-700 font-medium cursor-pointer shadow-sm hover:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
             >
                <div className="flex items-center gap-2">
                   <span className="text-[10px] uppercase font-bold text-slate-400 select-none shrink-0">{t('inboxSidebar', 'channel')}:</span>
                   <span className="text-[13px] truncate">
                     {channelFilter.length === 0 ? t('inboxSidebar', 'allChannels') : `${channelFilter.length} Selecionados`}
                   </span>
                </div>
                <svg className={`w-4 h-4 text-emerald-600 transition-transform ${isChannelDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
             </button>
             
             {isChannelDropdownOpen && (
               <>
                 <div className="fixed inset-0 z-40" onClick={() => setIsChannelDropdownOpen(false)}></div>
                 <div className="absolute top-full left-0 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl z-50 py-1 max-h-64 overflow-y-auto">
                    <button 
                      onClick={() => { setChannelFilter([]); setIsChannelDropdownOpen(false) }}
                      className="w-full text-left px-3 py-2.5 text-[13px] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors font-semibold border-b border-slate-100 dark:border-slate-800"
                    >
                       💡 {t('inboxSidebar', 'allChannels')}
                    </button>
                    {availableChannels.map(c => {
                       const isSelected = channelFilter.includes(c.id)
                       return (
                         <button 
                           key={c.id} 
                           onClick={(e) => {
                             e.preventDefault()
                             setChannelFilter(prev => isSelected ? prev.filter(id => id !== c.id) : [...prev, c.id])
                           }}
                           className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                         >
                            <div className={`w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 bg-white'}`}>
                               {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <span className={`truncate text-left flex-1 ${isSelected ? 'font-bold text-emerald-800 dark:text-emerald-400' : 'font-medium text-slate-600 dark:text-slate-300'}`}>{c.name}</span>
                         </button>
                       )
                    })}
                 </div>
               </>
             )}
          </div>
        )}
      </div>

      {/* Sub Nav / Filters */}
      <div className="px-4 pt-1 flex flex-nowrap overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] items-center gap-3 text-[12.5px] whitespace-nowrap font-semibold border-b border-slate-100 pb-0">
        <button 
          onClick={() => setActiveFilter('minhas')}
          className={`${activeFilter === 'minhas' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-500 hover:text-emerald-600 border-b-2 border-transparent'} pb-2 transition-colors`}
        >
          {t('inboxSidebar', 'mine')}
        </button>
        <button 
          onClick={() => setActiveFilter('favoritos')}
          className={`${activeFilter === 'favoritos' ? 'text-yellow-600 border-b-2 border-yellow-600' : 'text-slate-500 hover:text-yellow-600 border-b-2 border-transparent'} pb-2 transition-colors flex items-center gap-1`}
        >
          <span className="text-yellow-500 text-[10px]">⭐</span> {t('inboxSidebar', 'favorites') || 'Favoritos'}
        </button>
        <button 
          onClick={() => setActiveFilter('abertas')}
          className={`${activeFilter === 'abertas' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-500 hover:text-emerald-600 border-b-2 border-transparent'} pb-2 transition-colors flex items-center`}
        >
          {t('inboxSidebar', 'open')}
          <span className={`text-[10px] ml-1 px-1.5 py-0.5 rounded-full ${activeFilter === 'abertas' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {openCount}
          </span>
        </button>
        <button 
          onClick={() => setActiveFilter('todos')}
          className={`${activeFilter === 'todos' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-500 hover:text-emerald-600 border-b-2 border-transparent'} pb-2 transition-colors`}
        >
          {t('inboxSidebar', 'all')}
        </button>
        <button 
          onClick={() => setActiveFilter('fechadas')}
          className={`${activeFilter === 'fechadas' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-500 hover:text-emerald-600 border-b-2 border-transparent'} pb-2 transition-colors`}
        >
          {t('inboxSidebar', 'closed')}
        </button>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <p className="text-center text-sm text-slate-400 mt-10">{t('inboxSidebar', 'loading')}</p>
        ) : filteredConversations.length === 0 ? (
          <p className="text-center text-xs text-slate-400 mt-10">{t('inboxSidebar', 'noConversations')}</p>
        ) : (
          filteredConversations.map(conv => (
            <Link key={conv.id} href={`/inbox/${conv.id}`}>
              <div className={`p-3 rounded-lg cursor-pointer transition-colors border group ${activeId === conv.id ? 'bg-emerald-50 border-emerald-100' : 'hover:bg-slate-50 border-transparent hover:border-slate-100'}`}>
                <div className="flex gap-3 items-center">
                 {conv.contact_avatar_url ? (
                   <img src={conv.contact_avatar_url} alt="Avatar" className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200" />
                 ) : (
                   <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0 border border-slate-200 dark:border-slate-700">
                     <User className="w-5 h-5" />
                   </div>
                 )}
                 <div className="flex-1 min-w-0">
                   <div className="flex justify-between items-start mb-1">
                     <h3 className={`font-medium text-sm truncate pr-2 ${activeId === conv.id ? 'text-emerald-900' : 'text-slate-800 dark:text-slate-200'}`}>
                        {conv.contact_name || conv.contact_phone}{conv.is_pinned && <span className="text-yellow-500 text-[10px] ml-1">⭐</span>}
                     </h3>
                     <span className="text-[10px] text-slate-400 whitespace-nowrap pt-1">
                       {conv.last_message_at ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true, locale: ptBR }) : ''}
                     </span>
                   </div>
                   <div className="flex justify-between items-center">
                     <div className="flex items-center gap-2 min-w-0 pr-2">
                       <p className="text-xs text-slate-500 truncate">{conv.contact_phone}</p>
                       {conv.channel && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 max-w-[80px] truncate uppercase" title={`Via ${conv.channel.name}`}>
                             {conv.channel.name}
                          </span>
                       )}
                     </div>
                     {/* Optimistic UI update: hide badge if it's the currently active open conversation wrapper */}
                     {conv.unread_count > 0 && activeId !== conv.id && (
                       <div className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold shadow-sm shrink-0">
                          {conv.unread_count}
                       </div>
                     )}
                   </div>
                 </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </aside>
    <NewChatModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  )
}
