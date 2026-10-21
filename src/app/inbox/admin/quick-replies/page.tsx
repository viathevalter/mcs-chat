"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase/client"
import { Plus, Pencil, Trash2, Zap, Loader2, CheckCircle2 } from "lucide-react"
import { useI18n } from "@/contexts/i18n-context"

interface QuickReply {
  id: string
  title: string
  shortcut: string | null
  content: string
}

function slugifyShortcut(text: string): string {
  const slug = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28)
  return slug ? `/${slug}` : "/atalho"
}

export default function QuickRepliesPage() {
  const { t } = useI18n()
  const [replies, setReplies] = useState<QuickReply[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null)
  const [formData, setFormData] = useState({ title: "", shortcut: "", content: "" })
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    fetchReplies()
  }, [])

  const fetchReplies = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("chat_quick_replies")
      .select("*")
      .order("created_at", { ascending: false })

    if (!error && data) {
      setReplies(data)
    }
    setLoading(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t("quickReplies", "confirmDelete"))) return
    const { error } = await supabase.from("chat_quick_replies").delete().eq("id", id)
    if (!error) {
      setReplies((prev) => prev.filter((r) => r.id !== id))
    } else {
      alert("Erro ao excluir mensagem rápida: " + error.message)
    }
  }

  const handleOpenEdit = (reply: QuickReply) => {
    setEditingReply(reply)
    setFormData({
      title: reply.title,
      shortcut: reply.shortcut || "",
      content: reply.content
    })
    setIsModalOpen(true)
  }

  const handleOpenNew = () => {
    setEditingReply(null)
    setFormData({ title: "", shortcut: "", content: "" })
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return

    const title = formData.title.trim()
    const content = formData.content.trim()
    if (!title || !content) return

    let cleanShortcut = formData.shortcut.trim()
    if (!cleanShortcut) {
      cleanShortcut = slugifyShortcut(title)
    } else if (!cleanShortcut.startsWith("/")) {
      cleanShortcut = "/" + cleanShortcut.replace(/\s+/g, "-")
    }

    const payload = {
      title,
      shortcut: cleanShortcut,
      content
    }

    setSaving(true)
    try {
      if (editingReply) {
        const { data, error } = await supabase
          .from("chat_quick_replies")
          .update(payload)
          .eq("id", editingReply.id)
          .select()
          .single()

        if (error) {
          alert("Erro ao atualizar mensagem rápida: " + error.message)
          return
        }
        setReplies((prev) => prev.map((r) => (r.id === editingReply.id ? (data || { ...r, ...payload }) : r)))
        setIsModalOpen(false)
        setFeedback("✅ Mensagem rápida atualizada com sucesso!")
        setTimeout(() => setFeedback(null), 3500)
      } else {
        const { data, error } = await supabase
          .from("chat_quick_replies")
          .insert(payload)
          .select()
          .single()

        if (error) {
          alert("Erro ao salvar mensagem rápida: " + error.message)
          return
        }
        if (data) {
          setReplies((prev) => [data, ...prev])
          setIsModalOpen(false)
          setFeedback("✅ Mensagem rápida salva! Digite / no chat para usá-la.")
          setTimeout(() => setFeedback(null), 3500)
        }
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 p-8 flex-1 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t("quickReplies", "title")}
          </h2>
          <p className="text-sm text-slate-500">
            Digite <code className="px-1.5 py-0.5 rounded bg-slate-100 text-emerald-700 font-bold">/</code> na caixa de mensagem do chat para abrir e escolher qualquer frase pronta.
          </p>
        </div>
        <button
          onClick={handleOpenNew}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 transition cursor-pointer shadow-xs"
        >
          <Plus className="h-4 w-4" />
          {t("quickReplies", "newReply")}
        </button>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800 overflow-hidden shadow-2xs">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200">{t("quickReplies", "tableTitle")}</th>
              <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200">{t("quickReplies", "tableShortcut")}</th>
              <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200">{t("quickReplies", "tableContent")}</th>
              <th className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-200 text-right">{t("quickReplies", "tableActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                  {t("quickReplies", "loading")}
                </td>
              </tr>
            ) : replies.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                  {t("quickReplies", "empty")}
                </td>
              </tr>
            ) : (
              replies.map((reply) => (
                <tr key={reply.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">{reply.title}</td>
                  <td className="px-6 py-4">
                    {reply.shortcut ? (
                      <span className="inline-flex items-center rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1 text-xs font-bold text-emerald-700">
                        {reply.shortcut}
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-300 max-w-md">
                    <p className="line-clamp-2">{reply.content}</p>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => handleOpenEdit(reply)}
                      className="p-2 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 transition cursor-pointer"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(reply.id)}
                      className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition cursor-pointer"
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {editingReply ? t("quickReplies", "editTitle") : t("quickReplies", "newTitle")}
                </h3>
                <p className="text-xs text-slate-500">
                  Use <code className="font-bold text-emerald-600">/</code> no chat para chamar esta frase rapidamente.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("quickReplies", "formTitle")}
                </label>
                <input
                  required
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ex: Solicitação de documento"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("quickReplies", "formShortcut")}
                </label>
                <input
                  type="text"
                  value={formData.shortcut}
                  onChange={(e) => setFormData({ ...formData, shortcut: e.target.value })}
                  placeholder={formData.title ? `Ex: ${slugifyShortcut(formData.title)}` : "Ex: /bomdia"}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Se deixar em branco, será gerado automaticamente ({formData.title ? slugifyShortcut(formData.title) : "/atalho"}). No chat, basta digitar <strong>/</strong> para ver todas as frases.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("quickReplies", "formContent")}
                </label>
                <textarea
                  required
                  rows={4}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Digite a mensagem padrão..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition cursor-pointer"
                >
                  {t("quickReplies", "cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{t("quickReplies", "save")}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
