"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase/client"
import { Shield, Mail, CheckCircle2, XCircle } from "lucide-react"
import { useI18n } from "@/contexts/i18n-context"

interface MCSUser {
  id: string
  email: string
  display_name: string | null
  role: string | null
  active: boolean | null
}

export default function AdminUsersPage() {
  const { t } = useI18n()
  const [users, setUsers] = useState<MCSUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    const { data } = await supabase
      .from("mcs_users")
      .select("id, email, display_name, role, active")
      .order("created_at", { ascending: true })

    if (data) setUsers(data)
    setLoading(false)
  }

  const handleRoleChange = async (userId: string, newRole: string) => {
    // Optimistic UI update
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
    )

    const { error } = await supabase
      .from("mcs_users")
      .update({ role: newRole })
      .eq("id", userId)

    if (error) {
      console.error("Error updating user role:", error)
      // Revert if error
      fetchUsers()
      alert("Erro ao atualizar o nível de acesso.")
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
        return t("adminUsers", "roleSuperAdmin")
      case "admin":
        return t("adminUsers", "roleAdmin")
      case "manager":
        return t("adminUsers", "roleManager")
      default:
        // default maps generally to "agent" or "attendant"
        return t("adminUsers", "roleAgent")
    }
  }

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {t("adminUsers", "title")}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {t("adminUsers", "subtitle")}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto shadow-sm">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-6 py-4 font-bold text-slate-800">
                {t("adminUsers", "tableUser")}
              </th>
              <th className="px-6 py-4 font-bold text-slate-800">
                {t("adminUsers", "tableRole")}
              </th>
              <th className="px-6 py-4 font-bold text-slate-800 text-right">
                {t("adminUsers", "tableStatus")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
               <tr>
                 <td
                   colSpan={3}
                  className="px-6 py-12 text-center text-slate-500 font-medium"
                >
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                    {t("adminUsers", "loading")}
                  </div>
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-6 py-12 text-center text-slate-500 font-medium"
                >
                  {t("adminUsers", "empty")}
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="px-6 py-4 pr-12">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 font-bold border border-slate-200">
                        {user.display_name
                          ? user.display_name.charAt(0).toUpperCase()
                          : user.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-slate-800 truncate">
                          {user.display_name || "Sem Nome"}
                        </span>
                        <div className="flex items-center gap-1.5 text-slate-500 mt-0.5">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="text-xs truncate font-medium">
                            {user.email}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col items-start gap-1">
                      {/* Current Role Visual */}
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${getRoleBadgeColor(
                          user.role
                        )}`}
                      >
                        <Shield className="h-3 w-3" />
                        {formatRoleName(user.role)}
                      </span>
                      {/* Role Selector */}
                      <select
                        value={user.role || "agent"}
                        onChange={(e) =>
                          handleRoleChange(user.id, e.target.value)
                        }
                        className="mt-1 w-[180px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors cursor-pointer"
                      >
                        <option value="super_admin">
                          {t("adminUsers", "roleSuperAdmin")}
                        </option>
                        <option value="admin">
                          {t("adminUsers", "roleAdmin")}
                        </option>
                        <option value="manager">
                          {t("adminUsers", "roleManager")}
                        </option>
                        <option value="agent">
                          {t("adminUsers", "roleAgent")}
                        </option>
                      </select>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {user.active ? (
                      <span className="inline-flex items-center justify-end gap-1.5 text-sm font-bold text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" />
                        {t("adminUsers", "statusActive")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-end gap-1.5 text-sm font-bold text-slate-400">
                        <XCircle className="h-4 w-4" />
                        {t("adminUsers", "statusInactive")}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
