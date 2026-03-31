"use client"
import { useState, useEffect } from 'react'
import { Plus, Bot, ShieldCheck, Zap, ToggleRight, Trash2, Edit2, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

export default function CaptainDashboard() {
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('gpt-4o')

  const fetchAgents = async () => {
    setLoading(true)
    const { data } = await supabase.from('chat_ai_agents').select('*').order('created_at', { ascending: false })
    if (data) setAgents(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchAgents()
  }, [])

  const handleSave = async () => {
    if (!name || !prompt) return alert('Nome e Prompt são obrigatórios.')

    if (editingId) {
       await supabase.from('chat_ai_agents').update({ name, system_prompt: prompt, model }).eq('id', editingId)
    } else {
       await supabase.from('chat_ai_agents').insert({ name, system_prompt: prompt, model })
    }
    
    setIsEditing(false)
    setEditingId(null)
    setName('')
    setPrompt('')
    setModel('gpt-4o')
    fetchAgents()
  }

  const handleEdit = (agent: any) => {
     setEditingId(agent.id)
     setName(agent.name)
     setPrompt(agent.system_prompt || '')
     setModel(agent.model)
     setIsEditing(true)
  }

  const handleDelete = async (id: string) => {
     if (confirm('Deseja realmente remover este agente? Ele deixará de responder às conversas.')) {
        await supabase.from('chat_ai_agents').delete().eq('id', id)
        fetchAgents()
     }
  }

  const toggleActive = async (agent: any) => {
     await supabase.from('chat_ai_agents').update({ is_active: !agent.is_active }).eq('id', agent.id)
     fetchAgents()
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden w-full">
       <div className="flex flex-col flex-1 p-8 max-w-5xl mx-auto overflow-y-auto">
          
          <div className="flex items-center justify-between mb-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
             <div className="absolute right-0 top-0 bottom-0 w-64 bg-gradient-to-l from-emerald-50 to-transparent pointer-events-none opacity-50"></div>
             <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200 rotate-3">
                   <Bot className="w-8 h-8 -rotate-3" />
                </div>
                <div>
                   <h1 className="text-2xl font-black text-slate-800 tracking-tight">Capitão IA</h1>
                   <p className="text-slate-500 font-medium text-sm mt-1">Orquestre múltiplos agentes inteligentes para atuar no RH em escala.</p>
                </div>
             </div>
             <button 
                onClick={() => { setIsEditing(true); setEditingId(null); setName(''); setPrompt(''); }}
                className="bg-emerald-600 text-white font-bold py-2.5 px-6 rounded-xl shadow-md shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center gap-2 relative z-10"
             >
                <Plus className="w-4 h-4" /> Novo Agente
             </button>
          </div>

          {!isEditing ? (
             <div className="space-y-4">
                {loading ? (
                   <div className="text-slate-400 text-center py-10">Carregando seus agentes...</div>
                ) : agents.length === 0 ? (
                   <div className="p-12 border-2 border-dashed border-slate-200 rounded-3xl text-center flex flex-col items-center justify-center bg-white/50">
                      <Bot className="w-12 h-12 text-slate-300 mb-4" />
                      <h3 className="text-lg font-bold text-slate-700">O quartel está vazio!</h3>
                      <p className="text-slate-500 max-w-md mt-2">Nenhum Agente Virtual de Inteligência Artificial foi criado ainda para automatizar o atendimento.</p>
                   </div>
                ) : (
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {agents.map(agent => (
                         <div key={agent.id} className={`p-6 bg-white rounded-3xl border ${agent.is_active ? 'border-emerald-100 shadow-sm border-l-4 border-l-emerald-500' : 'border-slate-200 opacity-70 border-l-4 border-l-slate-300'} transition-all hover:shadow-md flex flex-col justify-between group`}>
                            <div>
                               <div className="flex items-start justify-between">
                                  <div className="flex items-center gap-3 mb-4">
                                     <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${agent.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                        <Bot className="w-5 h-5" />
                                     </div>
                                     <div>
                                        <h4 className="font-bold text-slate-800 leading-tight">{agent.name}</h4>
                                        <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">Modelo: {agent.model}</span>
                                     </div>
                                  </div>
                                  <button onClick={() => toggleActive(agent)} className={`${agent.is_active ? 'text-emerald-600' : 'text-slate-400'} hover:opacity-80 transition-opacity`} title={agent.is_active ? "Desativar Agente" : "Ativar Agente"}>
                                     <ToggleRight className="w-6 h-6" />
                                  </button>
                               </div>
                               
                               <p className="text-sm text-slate-500 line-clamp-3 mb-6 bg-slate-50 p-3 rounded-xl min-h-[70px]">
                                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">PROMPT INICIAL</span>
                                  {agent.system_prompt || 'Nenhuma instrução definida.'}
                               </p>
                            </div>

                            <div className="flex items-center gap-4 pt-4 border-t border-slate-100 justify-between">
                               <div className="flex items-center gap-3">
                                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded border ${agent.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                                     {agent.is_active ? 'EM OPERAÇÃO' : 'DESATIVADO'}
                                  </span>
                                  <span className="text-[11px] font-bold px-2.5 py-1 rounded border bg-emerald-50 text-emerald-600 border-emerald-100 flex items-center gap-1">
                                     <Zap className="w-3 h-3" /> 0 Funções
                                  </span>
                               </div>
                               
                               <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => handleEdit(agent)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-emerald-50 hover:text-emerald-600 transition-colors">
                                     <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => handleDelete(agent.id)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors">
                                     <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                               </div>
                            </div>
                         </div>
                      ))}
                   </div>
                )}
             </div>
          ) : (
             <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 mt-2 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center gap-3 text-slate-500 mb-6 cursor-pointer hover:text-slate-800 font-medium w-max" onClick={() => setIsEditing(false)}>
                   <ChevronRight className="w-4 h-4 rotate-180" />
                   Voltar para a Lista
                </div>

                <div className="flex items-center gap-4 border-b border-slate-100 pb-6 mb-8">
                   <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-700">
                      <ShieldCheck className="w-6 h-6" />
                   </div>
                   <div>
                      <h2 className="text-xl font-black text-slate-800">{editingId ? 'Editar Agente Inteligente' : 'Treinar Novo Agente'}</h2>
                      <p className="text-slate-500 text-sm">Configure a personalidade e o repertório do seu bot.</p>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                   <div>
                      <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2 block ml-1">Codinome da IA</label>
                      <input 
                         value={name} onChange={e => setName(e.target.value)}
                         className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 outline-none text-slate-800 font-medium transition-all"
                         placeholder="Ex: Capitão DRH"
                      />
                   </div>
                   <div>
                      <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2 block ml-1">Motor de Inferência (LLM)</label>
                      <select 
                         value={model} onChange={e => setModel(e.target.value)}
                         className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 outline-none text-slate-800 font-medium transition-all appearance-none cursor-pointer"
                      >
                         <option value="gpt-4o">OpenAI GPT-4o (Recomendado)</option>
                         <option value="gpt-4o-mini">OpenAI GPT-4o Mini (Mais rápido)</option>
                         <option value="claude-3-5-sonnet">Anthropic Claude 3.5 Sonnet</option>
                      </select>
                   </div>
                   
                   <div className="md:col-span-2">
                       <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2 flex justify-between ml-1">
                          <span>Instrução de Comportamento (System Prompt)</span>
                          <span className="text-emerald-400">ContextWindow ~128K</span>
                       </label>
                       <textarea 
                          value={prompt} onChange={e => setPrompt(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 p-5 rounded-2xl focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 outline-none text-slate-800 font-medium transition-all resize-y min-h-[250px] leading-relaxed"
                          placeholder="Ex: Você é o Capitão DRH, especialista em recursos humanos. Você atende os trabalhadores da Kotrik. Seja cordial e sempre pergunte o CPF."
                       />
                   </div>
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                   <button onClick={() => setIsEditing(false)} className="px-6 py-3 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">
                      Cancelar
                   </button>
                   <button onClick={handleSave} className="px-8 py-3 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-200 transition-all">
                      {editingId ? 'Salvar Configurações' : 'Treinar Agente'}
                   </button>
                </div>
             </div>
          )}

       </div>
    </div>
  )
}
