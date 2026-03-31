"use client"
import { useState } from 'react'
import { Calendar as CalendarIcon, Clock, Save, Loader2 } from 'lucide-react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase/client'
import 'react-quill-new/dist/quill.snow.css'

// We use react-quill-new if it installs correctly, or react-quill. 
// I'll assume react-quill works with legacy peer deps.
const ReactQuill = dynamic(() => import('react-quill-new'), { 
  ssr: false, 
  loading: () => <div className="h-32 bg-slate-50 animate-pulse rounded-lg border border-slate-200"></div> 
})

interface AgendaFormProps {
  conversationId: string
  onSuccess?: () => void
}

export default function AgendaForm({ conversationId, onSuccess }: AgendaFormProps) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!title || !date || !time) {
      setError('Preencha título, data e hora!')
      return
    }

    setSaving(true)
    setError('')
    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id

      // Parse schedule date
      const scheduleDate = new Date(`${date}T${time}:00`)

      const { error: insertErr } = await supabase.from('chat_appointments').insert({
        title,
        notes,
        scheduled_at: scheduleDate.toISOString(),
        conversation_id: conversationId,
        user_id: userId
      })

      if (insertErr) throw insertErr

      setTitle('')
      setNotes('')
      setDate('')
      setTime('')
      if (onSuccess) onSuccess()

    } catch(err: any) {
      console.error(err)
      setError(err.message || 'Erro ao agendar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 bg-white rounded-2xl shadow-sm border border-slate-200/60">
      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2">
        Novo Agendamento
      </h3>
      
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

      <div className="space-y-3">
        <div>
           <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Título</label>
           <input 
             value={title}
             onChange={e => setTitle(e.target.value)}
             placeholder="Ex: Ligar para confirmar..." 
             className="w-full text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
           />
        </div>

        <div className="flex items-center gap-3">
           <div className="flex-1">
             <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Data</label>
             <div className="relative">
                <CalendarIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full pl-9 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
             </div>
           </div>
           <div className="flex-1">
             <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Hora</label>
             <div className="relative">
                <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="w-full pl-9 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
             </div>
           </div>
        </div>

        <div>
           <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Observações (Opcional)</label>
           <div className="[&_.ql-editor]:min-h-[100px] [&_.ql-editor]:text-sm [&_.ql-editor]:text-slate-700 [&_.ql-toolbar]:rounded-t-lg [&_.ql-container]:rounded-b-lg [&_.ql-toolbar]:border-slate-200 [&_.ql-container]:border-slate-200">
             <ReactQuill theme="snow" value={notes} onChange={setNotes} />
           </div>
        </div>
      </div>

      <button 
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 mt-2"
      >
        {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4" /> Salvar Agendamento</>}
      </button>
    </div>
  )
}
