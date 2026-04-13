"use client"
import { useState, useEffect } from "react"
import { Calendar, BrainCircuit, AlertTriangle, MessageSquare, Loader2, CheckCircle2, Siren } from "lucide-react"
import { supabase } from "@/lib/supabase/client"

export default function AuditAIPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const fetchSummary = async (date: string) => {
    setLoading(true)
    const { data, error } = await supabase
      .from('chat_daily_summaries')
      .select('*')
      .eq('summary_date', date)
      .single()
      
    if (!error && data) {
      setSummary(data)
    } else {
      setSummary(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchSummary(selectedDate)
  }, [selectedDate])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/chat/daily-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate })
      })
      const result = await res.json()
      if (result.success || result.message) {
         await fetchSummary(selectedDate)
      } else {
         alert("Erro: " + result.error)
      }
    } catch (e: any) {
      alert("Erro ao conectar na API.")
    }
    setGenerating(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <BrainCircuit className="w-7 h-7 text-emerald-600" />
            Auditoria por I.A
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Resumo gerencial e radar de riscos das conversas do dia.
          </p>
        </div>
        <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
          <Calendar className="w-5 h-5 text-slate-400 ml-2" />
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border-none bg-transparent outline-none text-sm font-medium text-slate-700 cursor-pointer"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mb-4" />
          <p>Buscando relatórios...</p>
        </div>
      ) : summary?.status === 'completed' ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Top Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Conversas Lidas</span>
              <div className="mt-2 text-3xl font-black text-slate-800 flex items-center gap-2">
                 <MessageSquare className="w-6 h-6 text-blue-500" />
                 {summary.total_conversations}
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Total de Mensagens</span>
              <div className="mt-2 text-3xl font-black text-slate-800 flex items-center gap-2">
                 <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                 {summary.total_messages}
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-slate-500 text-xs font-bold uppercase tracking-wider block">Riscos Identificados</span>
              <div className="mt-2 text-3xl font-black text-slate-800 flex items-center gap-2">
                 <Siren className={`w-6 h-6 ${summary.risks_detected?.length > 0 ? 'text-red-500 animate-pulse' : 'text-slate-300'}`} />
                 <span className={summary.risks_detected?.length > 0 ? "text-red-600" : ""}>{summary.risks_detected?.length || 0}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             {/* Left Column: Summary and Topics */}
             <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-100 pb-3">Visão Geral do Dia</h3>
                  <div className="prose prose-slate prose-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                    {summary.summary}
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-100 pb-3">Assuntos Mais Falados</h3>
                  <div className="space-y-4">
                    {summary.topic_stats?.map((topic: any, idx: number) => (
                      <div key={idx}>
                        <div className="flex justify-between text-sm mb-1 text-slate-700 font-medium">
                          <span>{topic.topic}</span>
                          <span>{topic.percentage}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2.5">
                          <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: `${topic.percentage}%` }}></div>
                        </div>
                      </div>
                    ))}
                    {(!summary.topic_stats || summary.topic_stats.length === 0) && (
                      <p className="text-sm text-slate-500">Nenhum assunto em destaque.</p>
                    )}
                  </div>
                </div>
             </div>

             {/* Right Column: Risk Radar */}
             <div className="space-y-6">
               <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                 <h3 className="text-lg font-bold text-red-600 mb-4 border-b border-red-50 pb-3 flex items-center gap-2">
                   <AlertTriangle className="w-5 h-5" /> Radar de Risco
                 </h3>
                 <div className="space-y-4">
                    {summary.risks_detected?.length > 0 ? (
                      summary.risks_detected.map((risk: any, idx: number) => (
                        <div key={idx} className="bg-red-50/50 p-4 rounded-xl border border-red-100 relative overflow-hidden group">
                           <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                           <span className="inline-block px-2 py-1 bg-red-100 text-red-800 text-[10px] font-bold uppercase rounded mb-2">
                             {risk.type}
                           </span>
                           <p className="text-sm text-slate-800 font-semibold mb-1">{risk.reason}</p>
                           <div className="bg-white/80 p-2.5 rounded text-xs text-slate-600 italic border border-red-50 font-mono line-clamp-3">
                             "{risk.excerpt}"
                           </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8">
                         <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-3">
                           <CheckCircle2 className="w-6 h-6" />
                         </div>
                         <p className="text-slate-600 font-medium">Tudo limpo!</p>
                         <p className="text-xs text-slate-400 mt-1">Nenhum risco detectado pela I.A hoje.</p>
                      </div>
                    )}
                 </div>
               </div>
             </div>
          </div>
        </div>
      ) : (
        <div className="bg-white p-12 rounded-3xl border border-slate-200 shadow-sm text-center">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <BrainCircuit className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">
            Nenhum Relatório para este dia
          </h3>
          <p className="text-slate-500 max-w-md mx-auto mb-8">
            A auditoria inteligente ainda não foi gerada para esta data. Você pode aguardar a varredura automática diária ou gerar manualmente agora.
          </p>
          <button 
             onClick={handleGenerate}
             disabled={generating}
             className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
          >
             {generating ? (
               <><Loader2 className="w-5 h-5 animate-spin" /> Analisando Mensagens...</>
             ) : (
               <><BrainCircuit className="w-5 h-5" /> Gerar Auditoria I.A Agora</>
             )}
          </button>
        </div>
      )}
    </div>
  )
}
