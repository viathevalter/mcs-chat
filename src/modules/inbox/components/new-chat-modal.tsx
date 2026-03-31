"use client"
import { useState, useEffect } from 'react'
import { Search, X, User, ArrowRight, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function NewChatModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [workers, setWorkers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [startingId, setStartingId] = useState<string | null>(null)
  
  const router = useRouter()

  useEffect(() => {
    if (!isOpen) { setQuery(''); setWorkers([]) }
  }, [isOpen])

  useEffect(() => {
    const search = async () => {
      if (query.length < 3) return setWorkers([])
      setLoading(true)
      const { data } = await supabase
        .schema('core_personal')
        .from('workers')
        .select('id, nome, movil')
        .or(`nome.ilike.%${query}%,movil.ilike.%${query}%`)
        .limit(10)
      
      setWorkers(data || [])
      setLoading(false)
    }

    const delay = setTimeout(search, 400)
    return () => clearTimeout(delay)
  }, [query])

  const handleStartChat = async (worker: any) => {
    if (startingId) return
    setStartingId(worker.id)
    
    try {
      // Clean phone
      const phone = worker.movil ? worker.movil.replace(/\D/g, '') : null
      if (!phone) {
         alert('Trabalhador não possui celular cadastrado.')
         setStartingId(null)
         return
      }

      const formattedPhone = phone.startsWith('55') ? phone : '55' + phone

      // Check if conversation exists
      const { data: existing } = await supabase
        .from('chat_conversations')
        .select('id')
        .eq('contact_phone', formattedPhone)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      if (existing) {
         onClose()
         router.push(`/inbox/${existing.id}`)
         return
      }

      // Find default channel
      const { data: channel } = await supabase
        .from('chat_channels')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .single()
      
      if (!channel) {
         alert('Nenhum canal WhatsApp configurado e ativo. Vá em Configurações.')
         setStartingId(null)
         return
      }

      // Create Conversation
      const { data: newConv, error } = await supabase
        .from('chat_conversations')
        .insert({
           channel_id: channel.id,
           contact_phone: formattedPhone,
           contact_name: worker.nome,
           worker_id: worker.id,
           status: 'open'
        })
        .select()
        .single()
        
      if (error) throw error

      onClose()
      router.push(`/inbox/${newConv.id}`)

    } catch (err) {
      console.error(err)
      alert('Erro ao iniciar conversa')
    } finally {
      setStartingId(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
         {/* Header */}
         <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-xl font-bold text-slate-800">Novo Atendimento</h2>
            <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
               <X className="w-5 h-5" />
            </button>
         </div>

         {/* Search */}
         <div className="p-6 border-b border-slate-100">
            <div className="relative">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
               <input 
                 autoFocus
                 type="text"
                 placeholder="Buscar por nome ou celular..."
                 value={query}
                 onChange={e => setQuery(e.target.value)}
                 className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-[15px] focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 transition-all font-medium text-slate-700"
               />
            </div>
         </div>

         {/* Results */}
         <div className="flex-1 max-h-[300px] overflow-y-auto p-2">
            {loading && <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /></div>}
            
            {!loading && query.length > 0 && query.length < 3 && (
               <p className="text-center text-sm text-slate-400 p-8">Digite pelo menos 3 caracteres...</p>
            )}

            {!loading && query.length >= 3 && workers.length === 0 && (
               <p className="text-center text-sm text-slate-400 p-8">Nenhum trabalhador encontrado.</p>
            )}

            {!loading && workers.map(worker => (
               <div key={worker.id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl group transition-all cursor-pointer border border-transparent hover:border-slate-100 mb-1" onClick={() => handleStartChat(worker)}>
                  <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <User className="w-5 h-5" />
                     </div>
                     <div>
                        <h4 className="font-bold text-slate-700 text-[15px]">{worker.nome}</h4>
                        <p className="text-xs text-slate-500 font-medium">{worker.movil || 'Sem número'}</p>
                     </div>
                  </div>
                  <button disabled={startingId === worker.id} className="p-2.5 bg-white border border-slate-200 text-slate-400 rounded-full group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 shadow-sm transition-all disabled:opacity-50">
                     {startingId === worker.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  </button>
               </div>
            ))}
         </div>
      </div>
    </div>
  )
}
