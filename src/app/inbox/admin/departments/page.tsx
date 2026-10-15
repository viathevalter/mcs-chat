"use client"
import { useState, useEffect } from 'react'
import { Building2, Plus, Edit, Trash2, CheckCircle2, XCircle, Users, MessageSquare, Save, X, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

export default function DepartmentsAdminPage() {
  const [departments, setDepartments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingDept, setEditingDept] = useState<any | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchDepartments = async () => {
    setLoading(true)
    const { data: depts } = await supabase
      .from('mcs_departments')
      .select('*')
      .order('name', { ascending: true })

    if (depts) {
      // Also get counts of conversations per department
      const { data: convCounts } = await supabase
        .from('chat_conversations')
        .select('department_id')

      const countsMap: Record<string, number> = {}
      convCounts?.forEach((c: any) => {
        if (c.department_id) {
          countsMap[c.department_id] = (countsMap[c.department_id] || 0) + 1
        }
      })

      const enriched = depts.map(d => ({
        ...d,
        conversation_count: countsMap[d.id] || 0
      }))

      setDepartments(enriched)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchDepartments()
  }, [])

  const handleSave = async () => {
    if (!editingDept?.name?.trim()) {
      alert('O nome do departamento é obrigatório.')
      return
    }

    setIsSaving(true)
    if (editingDept.id) {
      // Update
      const { error } = await supabase
        .from('mcs_departments')
        .update({
          name: editingDept.name.trim(),
          active: editingDept.active !== false
        })
        .eq('id', editingDept.id)

      if (error) alert('Erro ao salvar: ' + error.message)
    } else {
      // Create
      const { error } = await supabase
        .from('mcs_departments')
        .insert({
          name: editingDept.name.trim(),
          active: true
        })

      if (error) alert('Erro ao criar: ' + error.message)
    }

    setIsSaving(false)
    setEditingDept(null)
    fetchDepartments()
  }

  const handleToggleActive = async (dept: any) => {
    const nextState = !dept.active
    await supabase.from('mcs_departments').update({ active: nextState }).eq('id', dept.id)
    fetchDepartments()
  }

  const handleDelete = async (id: string) => {
    if (confirm('Deseja realmente remover este departamento? As conversas vinculadas ficarão sem departamento atribuído.')) {
      const { error } = await supabase.from('mcs_departments').delete().eq('id', id)
      if (error) {
        alert('Erro ao excluir: ' + error.message)
      } else {
        fetchDepartments()
      }
    }
  }

  const filteredDepartments = departments.filter(d => 
    d.name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex-1 overflow-y-auto p-8 relative">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-emerald-600" />
            Departamentos & Filas de Atendimento
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Gerencie os departamentos de atendimento (RH, Financeiro, Logística, Comercial) e o isolamento de chamados.
          </p>
        </div>

        <button
          onClick={() => setEditingDept({ name: '', active: true })}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Departamento
        </button>
      </div>

      {/* Modal / Editor de Departamento */}
      {editingDept && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-800 dark:text-white">
                {editingDept.id ? 'Editar Departamento' : 'Criar Novo Departamento'}
              </h3>
              <button onClick={() => setEditingDept(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Nome do Departamento</label>
              <input
                type="text"
                value={editingDept.name || ''}
                onChange={e => setEditingDept({ ...editingDept, name: e.target.value })}
                placeholder="Ex: Recursos Humanos, Financeiro, Logística..."
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                autoFocus
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="dept-active"
                checked={editingDept.active !== false}
                onChange={e => setEditingDept({ ...editingDept, active: e.target.checked })}
                className="rounded text-emerald-600"
              />
              <label htmlFor="dept-active" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Departamento Ativo
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setEditingDept(null)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Salvando...' : 'Salvar Departamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra de Pesquisa */}
      <div className="mb-6 max-w-sm relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Filtrar departamentos..."
          className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm"
        />
      </div>

      {/* Grid de Departamentos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <p className="text-xs text-slate-400">Carregando departamentos...</p>
        ) : filteredDepartments.length === 0 ? (
          <div className="col-span-full p-8 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-center">
            <p className="text-sm font-semibold text-slate-500">Nenhum departamento encontrado.</p>
          </div>
        ) : (
          filteredDepartments.map(dept => (
            <div
              key={dept.id}
              className={`p-5 bg-white dark:bg-slate-950 border rounded-2xl shadow-sm flex flex-col justify-between transition-all ${
                dept.active 
                  ? 'border-slate-200 dark:border-slate-800 hover:border-emerald-500/50' 
                  : 'border-slate-200/50 opacity-60 bg-slate-50 dark:bg-slate-900/50'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center font-bold">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-white line-clamp-1">{dept.name}</h4>
                      <button
                        onClick={() => handleToggleActive(dept)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 mt-0.5 cursor-pointer ${
                          dept.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {dept.active ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                        {dept.active ? 'Ativo' : 'Inativo'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-500 py-2 border-t border-slate-100 dark:border-slate-800/60 mt-2">
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                    <span>{dept.conversation_count} conversas ativas</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-800/60 mt-3">
                <button
                  onClick={() => setEditingDept(dept)}
                  className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors"
                  title="Editar"
                >
                  <Edit className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(dept.id)}
                  className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                  title="Excluir"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
