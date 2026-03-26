import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

export interface Conversation {
  id: string
  contact_name: string
  contact_phone: string
  status: string
  unread_count: number
  last_message_at: string
  channel_id: string
  worker_id?: string
}

export function useInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchConversations()

    const subscription = supabase
      .channel('public:chat_conversations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, () => {
        fetchConversations()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [])

  const fetchConversations = async () => {
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('*')
      .order('last_message_at', { ascending: false })

    if (data) setConversations(data)
    setLoading(false)
  }

  return { conversations, loading }
}
