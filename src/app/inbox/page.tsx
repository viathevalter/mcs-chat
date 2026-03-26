import { MessageSquare } from 'lucide-react'

export default function InboxBlankPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-white h-full border-r border-slate-200">
      <div className="flex flex-col items-center text-slate-400">
         <div className="w-20 h-20 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mb-6 shadow-sm">
            <MessageSquare className="w-10 h-10 text-slate-300 opacity-80" />
         </div>
         <h2 className="text-xl font-medium text-slate-600">Central de Comunicação RH</h2>
         <p className="mt-2 text-sm text-center max-w-sm">Selecione uma conversa ao lado para iniciar ou continuar o atendimento operacional.</p>
      </div>
    </div>
  )
}
