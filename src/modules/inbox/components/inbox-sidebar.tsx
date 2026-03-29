"use client"
import Link from 'next/link'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import { Search, MessageCircle, Plus, Settings } from 'lucide-react'
import { useInbox } from '../hooks/use-inbox'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { NewChatModal } from './new-chat-modal'

export default function InboxSidebar() {
  const { conversations, loading } = useInbox()
  const params = useParams()
  const activeId = params?.id as string
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
    <aside className="w-[340px] flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col h-full z-40 transition-colors">
      {/* Header */}
      <div className="h-20 px-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
        <h1 className="text-[22px] font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          Conversas
        </h1>
        <div className="flex items-center gap-1.5">
           <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>
              Agenda
           </button>
           <button onClick={() => setIsModalOpen(true)} className="p-1.5 bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-200 dark:shadow-none rounded-lg transition-colors flex items-center justify-center relative group" title="Buscar Trabalhador">
             <Plus className="w-4 h-4" />
           </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar colaborador ou telefone..." 
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
          />
        </div>
      </div>

      {/* Sub Nav / Filters */}
      <div className="px-4 pt-1 flex items-center gap-4 text-[13px] font-semibold border-b border-slate-100">
        <span className="text-slate-500 hover:text-indigo-600 cursor-pointer transition-colors pb-3">Minhas</span>
        <span className="text-indigo-600 border-b-2 border-indigo-600 pb-3 cursor-pointer">Abertas <span className="text-[10px] ml-1 bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{conversations.length}</span></span>
        <span className="text-slate-500 hover:text-indigo-600 cursor-pointer transition-colors pb-3">Todos</span>
        <span className="text-slate-500 hover:text-indigo-600 cursor-pointer transition-colors pb-3">Fechadas</span>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <p className="text-center text-sm text-slate-400 mt-10">Carregando conversas...</p>
        ) : conversations.length === 0 ? (
          <p className="text-center text-xs text-slate-400 mt-10">Nenhuma conversa encontrada.</p>
        ) : (
          conversations.map(conv => (
            <Link key={conv.id} href={`/inbox/${conv.id}`}>
              <div className={`p-3 rounded-lg cursor-pointer transition-colors border group ${activeId === conv.id ? 'bg-indigo-50 border-indigo-100' : 'hover:bg-slate-50 border-transparent hover:border-slate-100'}`}>
                 <div className="flex justify-between items-start mb-1">
                   <h3 className={`font-medium text-sm truncate pr-2 ${activeId === conv.id ? 'text-indigo-900' : 'text-slate-800'}`}>
                      {conv.contact_name || conv.contact_phone}
                   </h3>
                   <span className="text-[10px] text-slate-400 whitespace-nowrap pt-1">
                     {conv.last_message_at ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true, locale: ptBR }) : ''}
                   </span>
                 </div>
                 <div className="flex justify-between items-center">
                   <div className="flex items-center gap-2">
                     <p className="text-xs text-slate-500 truncate">{conv.contact_phone}</p>
                     {conv.channel && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 max-w-[80px] truncate uppercase" title={`Via ${conv.channel.name}`}>
                           {conv.channel.name}
                        </span>
                     )}
                   </div>
                   {conv.unread_count > 0 && (
                     <div className="w-4 h-4 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] font-bold shadow-sm shrink-0">
                        {conv.unread_count}
                     </div>
                   )}
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
