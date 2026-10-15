"use client"
import { useState, useEffect } from 'react'
import { Megaphone, Users, Send, AlertCircle, CheckCircle2, Building2, Briefcase, Sparkles, Loader2, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

export default function AutomationsPage() {
  const [content, setContent] = useState('')
  const [channels, setChannels] = useState<any[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState('')
  const [companies, setCompanies] = useState<string[]>([])
  const [selectedCompany, setSelectedCompany] = useState('')
  const [clients, setClients] = useState<string[]>([])
  const [selectedClient, setSelectedClient] = useState('')
  const [targetType, setTargetType] = useState<'all' | 'company' | 'client'>('client')
  
  const [matchingWorkers, setMatchingWorkers] = useState<any[]>([])
  const [loadingWorkers, setLoadingWorkers] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')

  useEffect(() => {
    // 1. Fetch Channels
    supabase.from('chat_channels').select('*').eq('is_active', true).then(({ data }) => {
      if (data) {
        setChannels(data)
        if (data.length > 0) setSelectedChannelId(data[0].id)
      }
    })

    // 2. Fetch distinct companies & clients from active workers
    supabase.schema('core_personal').from('workers').select('contratante, cliente').eq('status_trabajador', 'Ativo').then(({ data }) => {
      if (data) {
        const emps = Array.from(new Set(data.map(w => w.contratante).filter(Boolean))) as string[]
        const clis = Array.from(new Set(data.map(w => w.cliente).filter(Boolean))) as string[]
        setCompanies(emps.sort())
        setClients(clis.sort())
        if (clis.length > 0) setSelectedClient(clis[0])
        if (emps.length > 0) setSelectedCompany(emps[0])
      }
    })
  }, [])

  // Live query matching workers
  useEffect(() => {
    async function queryWorkers() {
      setLoadingWorkers(true)
      let q = supabase.schema('core_personal').from('workers').select('id, nome, telefono, contratante, cliente, funcion').eq('status_trabajador', 'Ativo')

      if (targetType === 'company' && selectedCompany) {
        q = q.ilike('contratante', `%${selectedCompany}%`)
      } else if (targetType === 'client' && selectedClient) {
        q = q.ilike('cliente', `%${selectedClient}%`)
      }

      const { data } = await q.limit(50)
      if (data) setMatchingWorkers(data)
      setLoadingWorkers(false)
    }

    queryWorkers()
  }, [targetType, selectedCompany, selectedClient])

  const handleDispatch = async () => {
    if (!content.trim() || !selectedChannelId) {
      alert('Preencha a mensagem e selecione o canal de envio.')
      return
    }

    setLoading(true)
    setStatus('idle')

    try {
      const res = await fetch('/api/chat/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: selectedChannelId,
          content,
          targetType,
          company: selectedCompany,
          client: selectedClient
        })
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
    <div className="flex-1 flex w-full h-full min-w-0 bg-slate-50 dark:bg-slate-950 overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full p-8 md:p-12">
        
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-200 dark:shadow-none">
             <Megaphone className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Comunicados Segmentados por Cliente</h1>
            <p className="text-slate-500 text-sm mt-0.5">Substitua os grupos manuais de WhatsApp por envios individuais diretos e organizados.</p>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           
           {/* Left Filters */}
           <div className="lg:col-span-1 space-y-6">
              
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                 <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <Users className="w-4 h-4" /> Segmentação do Público
                 </h3>
                 
                 <div className="space-y-2">
                    <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${targetType === 'client' ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30' : 'border-slate-100 dark:border-slate-800'}`}>
                      <input type="radio" name="target" checked={targetType === 'client'} onChange={() => setTargetType('client')} />
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-white">Por Cliente / Obra</p>
                        <p className="text-[10px] text-slate-500">Trabalhadores alocados no cliente</p>
                      </div>
                    </label>

                    <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${targetType === 'company' ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30' : 'border-slate-100 dark:border-slate-800'}`}>
                      <input type="radio" name="target" checked={targetType === 'company'} onChange={() => setTargetType('company')} />
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-white">Por Empresa Contratante</p>
                        <p className="text-[10px] text-slate-500">Stocco, Luminous, Wiseowe, etc.</p>
                      </div>
                    </label>

                    <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${targetType === 'all' ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30' : 'border-slate-100 dark:border-slate-800'}`}>
                      <input type="radio" name="target" checked={targetType === 'all'} onChange={() => setTargetType('all')} />
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-white">Todos os Ativos</p>
                        <p className="text-[10px] text-slate-500">Base completa de trabalhadores</p>
                      </div>
                    </label>
                 </div>

                 {targetType === 'client' && (
                   <div>
                     <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Selecionar Cliente / Obra</label>
                     <select
                       value={selectedClient}
                       onChange={e => setSelectedClient(e.target.value)}
                       className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                     >
                       {clients.map(cli => (
                         <option key={cli} value={cli}>{cli}</option>
                       ))}
                     </select>
                   </div>
                 )}

                 {targetType === 'company' && (
                   <div>
                     <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Selecionar Empresa</label>
                     <select
                       value={selectedCompany}
                       onChange={e => setSelectedCompany(e.target.value)}
                       className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                     >
                       {companies.map(emp => (
                         <option key={emp} value={emp}>{emp}</option>
                       ))}
                     </select>
                   </div>
                 )}

                 <div>
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Canal WhatsApp de Disparo</label>
                    <select
                      value={selectedChannelId}
                      onChange={e => setSelectedChannelId(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    >
                      {channels.map(ch => (
                        <option key={ch.id} value={ch.id}>
                          {ch.name} ({ch.company_name || 'Geral'})
                        </option>
                      ))}
                    </select>
                 </div>
              </div>

              {/* Destinatários Estimados */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                 <div className="flex items-center justify-between">
                   <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">Destinatários Ativos</h4>
                   <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                     {matchingWorkers.length} trabalhadores
                   </span>
                 </div>

                 <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100 dark:divide-slate-800">
                   {loadingWorkers ? (
                     <p className="text-[11px] text-slate-400">Buscando lista...</p>
                   ) : matchingWorkers.length === 0 ? (
                     <p className="text-[11px] text-slate-400">Nenhum trabalhador ativo neste filtro.</p>
                   ) : (
                     matchingWorkers.map(w => (
                       <div key={w.id} className="pt-1.5 flex items-center justify-between text-[11px]">
                         <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[150px]">{w.nome}</span>
                         <span className="text-slate-400 font-mono text-[10px]">{w.telefono || 's/ fone'}</span>
                       </div>
                     ))
                   )}
                 </div>
              </div>

           </div>

           {/* Right Composer */}
           <div className="lg:col-span-2 space-y-6">
              
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                 <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Mensagem do Comunicado
                 </h3>

                 <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="text-slate-400">Tags dinâmicas:</span>
                    <button onClick={() => setContent(c => c + ' {nome}')} className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md font-mono text-emerald-600 hover:bg-emerald-50">
                      {'{nome}'}
                    </button>
                    <button onClick={() => setContent(c => c + ' {cliente}')} className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md font-mono text-blue-600 hover:bg-blue-50">
                      {'{cliente}'}
                    </button>
                    <button onClick={() => setContent(c => c + ' {empresa}')} className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md font-mono text-purple-600 hover:bg-purple-50">
                      {'{empresa}'}
                    </button>
                 </div>

                 <textarea
                   rows={8}
                   value={content}
                   onChange={e => setContent(e.target.value)}
                   placeholder="Digite a mensagem do comunicado ou lembrete de folha de horas..."
                   className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-800 dark:text-slate-100"
                 />

                 {status === 'success' && (
                   <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 rounded-2xl flex items-center gap-2 text-xs font-semibold">
                     <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                     Comunicado agendado com sucesso! Os disparos estão sendo processados na fila.
                   </div>
                 )}

                 {status === 'error' && (
                   <div className="p-4 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 rounded-2xl flex items-center gap-2 text-xs font-semibold">
                     <AlertCircle className="w-4 h-4 text-rose-600" />
                     Erro ao processar envio do comunicado. Verifique a conexão com a UazAPI.
                   </div>
                 )}

                 <div className="flex justify-end pt-2">
                   <button
                     onClick={handleDispatch}
                     disabled={loading || matchingWorkers.length === 0}
                     className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 transition-colors disabled:opacity-50"
                   >
                     {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                     {loading ? 'Disparando Fila...' : `Enviar para ${matchingWorkers.length} Trabalhadores`}
                   </button>
                 </div>
              </div>

           </div>

        </div>

      </div>
    </div>
  )
}
