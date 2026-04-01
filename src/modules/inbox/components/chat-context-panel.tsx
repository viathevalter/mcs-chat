"use client"
import { useState, useEffect } from 'react'
import { User, Briefcase, Building, FileText, CheckCircle2, AlertCircle, Loader2, CalendarHeart, Clock, Pencil, Check } from 'lucide-react'
import { useConversationContext } from '../hooks/use-context'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import AgendaForm from './agenda-form'
import { supabase } from '@/lib/supabase/client'
import { useI18n } from '@/contexts/i18n-context'

export default function ChatContextPanel({ conversationId }: { conversationId: string }) {
  const { t } = useI18n()
  const { context, loading } = useConversationContext(conversationId)
  const [activeTab, setActiveTab] = useState<'info' | 'agenda'>('info')
  const [appointments, setAppointments] = useState<any[]>([])

  const [isEditingName, setIsEditingName] = useState(false)
  const [editNameValue, setEditNameValue] = useState('')

  const loadAppointments = async () => {
    const { data } = await supabase
      .from('chat_appointments')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('scheduled_at', { ascending: true })
    if (data) setAppointments(data)
  }

  useEffect(() => {
    if (activeTab === 'agenda') {
      loadAppointments()
    }
  }, [activeTab, conversationId])

  if (loading) {
     return (
       <aside className="w-[420px] flex-shrink-0 bg-white flex flex-col items-center justify-center h-full border-l border-slate-200 hidden lg:flex">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-4" />
          <p className="text-sm text-slate-500">{t('contextPanel', 'loadingContext')}</p>
       </aside>
     )
  }

  if (!context) {
     return (
       <aside className="w-[420px] flex-shrink-0 bg-white flex flex-col items-center p-8 text-center h-full border-l border-slate-200 hidden lg:flex">
          <p className="text-sm text-slate-500">{t('contextPanel', 'noContext')}</p>
       </aside>
     )
  }

  const { worker, conversation } = context

  const handleEditClick = () => {
    setEditNameValue(worker?.nome || conversation?.contact_name || '')
    setIsEditingName(true)
  }

  const handleNameSave = async () => {
    setIsEditingName(false)
    if (!conversation) return
    const newName = editNameValue.trim()
    if (newName && newName !== conversation.contact_name) {
      // Optimistic update of local state before reload
      conversation.contact_name = newName
      await supabase.from('chat_conversations').update({ contact_name: newName }).eq('id', conversationId)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleNameSave()
    if (e.key === 'Escape') setIsEditingName(false)
  }

  return (
    <aside className="w-[420px] flex-shrink-0 bg-white flex flex-col h-full overflow-hidden hidden lg:flex border-l border-slate-200">
      
      {/* Profile Header */}
      <div className="flex flex-col items-center pt-8 pb-6 px-4 bg-gradient-to-b from-slate-50 to-white">
        <div className="relative group">
          <div className="w-24 h-24 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-3xl font-bold shadow-md shadow-emerald-100/50 mb-4 overflow-hidden ring-4 ring-white">
            {conversation?.contact_avatar_url ? (
              <img src={conversation.contact_avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User className="w-10 h-10" />
            )}
          </div>
          
          {/* Sync Avatar Button */}
          <button 
             onClick={async () => {
                try {
                  const btn = document.getElementById('sync-avatar-btn');
                  if (btn) btn.innerHTML = 'Buscando...';
                  await fetch(`/api/chat/sync-avatar?conversationId=${conversationId}`, { method: 'POST' });
                  if (btn) btn.innerHTML = 'Atualizar Tela (F5)';
                } catch (e) {
                  alert("Erro ao buscar imagem. Talvez o número esconda a foto.");
                }
             }}
             id="sync-avatar-btn"
             className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-white text-[10px] text-slate-500 font-medium px-2 py-1 rounded-full border border-slate-200 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-50"
          >
            Baixar Foto
          </button>

          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-4 border-white flex items-center justify-center bg-emerald-500">
            <Check className="w-3 h-3 text-white" />
          </div>
        </div>
        
        {isEditingName ? (
          <input 
            type="text"
            className="text-lg font-bold text-slate-800 text-center border-b-2 border-emerald-500 bg-transparent focus:outline-none mb-1 w-full px-2"
            value={editNameValue}
            onChange={e => setEditNameValue(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        ) : (
          <h2 
            className="text-xl font-bold text-slate-800 tracking-tight text-center cursor-pointer hover:text-emerald-700 transition-colors group flex items-center justify-center gap-1.5"
            onClick={handleEditClick}
            title="Clique para alterar"
          >
            {worker?.nome || conversation?.contact_name || conversation?.contact_phone}
            <Pencil className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-500" />
          </h2>
        )}
        {worker?.ocupacao && <p className="text-sm text-slate-500 font-medium mb-4">{worker.ocupacao}</p>}

        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/50 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          {worker?.estatus || 'Ativo'}
        </span>
      </div>

      {/* Tabs Menu */}
      <div className="px-6 flex items-center border-b border-slate-100 uppercase tracking-widest text-[11px] font-bold">
         <button 
           onClick={() => setActiveTab('info')}
           className={`pb-3 border-b-2 flex-1 transition-colors ${activeTab === 'info' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
         >
           {t('contextPanel', 'overview')}
         </button>
         <button 
           onClick={() => setActiveTab('agenda')}
           className={`pb-3 border-b-2 flex-1 transition-colors ${activeTab === 'agenda' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
         >
           {t('contextPanel', 'agenda')}
         </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto bg-slate-50/50 p-5 space-y-6">
        
        {activeTab === 'info' && (
          <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
            {/* Company Info */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Building className="w-3.5 h-3.5" /> {t('contextPanel', 'companyLink')}
              </h3>
              <div className="bg-white rounded-2xl p-4 border border-slate-200/60 shadow-sm hover:shadow-md transition-shadow space-y-3">
                <div>
                   <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">{t('contextPanel', 'officialCompany')}</p>
                   <p className="text-sm font-semibold text-slate-800">MCS-Chat</p>
                </div>
                <div className="h-px w-full bg-slate-100"></div>
                <div>
                   <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">{t('contextPanel', 'chatStartDate')}</p>
                   <p className="text-sm font-semibold text-slate-700">
                     {conversation?.created_at ? format(new Date(conversation.created_at), "dd MMM yyyy", { locale: ptBR }) : '-'}
                   </p>
                </div>
              </div>
            </div>

            {/* Worksite */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Briefcase className="w-3.5 h-3.5" /> {t('contextPanel', 'lineDetails')}
              </h3>
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 rounded-2xl p-4 border border-emerald-100 shadow-sm hover:shadow-md transition-shadow space-y-3">
                <div>
                   <p className="text-[10px] uppercase tracking-wider text-emerald-600/80 font-bold mb-1">{t('contextPanel', 'ticketStatus')}</p>
                   <p className="text-sm font-bold text-emerald-900 uppercase">{conversation?.status}</p>
                </div>
                <div className="h-px w-full bg-emerald-100/50"></div>
                <div>
                   <p className="text-[10px] uppercase tracking-wider text-emerald-600/80 font-bold mb-1">{t('contextPanel', 'phoneLinked')}</p>
                   <p className="text-sm font-semibold text-emerald-800">{conversation?.contact_phone}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'agenda' && (
          <div className="space-y-6 animate-in slide-in-from-left-4 duration-300 pb-20">
            
            <AgendaForm conversationId={conversationId} onSuccess={loadAppointments} />

            <div className="space-y-3 mt-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <CalendarHeart className="w-3.5 h-3.5" /> {t('contextPanel', 'nextAppointments')}
              </h3>
              
              {appointments.length === 0 ? (
                <p className="text-center text-xs text-slate-400 mt-4 italic">{t('contextPanel', 'noAppointments')}</p>
              ) : (
                appointments.map(app => (
                  <div key={app.id} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm relative overflow-hidden">
                     {app.status === 'pending' && <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>}
                     {app.status === 'completed' && <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>}
                     
                     <div className="flex justify-between items-start mb-2 pl-2">
                       <p className="text-sm font-bold text-slate-800">{app.title}</p>
                       <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500">{app.status}</span>
                     </div>
                     <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 pl-2">
                       <Clock className="w-3.5 h-3.5" />
                       {format(new Date(app.scheduled_at), "dd MMM • HH:mm", { locale: ptBR })}
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
