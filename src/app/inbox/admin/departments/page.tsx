"use client"
import { useState, useEffect } from 'react'
import { Building2, Plus, Edit, Trash2, CheckCircle2, XCircle, Users, MessageSquare, Save, X, Search, Phone, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

export default function DepartmentsAdminPage() {
  const [departments, setDepartments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingDept, setEditingDept] = useState<any | null>(null)
  const [viewingMembersDept, setViewingMembersDept] = useState<any | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchDepartments = async () => {
    setLoading(true)
    const [
      { data: depts },
      { data: convCounts },
      { data: members },
      { data: channels }
    ] = await Promise.all([
      supabase.from('mcs_departments').select('*').order('name', { ascending: true }),
      supabase.from('chat_conversations').select('department_id, status'),
      supabase.from('mcs_department_members').select('id, department_id, nombrecompleto, usuario, correoempresarial, active, user_id').eq('active', true),
      supabase.from('chat_channels').select('id, name, display_label, department_id, channel_type').eq('is_active', true)
    ])

    if (depts) {
      const countsMap: Record<string, number> = {}
      convCounts?.forEach((c: any) => {
        if (c.department_id && c.status !== 'closed') {
          countsMap[c.department_id] = (countsMap[c.department_id] || 0) + 1
        }
      })

      const membersMap: Record<string, any[]> = {}
      members?.forEach((m: any) => {
        if (m.department_id) {
          if (!membersMap[m.department_id]) membersMap[m.department_id] = []
          membersMap[m.department_id].push(m)
        }
      })

      const channelsMap: Record<string, any[]> = {}
      channels?.forEach((ch: any) => {
        if (ch.department_id) {
          if (!channelsMap[ch.department_id]) channelsMap[ch.department_id] = []
          channelsMap[ch.department_id].push(ch)
        }
      })

      const enriched = depts.map(d => ({
        ...d,
        conversation_count: countsMap[d.id] || 0,
        team_members: membersMap[d.id] || [],
        linked_channels: channelsMap[d.id] || []
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
      const { error } = await supabase
        .from('mcs_departments')
        .update({
          name: editingDept.name.trim(),
          active: editingDept.active !== false
        })
        .eq('id', editingDept.id)

      if (error) alert('Erro ao salvar: ' + error.message)
    } else {
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

  const handleDelete = async (dept: any) => {
    if (confirm(`Deseja desativar o departamento "${dept.name}"? (Sincronizado com o MCS-Personal)`)) {
      const { error } = await supabase.from('mcs_departments').update({ active: false }).eq('id', dept.id)
      if (error) {
        alert('Erro ao desativar: ' + error.message)
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Building2 className="w-6 h-6 text-emerald-600" />
              Departamentos & Filas (Base Unificada MCS)
            </h2>
            <span className="px-2.5 py-0.5 text-[11px] font-extrabold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              🔗 Sincronizado com MCS-Personal
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Estes departamentos são compartilhados em tempo real entre o <strong>MCS-Personal (Operações)</strong> e as <strong>Filas do MCS-Chat</strong>.
          </p>
        </div>

        <button
          onClick={() => setEditingDept({ name: '', active: true })}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-2 transition-colors self-start cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Novo Departamento
        </button>
      </div>

      {/* Modal Visualizar Integrantes do Departamento (do MCS-Personal) */}
      {viewingMembersDept && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-600" />
                  Equipe do Setor: {viewingMembersDept.name}
                </h3>
                <p className="text-xs text-slate-500">Funcionários internos vinculados a este departamento no MCS-Personal</p>
              </div>
              <button onClick={() => setViewingMembersDept(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {viewingMembersDept.team_members.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">
                  Nenhum funcionário interno alocado neste departamento ainda.
                </p>
              ) : (
                viewingMembersDept.team_members.map((m: any) => (
                  <div key={m.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-white">{m.nombrecompleto}</div>
                      <div className="text-[11px] text-slate-500">
                        {m.correoempresarial || m.usuario || 'Sem e-mail'}
                      </div>
                    </div>
                    {m.user_id ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700">
                        Com Login Vinculado
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-slate-200 text-slate-600">
                        Sem Login
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setViewingMembersDept(null)}
                className="px-4 py-2 text-xs font-bold bg-slate-800 text-white rounded-xl"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

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
                Departamento Ativo (visível no MCS-Personal e no MCS-Chat)
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
          <p className="text-xs text-slate-400">Carregando departamentos unificados...</p>
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

                <div className="flex items-center justify-between text-xs text-slate-500 py-2 border-t border-slate-100 dark:border-slate-800/60 mt-2">
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{dept.conversation_count} conversas</span>
                  </div>
                  <button
                    onClick={() => setViewingMembersDept(dept)}
                    className="flex items-center gap-1.5 text-indigo-600 hover:underline font-bold cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>{dept.team_members.length} no time</span>
                  </button>
                </div>

                {dept.linked_channels.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex flex-wrap gap-1">
                    {dept.linked_channels.map((ch: any) => (
                      <span key={ch.id} className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        📱 {ch.display_label || ch.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-800/60 mt-3">
                <button
                  onClick={() => setViewingMembersDept(dept)}
                  className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors cursor-pointer"
                  title="Ver Equipe deste Departamento"
                >
                  <Users className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setEditingDept(dept)}
                  className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors cursor-pointer"
                  title="Editar Nome"
                >
                  <Edit className="w-3.5 h-3.5" />
                </button>
                {dept.active && (
                  <button
                    onClick={() => handleDelete(dept)}
                    className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
                    title="Desativar Departamento"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
