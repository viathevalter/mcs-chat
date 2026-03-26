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

      // 2. Fetch Worker if exists
      if (conv.worker_id) {
        const { data: wrk, error: wrkErr } = await supabase
          .schema('core_personal')
          .from('workers')
          .select('id, nome, apelido, estatus, movil, ocupacao')
          .eq('id', conv.worker_id)
          .single()
        
        if (!wrkErr) workerData = wrk

        // Atualmente não temos clareza do schema 'empresas', vamos pular fetch extra para MVP e mostrar mock
        companyData = { nome: 'Construtora Exemplo' }
      }

      setContext({
        conversation: conv,
        worker: workerData,
        company: companyData,
        worksite: { nome: 'Projeto X' }
      })
      setLoading(false)
    }

    load()
  }, [conversationId])

  return { context, loading }
}
