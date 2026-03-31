"use client"
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { CalendarHeart, Search, Clock, MessageCircle, AlertCircle } from 'lucide-react'
import { format, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Link from 'next/link'

export default function AgendaPage() {
  const [appointments, setAppointments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAgenda() {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id
      if (!userId) { setLoading(false); return }

      // Get user role
      const { data: mcsUser } = await supabase.from('mcs_users').select('role').eq('id', userId).single()
      const isAdmin = mcsUser?.role === 'super_admin' || mcsUser?.role === 'admin' || mcsUser?.role === 'manager'

      let query = supabase
        .from('chat_appointments')
        .select(`
          *,
          conversation:chat_conversations (
            *
          )
        `)
        .order('scheduled_at', { ascending: true })

      if (!isAdmin) {
        query = query.eq('user_id', userId)
      }

      const { data, error } = await query
      if (data) setAppointments(data)
      setLoading(false)
    }

    fetchAgenda()
  }, [])

  const pendingAppointments = appointments.filter(a => a.status === 'pending')
  const completedAppointments = appointments.filter(a => parseInt(a.status) === 0 ? false : a.status === 'completed')

  return (
    <div className="flex-1 flex flex-col bg-slate-50/50 relative h-full">
      <div className="h-20 flex-shrink-0 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-6 flex items-center justify-between shadow-[0_4px_24px_-12px_rgba(0,0,0,0.05)] z-20 sticky top-0">
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-amber-200 rotate-3 hover:rotate-0 transition-transform duration-300">
             <CalendarHeart className="w-6 h-6" />
           </div>
           <div>
             <h2 className="font-bold text-slate-800 text-lg tracking-tight leading-tight">
               Agenda de Atendimentos
             </h2>
             <p className="text-xs font-medium text-slate-500 mt-0.5">Gerencie seus retornos agendados</p>
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full">
        {loading ? (
           <p className="text-center text-slate-400 mt-10 text-sm">Carregando agendamentos...</p>
        ) : (
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
             {/* Pendentes */}
             <div className="space-y-4">
                <h3 className="text-sm font-bold text-amber-600 uppercase tracking-widest flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Retornos Pendentes ({pendingAppointments.length})
                </h3>
                
                {pendingAppointments.length === 0 ? (
                  <div className="bg-white rounded-2xl p-8 border border-slate-100 text-center shadow-sm">
                    <p className="text-sm text-slate-500">Nenhum retorno pendente.</p>
                  </div>
                ) : (
                  pendingAppointments.map(app => (
                    <div key={app.id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                       <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500 group-hover:bg-amber-400 transition-colors"></div>
                       <div className="p-5 pl-7">
                         <div className="flex justify-between items-start mb-2">
                           <h4 className="font-bold text-slate-800">{app.title}</h4>
                           <span className="text-[10px] font-bold bg-amber-50 text-amber-600 px-2 py-0.5 rounded uppercase tracking-wider">
                             Pendente
                           </span>
                         </div>
                         <div className="text-sm text-slate-600 mb-4 line-clamp-2" dangerouslySetInnerHTML={{ __html: app.notes || '' }} />
                         
                         <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-3">
                            <div className="flex items-center gap-3">
                              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-50 px-2 py-1 rounded-md">
                                <Clock className="w-3.5 h-3.5" />
                                {format(new Date(app.scheduled_at), "dd MMM • HH:mm", { locale: ptBR })}
                              </span>
                            </div>
                            
                            <Link href={`/inbox/${app.conversation_id}`} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-lg text-xs font-bold transition-colors">
                               <MessageCircle className="w-3.5 h-3.5" />
                               Abrir Chat
                            </Link>
                         </div>
                       </div>
                    </div>
                  ))
                )}
             </div>

             {/* Concluídos */}
             <div className="space-y-4 opacity-75">
                <h3 className="text-sm font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                  <CalendarHeart className="w-4 h-4" /> Concluídos hoje ({completedAppointments.length})
                </h3>
                
                {completedAppointments.length === 0 ? (
                  <div className="bg-white/50 rounded-2xl p-8 border border-slate-100 text-center border-dashed">
                    <p className="text-sm text-slate-400">Nenhum atendimento finalizado hoje.</p>
                  </div>
                ) : (
                  completedAppointments.map(app => (
                    <div key={app.id} className="bg-white rounded-2xl border border-slate-200/50 shadow-sm relative overflow-hidden">
                       <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500/50"></div>
                       <div className="p-4 pl-6">
                         <div className="flex justify-between items-start mb-2">
                           <h4 className="font-semibold text-slate-600 line-through">{app.title}</h4>
                         </div>
                         <div className="flex items-center gap-3">
                             <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                               <Clock className="w-3 h-3" />
                               {format(new Date(app.scheduled_at), "dd MMM HH:mm", { locale: ptBR })}
                             </span>
                         </div>
                       </div>
                    </div>
                  ))
                )}
             </div>
           </div>
        )}
      </div>
    </div>
  )
}
