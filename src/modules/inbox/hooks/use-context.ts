import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

export interface ConversationContextData {
  conversation: any
  worker: any
  company: any
  worksite: any
}

export function useConversationContext(conversationId: string) {
  const [context, setContext] = useState<ConversationContextData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!conversationId) return

    async function load() {
      // 1. Fetch conversation
      const { data: conv } = await supabase
        .from('chat_conversations')
        .select('*')
        .eq('id', conversationId)
        .single()
      
      if (!conv) { setLoading(false); return }

      let workerData = null
      let companyData = null

      // 2. Fetch Worker if exists or by phone
      if (conv.worker_id) {
        const { data: wrk, error: wrkErr } = await supabase
          .schema('core_personal')
          .from('workers')
          .select('id, nome, apelido, estatus, movil, ocupacao')
          .eq('id', conv.worker_id)
          .single()
        
        if (!wrkErr) workerData = wrk

        companyData = { nome: 'Construtora Exemplo' }
      } else if (conv.contact_phone) {
        const last8 = conv.contact_phone.slice(-8)
        if (last8.length === 8) {
          const { data: wrks } = await supabase
            .schema('core_personal')
            .from('workers')
            .select('id, nome, apelido, estatus, movil, ocupacao')
            .ilike('movil', `%${last8}%`)
            .limit(1)
          
          if (wrks && wrks.length > 0) {
            workerData = wrks[0]
            companyData = { nome: 'Construtora Exemplo' }
            supabase.from('chat_conversations').update({ worker_id: workerData.id }).eq('id', conv.id).then()
          }
        }
      }

      setContext(prev => ({
        ...prev,
        ...({
          conversation: conv,
          worker: workerData,
          company: companyData,
          worksite: { nome: 'Projeto X' }
        })
      }))
      setLoading(false)
    }

    load()

    const subscription = supabase
      .channel(`public:chat_conversations:${conversationId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'chat_conversations',
        filter: `id=eq.${conversationId}`
      }, () => {
        load()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [conversationId])

  return { context, loading }
}
