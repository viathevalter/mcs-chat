"use client"
import { useState, useEffect } from 'react'
import { Bot, Plus, Trash2, Edit, Save, CheckCircle2, Sparkles, AlertTriangle, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

export default function AIAgentsAdminPage() {
  const [agents, setAgents] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingAgent, setEditingAgent] = useState<any | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const fetchAgentsAndDepts = async () => {
    setLoading(true)
    const { data: ags } = await supabase.from('chat_ai_agents').select('*, department:mcs_departments(*)').order('created_at', { ascending: true })
    const { data: depts } = await supabase.from('mcs_departments').select('*').eq('active', true).order('name', { ascending: true })
    if (ags) setAgents(ags)
    if (depts) setDepartments(depts)
    setLoading(false)
  }

  useEffect(() => {
    fetchAgentsAndDepts()
  }, [])

  const handleSave = async () => {
    if (!editingAgent?.name || !editingAgent?.system_prompt) {
      alert('Nome e Prompt do Sistema são obrigatórios.')
      return
    }

    setIsSaving(true)
    if (editingAgent.id) {
      // Update
      const { error } = await supabase
        .from('chat_ai_agents')
        .update({
          name: editingAgent.name,
          description: editingAgent.description,
          system_prompt: editingAgent.system_prompt,
          rules: editingAgent.rules,
          llm_model: editingAgent.llm_model,
          department_id: editingAgent.department_id || null,
          is_active: editingAgent.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingAgent.id)

      if (error) alert('Erro ao salvar: ' + error.message)
    } else {
      // Create
      const { error } = await supabase
        .from('chat_ai_agents')
        .insert({
          name: editingAgent.name,
          description: editingAgent.description,
          system_prompt: editingAgent.system_prompt,
          rules: editingAgent.rules || [],
          llm_model: editingAgent.llm_model || 'gemini-1.5-flash',
          department_id: editingAgent.department_id || null,
          is_active: true
        })

      if (error) alert('Erro ao criar: ' + error.message)
    }

    setIsSaving(false)
    setEditingAgent(null)
    fetchAgentsAndDepts()
  }

  const handleDelete = async (id: string) => {
    if (confirm('Deseja realmente remover este agente de IA?')) {
      await supabase.from('chat_ai_agents').delete().eq('id', id)
      fetchAgentsAndDepts()
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 relative">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Bot className="w-6 h-6 text-emerald-600" />
            Agentes de IA & Playbooks
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Configure as personas, regras de negócios (adiantamento até dia 10, acidentes, holerites) e handoff para atendentes.
          </p>
        </div>

        <button
          onClick={() => setEditingAgent({
            name: 'Novo Agente de Recepção',
            description: '',
            system_prompt: 'Você é o assistente virtual da empresa...',
            llm_model: 'gemini-1.5-flash',
            rules: [],
            is_active: true
          })}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Agente de IA
        </button>
      </div>

      {/* Modal / Editor de Agente */}
      {editingAgent && (
        <div className="mb-8 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-800 dark:text-white">
              {editingAgent.id ? 'Editar Agente' : 'Criar Novo Agente'}
            </h3>
            <button
              onClick={() => setEditingAgent(null)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Nome do Agente</label>
              <input
                type="text"
                value={editingAgent.name || ''}
                onChange={e => setEditingAgent({ ...editingAgent, name: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                placeholder="Ex: Agente de Recepção Stocco / Geral"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Modelo de IA (LLM)</label>
              <select
                value={editingAgent.llm_model || 'gemini-1.5-flash'}
                onChange={e => setEditingAgent({ ...editingAgent, llm_model: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              >
                <option value="gemini-1.5-flash">Google Gemini 1.5 Flash (Rápido & Econômico)</option>
                <option value="gemini-1.5-pro">Google Gemini 1.5 Pro (Avançado)</option>
                <option value="gpt-4o-mini">OpenAI GPT-4o Mini</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Descrição</label>
            <input
              type="text"
              value={editingAgent.description || ''}
              onChange={e => setEditingAgent({ ...editingAgent, description: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              placeholder="Ex: Atendimento inicial a trabalhadores das 5 empresas"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Prompt do Sistema (Persona e Instruções)</label>
            <textarea
              rows={5}
              value={editingAgent.system_prompt || ''}
              onChange={e => setEditingAgent({ ...editingAgent, system_prompt: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
              placeholder="Instruções de como o bot deve se comportar e responder..."
            />
          </div>

          {/* Salvar Botão */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Salvando...' : 'Salvar Agente'}
            </button>
          </div>
        </div>
      )}

      {/* Lista de Agentes Cadastrados */}
      <div className="space-y-4">
        {loading ? (
          <p className="text-xs text-slate-400">Carregando agentes...</p>
        ) : agents.length === 0 ? (
          <div className="p-8 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-center">
            <p className="text-sm font-semibold text-slate-500">Nenhum agente de IA cadastrado.</p>
          </div>
        ) : (
          agents.map(ag => (
            <div key={ag.id} className="p-5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-start justify-between shadow-sm">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center shrink-0">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-slate-800 dark:text-white">{ag.name}</h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      {ag.llm_model}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{ag.description || 'Sem descrição'}</p>
                  <p className="text-[11px] text-slate-400 mt-2 font-mono line-clamp-2 bg-slate-50 dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    {ag.system_prompt}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingAgent(ag)}
                  className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors"
                  title="Editar"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(ag.id)}
                  className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                  title="Excluir"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
