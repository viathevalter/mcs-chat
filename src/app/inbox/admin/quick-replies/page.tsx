"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase/client"
import { Plus, Pencil, Trash2, Zap } from "lucide-react"

interface QuickReply {
  id: string
  title: string
  shortcut: string | null
  content: string
}

import { useI18n } from "@/contexts/i18n-context"

export default function QuickRepliesPage() {
  const { t } = useI18n()
  const [replies, setReplies] = useState<QuickReply[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null)
  const [formData, setFormData] = useState({ title: "", shortcut: "", content: "" })

  useEffect(() => {
    fetchReplies()
  }, [])

  const fetchReplies = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('chat_quick_replies')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (data) setReplies(data)
    setLoading(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('quickReplies', 'confirmDelete'))) return
    const { error } = await supabase.from('chat_quick_replies').delete().eq('id', id)
    if (!error) setReplies(prev => prev.filter(r => r.id !== id))
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
    
    const { title, shortcut, content } = formData
    let cleanShortcut = shortcut.trim()
    if (cleanShortcut && !cleanShortcut.startsWith('/')) {
      cleanShortcut = '/' + cleanShortcut
    }

    const payload = {
      title,
      shortcut: cleanShortcut || null,
      content
    }

    if (editingReply) {
      const { error } = await supabase
        .from('chat_quick_replies')
        .update(payload)
        .eq('id', editingReply.id)
      
      if (!error) {
        setReplies(prev => prev.map(r => r.id === editingReply.id ? { ...r, ...payload } : r))
        setIsModalOpen(false)
      }
    } else {
      const { data, error } = await supabase
        .from('chat_quick_replies')
        .insert(payload)
        .select()
        .single()
      
      if (!error && data) {
        setReplies(prev => [data, ...prev])
        setIsModalOpen(false)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{t('quickReplies', 'title')}</h2>
          <p className="text-sm text-slate-500">
            {t('quickReplies', 'subtitle')}
          </p>
        </div>
        <button
          onClick={handleOpenNew}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition"
        >
          <Plus className="h-4 w-4" />
          {t('quickReplies', 'newReply')}
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-6 py-4 font-medium text-slate-900">{t('quickReplies', 'tableTitle')}</th>
              <th className="px-6 py-4 font-medium text-slate-900">{t('quickReplies', 'tableShortcut')}</th>
              <th className="px-6 py-4 font-medium text-slate-900">{t('quickReplies', 'tableContent')}</th>
              <th className="px-6 py-4 font-medium text-slate-900 text-right">{t('quickReplies', 'tableActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">{t('quickReplies', 'loading')}</td>
              </tr>
            ) : replies.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                  {t('quickReplies', 'empty')}
                </td>
              </tr>
            ) : (
              replies.map(reply => (
                <tr key={reply.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-900">{reply.title}</td>
                  <td className="px-6 py-4">
                    {reply.shortcut ? (
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                        {reply.shortcut}
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-600 truncate max-w-xs">{reply.content}</td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => handleOpenEdit(reply)}
                      className="p-2 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 transition"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(reply.id)}
                      className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
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
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {editingReply ? t('quickReplies', 'editTitle') : t('quickReplies', 'newTitle')}
                </h3>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('quickReplies', 'formTitle')}</label>
                <input
                  required
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ex: Boas-vindas"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('quickReplies', 'formShortcut')}</label>
                <input
                  type="text"
                  value={formData.shortcut}
                  onChange={e => setFormData({ ...formData, shortcut: e.target.value })}
                  placeholder="Ex: /bomdia"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <p className="mt-1 text-xs text-slate-500">Atalho para buscar enquanto digita no chat.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('quickReplies', 'formContent')}</label>
                <textarea
                  required
                  rows={4}
                  value={formData.content}
                  onChange={e => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Digite a mensagem padrão..."
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition"
                >
                  {t('quickReplies', 'cancel')}
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition"
                >
                  {t('quickReplies', 'save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
