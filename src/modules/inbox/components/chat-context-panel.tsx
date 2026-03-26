"use client"
import { User, Briefcase, Building, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useConversationContext } from '../hooks/use-context'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function ChatContextPanel({ conversationId }: { conversationId: string }) {
  const { context, loading } = useConversationContext(conversationId)

  if (loading) {
     return (
       <aside className="w-[340px] flex-shrink-0 bg-white flex flex-col items-center justify-center h-full border-l border-slate-200 hidden lg:flex">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-4" />
          <p className="text-sm text-slate-500">Carregando contexto HR...</p>
       </aside>
     )
  }

  if (!context) {
     return (
       <aside className="w-[340px] flex-shrink-0 bg-white flex flex-col items-center p-8 text-center h-full border-l border-slate-200 hidden lg:flex">
          <p className="text-sm text-slate-500">Contexto não disponível.</p>
       </aside>
     )
  }

  const { worker, conversation } = context

  return (
    <aside className="w-[340px] flex-shrink-0 bg-white flex flex-col h-full overflow-y-auto hidden lg:flex">
      
      {/* Profile Header */}
      <div className="p-8 flex flex-col items-center bg-gradient-to-b from-slate-50 to-white border-b border-slate-100">
        <div className="relative mb-4">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-50 flex items-center justify-center text-indigo-500 shadow-sm rotate-3 hover:rotate-0 transition-transform duration-300">
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

      {/* Details Blocks */}
      <div className="p-5 space-y-6 flex-1 bg-slate-50/50">
        
        {/* Company Info */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <Building className="w-3.5 h-3.5" /> Vínculo Empregatício
          </h3>
          <div className="bg-white rounded-2xl p-4 border border-slate-200/60 shadow-sm hover:shadow-md transition-shadow space-y-3">
            <div>
               <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">Empresa Oficial</p>
               <p className="text-sm font-semibold text-slate-800">Mastercorp S.A.</p>
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
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-2xl p-4 border border-blue-100 shadow-sm hover:shadow-md transition-shadow space-y-3">
            <div>
               <p className="text-[10px] uppercase tracking-wider text-blue-500/80 font-bold mb-1">Status do Ticket</p>
               <p className="text-sm font-bold text-blue-900 uppercase">{conversation?.status}</p>
            </div>
            <div className="h-px w-full bg-blue-100/50"></div>
            <div>
               <p className="text-[10px] uppercase tracking-wider text-blue-500/80 font-bold mb-1">Telefone Vinculado</p>
               <p className="text-sm font-semibold text-blue-800">{conversation?.contact_phone}</p>
            </div>
          </div>
        </div>

      </div>

    </aside>
  )
}
