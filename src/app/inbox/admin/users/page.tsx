"use client"

import { useState, useEffect, useMemo } from "react"
import { supabase } from "@/lib/supabase/client"
import {
  Shield,
  Mail,
  CheckCircle2,
  XCircle,
  Search,
  Edit,
  X,
  Save,
  Building2,
  UserCheck,
  MessageCircle,
  Eye,
  Filter
} from "lucide-react"
import { useI18n } from "@/contexts/i18n-context"

interface MCSUser {
  id: string
  email: string
  display_name: string | null
  role: string | null
  active: boolean | null
  department_id: string | null
  managed_departments: string[] | null
  visibility_mode: string | null
}

interface DepartmentMember {
  id: string
  nombrecompleto: string
  usuario: string | null
  user_id: string | null
  department_id: string | null
  mcs_departments?: { id: string; name: string } | null
}

interface Department {
  id: string
  name: string
}

interface ChannelInfo {
  id: string
  name: string
  display_label: string | null
  company_name: string | null
  channel_type: string | null
  phone_number: string | null
}

export default function AdminUsersPage() {
  const { t } = useI18n()
  const [users, setUsers] = useState<MCSUser[]>([])
  const [employees, setEmployees] = useState<DepartmentMember[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [channels, setChannels] = useState<ChannelInfo[]>([])
  const [channelMembersMap, setChannelMembersMap] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)

  const [searchTerm, setSearchTerm] = useState("")
  const [filterDepartmentId, setFilterDepartmentId] = useState("")

  // Edit Modal State
  const [editingUser, setEditingUser] = useState<MCSUser | null>(null)
  const [formDisplayName, setFormDisplayName] = useState("")
  const [formRole, setFormRole] = useState("agent")
  const [formEmployeeId, setFormEmployeeId] = useState("")
  const [formDepartmentId, setFormDepartmentId] = useState("")
  const [formVisibilityMode, setFormVisibilityMode] = useState("department")
  const [formAllowedChannels, setFormAllowedChannels] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [
      { data: usersData },
      { data: empData },
      { data: deptsData },
      { data: chsData },
      { data: chMemsData }
    ] = await Promise.all([
      supabase
        .from("mcs_users")
        .select("id, email, display_name, role, active, department_id, managed_departments, visibility_mode")
        .order("email", { ascending: true }),
      supabase
        .from("mcs_department_members")
        .select("id, nombrecompleto, usuario, user_id, department_id, mcs_departments(id, name)")
        .eq("active", true)
        .order("nombrecompleto", { ascending: true }),
      supabase
        .from("mcs_departments")
        .select("id, name")
        .eq("active", true)
        .order("name", { ascending: true }),
      supabase
        .from("chat_channels")
        .select("id, name, display_label, company_name, channel_type, phone_number")
        .eq("is_active", true)
        .order("company_name", { ascending: true }),
      supabase
        .from("chat_channel_members")
        .select("user_id, channel_id")
    ])

    if (usersData) setUsers(usersData)
    if (empData) {
      setEmployees(
        empData.map((emp: any) => ({
          ...emp,
          mcs_departments: Array.isArray(emp.mcs_departments) ? emp.mcs_departments[0] : emp.mcs_departments
        }))
      )
    }
    if (deptsData) setDepartments(deptsData)
    if (chsData) setChannels(chsData)

    const map: Record<string, string[]> = {}
    chMemsData?.forEach((m: any) => {
      if (!map[m.user_id]) map[m.user_id] = []
      map[m.user_id].push(m.channel_id)
    })
    setChannelMembersMap(map)
    setLoading(false)
  }

  const openEditModal = (u: MCSUser) => {
    const linkedEmp = employees.find(e => e.user_id === u.id)
    setEditingUser(u)
    setFormDisplayName(u.display_name || linkedEmp?.nombrecompleto || "")
    setFormRole(u.role || "agent")
    setFormEmployeeId(linkedEmp?.id || "")
    setFormDepartmentId(u.department_id || linkedEmp?.department_id || "")
    setFormVisibilityMode(u.visibility_mode || "department")
    setFormAllowedChannels(channelMembersMap[u.id] || [])
  }

  const handleEmployeeSelectChange = (empId: string) => {
    setFormEmployeeId(empId)
    const emp = employees.find(e => e.id === empId)
    if (emp) {
      if (emp.department_id) setFormDepartmentId(emp.department_id)
      if (!formDisplayName && emp.nombrecompleto) setFormDisplayName(emp.nombrecompleto)
    }
  }

  const toggleAllowedChannel = (channelId: string) => {
    setFormAllowedChannels(prev =>
      prev.includes(channelId) ? prev.filter(id => id !== channelId) : [...prev, channelId]
    )
  }

  const handleSaveUser = async () => {
    if (!editingUser) return
    setIsSaving(true)
    try {
      const userId = editingUser.id

      // 1. Update mcs_users (shared with MCS-Personal: sync display_name, name, full_name and department_id)
      const cleanName = formDisplayName.trim() || null
      const { error: uErr } = await supabase
        .from("mcs_users")
        .update({
          display_name: cleanName,
          ...(cleanName ? { name: cleanName, full_name: cleanName } : {}),
          role: formRole,
          department_id: formDepartmentId || null,
          visibility_mode: formVisibilityMode
        })
        .eq("id", userId)

      if (uErr) throw uErr

      // 2. Sync link in mcs_department_members (shared with MCS-Personal)
      await supabase
        .from("mcs_department_members")
        .update({ user_id: null })
        .eq("user_id", userId)

      if (formEmployeeId) {
        await supabase
          .from("mcs_department_members")
          .update({
            user_id: userId,
            ...(cleanName ? { nombrecompleto: cleanName } : {}),
            department_id: formDepartmentId || undefined
          })
          .eq("id", formEmployeeId)
      }

      // 3. Sync chat_channel_members for MCS-Chat
      await supabase
        .from("chat_channel_members")
        .delete()
        .eq("user_id", userId)

      if (formAllowedChannels.length > 0) {
        const rows = formAllowedChannels.map(chId => ({
          user_id: userId,
          channel_id: chId
        }))
        await supabase.from("chat_channel_members").insert(rows)
      }

      setEditingUser(null)
      await fetchAll()
    } catch (e: any) {
      console.error("Error saving user:", e)
      alert("Erro ao salvar configurações do membro: " + (e.message || "Erro"))
    } finally {
      setIsSaving(false)
    }
  }

  const getRoleBadgeColor = (role: string | null) => {
    switch (role) {
      case "super_admin":
        return "bg-purple-100 text-purple-700 border border-purple-200"
      case "admin":
        return "bg-rose-100 text-rose-700 border border-rose-200"
      case "manager":
        return "bg-blue-100 text-blue-700 border border-blue-200"
      default:
        return "bg-emerald-100 text-emerald-700 border border-emerald-200"
    }
  }

  const formatRoleName = (role: string | null) => {
    switch (role) {
      case "super_admin":
        return "SUPER ADMIN"
      case "admin":
        return "ADMIN"
      case "manager":
        return "GERENTE"
      case "operador":
        return "OPERADOR"
      default:
        return "ATENDENTE"
    }
  }

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const linkedEmp = employees.find(e => e.user_id === u.id)
      const deptId = u.department_id || linkedEmp?.department_id || ""
      if (filterDepartmentId && deptId !== filterDepartmentId) return false

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase()
        const matchEmail = u.email?.toLowerCase().includes(q)
        const matchName = u.display_name?.toLowerCase().includes(q)
        const matchEmp = linkedEmp?.nombrecompleto?.toLowerCase().includes(q)
        if (!matchEmail && !matchName && !matchEmp) return false
      }
      return true
    })
  }, [users, employees, filterDepartmentId, searchTerm])

  return (
    <div className="space-y-6 p-8 flex-1 overflow-y-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Equipe & Usuários (Base Unificada MCS)
            </h2>
            <span className="px-2.5 py-0.5 text-[11px] font-extrabold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              🔗 Sincronizado com MCS-Personal
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Mesmos usuários, funcionários internos e departamentos do <strong>MCS-Personal</strong>, com configuração direta dos canais de WhatsApp que cada pessoa atende.
          </p>
        </div>
      </div>

      {/* Barra de Busca e Filtro por Departamento */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, e-mail ou funcionário vinculado..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <div className="w-full sm:w-64">
          <select
            value={filterDepartmentId}
            onChange={e => setFilterDepartmentId(e.target.value)}
            className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">📂 Todos os Departamentos</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>
                📂 {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Modal de Edição Unificada */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-emerald-600" />
                  Configurar Membro da Equipe & Canais de Chat
                </h3>
                <p className="text-xs text-slate-500">{editingUser.email}</p>
              </div>
              <button onClick={() => setEditingUser(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    Nome de Exibição (no Chat e MCS-Personal)
                  </label>
                  <input
                    type="text"
                    value={formDisplayName}
                    onChange={e => setFormDisplayName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    👤 Funcionário Interno Vinculado (MCS-Personal)
                  </label>
                  <select
                    value={formEmployeeId}
                    onChange={e => handleEmployeeSelectChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    <option value="">-- Sem Vínculo --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.nombrecompleto} {emp.mcs_departments?.name ? `(${emp.mcs_departments.name})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    📂 Departamento Principal
                  </label>
                  <select
                    value={formDepartmentId}
                    onChange={e => setFormDepartmentId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    <option value="">Sem Departamento</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    🛡️ Nível de Acesso (Perfil)
                  </label>
                  <select
                    value={formRole}
                    onChange={e => setFormRole(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    <option value="super_admin">Super Admin</option>
                    <option value="admin">Administrador</option>
                    <option value="manager">Gerente</option>
                    <option value="user">Atendente / Colaborador</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    👁️ Visibilidade no Chat
                  </label>
                  <select
                    value={formVisibilityMode}
                    onChange={e => setFormVisibilityMode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    <option value="all">Ver Todas as Conversas</option>
                    <option value="department">Priorizar Meu Departamento</option>
                    <option value="strict_department">Restrito ao Meu Depto & Canais</option>
                  </select>
                </div>
              </div>

              {/* Seleção de Canais de WhatsApp Autorizados */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="font-bold text-slate-800 dark:text-white block">
                      📱 Canais de WhatsApp Atendidos ({formAllowedChannels.length} selecionados)
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Selecione quais números de WhatsApp (Trabalhadores ou Clientes) este membro atende.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFormAllowedChannels(channels.map(c => c.id))}
                      className="text-[11px] font-bold text-emerald-600 hover:underline cursor-pointer"
                    >
                      Marcar Todos
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setFormAllowedChannels([])}
                      className="text-[11px] font-bold text-slate-500 hover:underline cursor-pointer"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-2 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800">
                  {channels.map(ch => {
                    const checked = formAllowedChannels.includes(ch.id)
                    const isClient = ch.channel_type === "clients"
                    return (
                      <label
                        key={ch.id}
                        className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                          checked
                            ? "bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700"
                            : "bg-white dark:bg-slate-900 border-slate-200/70 dark:border-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAllowedChannel(ch.id)}
                            className="rounded text-emerald-600"
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 dark:text-slate-100 truncate">
                              {ch.display_label || ch.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {ch.phone_number ? `+${ch.phone_number}` : ch.name}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`text-[9.5px] font-extrabold px-1.5 py-0.5 rounded shrink-0 ${
                            isClient
                              ? "bg-purple-100 text-purple-700"
                              : ch.channel_type === "general"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-teal-100 text-teal-700"
                          }`}
                        >
                          {isClient ? "🏢 Clientes" : ch.channel_type === "general" ? "🚗 Geral" : "👷 Trab."}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 bg-slate-50/50 dark:bg-slate-900/50 rounded-b-3xl">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveUser}
                disabled={isSaving}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {isSaving ? "Salvando..." : "Salvar Vínculos"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabela Unificada */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
            <tr>
              <th className="px-5 py-3.5 font-bold text-slate-700 dark:text-slate-200">
                Usuário / Login
              </th>
              <th className="px-5 py-3.5 font-bold text-slate-700 dark:text-slate-200">
                Funcionário Vinculado (MCS-Personal)
              </th>
              <th className="px-5 py-3.5 font-bold text-slate-700 dark:text-slate-200">
                Departamento / Setor
              </th>
              <th className="px-5 py-3.5 font-bold text-slate-700 dark:text-slate-200">
                Perfil
              </th>
              <th className="px-5 py-3.5 font-bold text-slate-700 dark:text-slate-200">
                Canais WhatsApp
              </th>
              <th className="px-5 py-3.5 font-bold text-slate-700 dark:text-slate-200 text-right">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-medium">
                  Carregando equipe unificada...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-medium">
                  Nenhum usuário encontrado neste filtro.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const linkedEmp = employees.find(e => e.user_id === user.id)
                const resolvedDeptName =
                  departments.find(d => d.id === user.department_id)?.name ||
                  linkedEmp?.mcs_departments?.name ||
                  null
                const userChannelIds = channelMembersMap[user.id] || []
                const isFullAdmin = user.role === "super_admin" || user.role === "admin"

                return (
                  <tr
                    key={user.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-900/50 transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                          {(user.display_name || user.email || "U").charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                            {user.display_name || linkedEmp?.nombrecompleto || "Sem Nome"}
                          </span>
                          <span className="text-[11px] text-slate-500 truncate">
                            {user.email}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      {linkedEmp ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                          {linkedEmp.nombrecompleto}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Não vinculado</span>
                      )}
                    </td>

                    <td className="px-5 py-3.5">
                      {resolvedDeptName ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200/60">
                          📂 {resolvedDeptName}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getRoleBadgeColor(
                          user.role
                        )}`}
                      >
                        <Shield className="h-3 w-3" />
                        {formatRoleName(user.role)}
                      </span>
                    </td>

                    <td className="px-5 py-3.5">
                      {isFullAdmin && userChannelIds.length === 0 ? (
                        <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                          Todos os Canais (Admin)
                        </span>
                      ) : userChannelIds.length > 0 ? (
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          📱 {userChannelIds.length} {userChannelIds.length === 1 ? "canal" : "canais"}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">Geral / Departamento</span>
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => openEditModal(user)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        Configurar
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
