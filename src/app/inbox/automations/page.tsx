"use client"
import { useState } from 'react'
import { Megaphone, Users, Send, AlertCircle, CheckCircle2, Building2 } from 'lucide-react'

export default function AutomationsPage() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [targetType, setTargetType] = useState('all') // 'all', 'company', 'worksite'

  const handleDispatch = async () => {
    if (!content.trim()) return
    setLoading(true)
    setStatus('idle')

    try {
      const res = await fetch('/api/chat/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, targetType })
      })

      if (!res.ok) throw new Error('Falha ao agendar disparos')
      
      setContent('')
      setStatus('success')
    } catch (err) {
      console.error(err)
      setStatus('error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex w-full h-full min-w-0 bg-slate-50 overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full p-8 md:p-12">
        
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-white shadow-lg shadow-violet-200">
             <Megaphone className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Campanhas Operacionais</h1>
            <p className="text-slate-500 font-medium mt-1">Agende disparos em lote para grupos de colaboradores selecionados.</p>
          </div>
        </div>

        {/* Form Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           
           {/* Left Config */}
           <div className="lg:col-span-1 space-y-6">
              
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                 <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                    <Users className="w-4 h-4" /> Público Alvo
                 </h3>
                 
                 <div className="space-y-3">
                    <label className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${targetType === 'all' ? 'border-violet-500 bg-violet-50' : 'border-slate-100 hover:border-slate-200'}`}>
                      <input type="radio" name="target" checked={targetType === 'all'} onChange={() => setTargetType('all')} className="mt-1" />
                      <div>
                        <p className={`font-bold ${targetType === 'all' ? 'text-violet-900' : 'text-slate-700'}`}>Todos Colaboradores</p>
                        <p className="text-xs text-slate-500 mt-1">Dispara para toda a base ativa.</p>
                      </div>
                    </label>

                    <label className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${targetType === 'company' ? 'border-violet-500 bg-violet-50' : 'border-slate-100 hover:border-slate-200'}`}>
                      <input type="radio" name="target" checked={targetType === 'company'} onChange={() => setTargetType('company')} className="mt-1" />
                      <div>
                        <p className={`font-bold ${targetType === 'company' ? 'text-violet-900' : 'text-slate-700'}`}>Por Empresa</p>
                        <p className="text-xs text-slate-500 mt-1">Em breve: seleção de CNPJ.</p>
                      </div>
                    </label>

                    <label className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${targetType === 'worksite' ? 'border-violet-500 bg-violet-50' : 'border-slate-100 hover:border-slate-200'}`}>
                      <input type="radio" name="target" checked={targetType === 'worksite'} onChange={() => setTargetType('worksite')} className="mt-1" />
                      <div>
                        <p className={`font-bold ${targetType === 'worksite' ? 'text-violet-900' : 'text-slate-700'}`}>Por Obra / Alocação</p>
                        <p className="text-xs text-slate-500 mt-1">Em breve: seleção de Pedido.</p>
                      </div>
                    </label>
                 </div>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-3xl p-6 border border-blue-100 shadow-sm">
                 <h3 className="text-sm font-bold uppercase tracking-widest text-blue-500 mb-2 flex items-center gap-2">
                    <Building2 className="w-4 h-4" /> Alerta de Rate Limit
                 </h3>
                 <p className="text-xs text-blue-800/80 leading-relaxed font-medium">
                   As mensagens agendadas entram na tabela <strong>chat_scheduled_messages</strong> e serão disparadas gradualmente pela fila em background (Cron) para evitar bans do WhatsApp.
                 </p>
              </div>

           </div>

           {/* Right Editor */}
           <div className="lg:col-span-2">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 flex flex-col h-full overflow-hidden">
                 <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="text-lg font-bold text-slate-800">Mensagem da Campanha</h3>
                    <p className="text-sm text-slate-500 mt-1">O conteúdo abaixo será enviado individualmente para todos os trabalhadores selecionados.</p>
                 </div>
                 
                 <div className="flex-1 p-6 relative">
                    <textarea 
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="Olá, *[Nome]*! Este é um lembrete oficial do RH..."
                      className="w-full h-64 p-5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-violet-500/20 focus:border-violet-400 focus:bg-white transition-all text-slate-700 text-base leading-relaxed resize-none"
                    ></textarea>

                    <p className="text-xs text-slate-400 mt-3 font-medium flex justify-end">
                      Suporta variáveis: [Nome], [Empresa] em atualizações futuras.
                    </p>
                 </div>
                 
                 <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      {status === 'success' && (
                         <span className="flex items-center gap-2 text-emerald-600 font-bold text-sm bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                           <CheckCircle2 className="w-4 h-4" /> Lote de disparos criado na fila com sucesso!
                         </span>
                      )}
                      {status === 'error' && (
                         <span className="flex items-center gap-2 text-rose-600 font-bold text-sm bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100">
                           <AlertCircle className="w-4 h-4" /> Ocorreu um erro ao criar lote.
                         </span>
                      )}
                    </div>
                    <button 
                      onClick={handleDispatch}
                      disabled={loading || !content.trim()}
                      className="px-8 py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold rounded-xl shadow-lg shadow-violet-200 hover:shadow-xl hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2"
                    >
                      {loading ? 'Processando...' : 'Agendar Campanha'}
                      {!loading && <Send className="w-4 h-4 ml-1" />}
                    </button>
                 </div>
              </div>
           </div>

        </div>
      </div>
    </div>
  )
}
