"use client"
import { useState, useEffect } from 'react'
import { User, Briefcase, Building, FileText, CheckCircle2, AlertCircle, Loader2, CalendarHeart, Clock } from 'lucide-react'
import { useConversationContext } from '../hooks/use-context'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import AgendaForm from './agenda-form'
import { supabase } from '@/lib/supabase/client'

export default function ChatContextPanel({ conversationId }: { conversationId: string }) {
  const { context, loading } = useConversationContext(conversationId)
  const [activeTab, setActiveTab] = useState<'info' | 'agenda'>('info')
  const [appointments, setAppointments] = useState<any[]>([])

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
          <p className="text-sm text-slate-500">Carregando contexto HR...</p>
       </aside>
     )
  }

  if (!context) {
     return (
       <aside className="w-[420px] flex-shrink-0 bg-white flex flex-col items-center p-8 text-center h-full border-l border-slate-200 hidden lg:flex">
          <p className="text-sm text-slate-500">Contexto não disponível.</p>
       </aside>
     )
  }

  const { worker, conversation } = context

  return (
    <aside className="w-[420px] flex-shrink-0 bg-white flex flex-col h-full overflow-hidden hidden lg:flex border-l border-slate-200">
      
      {/* Profile Header */}
      <div className="p-8 pb-4 flex flex-col items-center bg-gradient-to-b from-slate-50 to-white">
        <div className="relative mb-4">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-50 flex items-center justify-center text-emerald-500 shadow-sm rotate-3 hover:rotate-0 transition-transform duration-300">
            <User className="w-12 h-12" />
          </div>
          <div className="absolute -bottom-2 -right-2 bg-emerald-500 rounded-full p-1 shadow-md border-2 border-white">
            <CheckCircle2 className="w-4 h-4 text-white" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight text-center">{worker?.nome || conversation?.contact_name || conversation?.contact_phone}</h2>
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
           Visão Geral
         </button>
         <button 
           onClick={() => setActiveTab('agenda')}
           className={`pb-3 border-b-2 flex-1 transition-colors ${activeTab === 'agenda' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
         >
           Agenda
         </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto bg-slate-50/50 p-5 space-y-6">
        
        {activeTab === 'info' && (
          <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
            {/* Company Info */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Building className="w-3.5 h-3.5" /> Vínculo Empregatício
              </h3>
              <div className="bg-white rounded-2xl p-4 border border-slate-200/60 shadow-sm hover:shadow-md transition-shadow space-y-3">
                <div>
                   <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Empresa Oficial</p>
                   <p className="text-sm font-semibold text-slate-800">MCS-Chat</p>
                </div>
                <div className="h-px w-full bg-slate-100"></div>
                <div>
                   <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Data de Início do Chat</p>
                   <p className="text-sm font-semibold text-slate-700">
                     {conversation?.created_at ? format(new Date(conversation.created_at), "dd MMM yyyy", { locale: ptBR }) : '-'}
                   </p>
                </div>
              </div>
            </div>

            {/* Worksite */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Briefcase className="w-3.5 h-3.5" /> Detalhes da Linha
              </h3>
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 rounded-2xl p-4 border border-emerald-100 shadow-sm hover:shadow-md transition-shadow space-y-3">
                <div>
                   <p className="text-[10px] uppercase tracking-wider text-emerald-600/80 font-bold mb-1">Status do Ticket</p>
                   <p className="text-sm font-bold text-emerald-900 uppercase">{conversation?.status}</p>
                </div>
                <div className="h-px w-full bg-emerald-100/50"></div>
                <div>
                   <p className="text-[10px] uppercase tracking-wider text-emerald-600/80 font-bold mb-1">Telefone Vinculado</p>
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
                <CalendarHeart className="w-3.5 h-3.5" /> Próximos Atendimentos
              </h3>
              
              {appointments.length === 0 ? (
                <p className="text-center text-xs text-slate-400 mt-4 italic">Nenhum retorno agendado.</p>
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
