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
  assigned_to?: string | null
  worker_id?: string
  channel?: { name: string; provider: string } | null
}

export function useInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

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
    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id
      if (!userId) return

      setCurrentUserId(userId)

      // Fetch user role
      const { data: mcsUser } = await supabase.from('mcs_users').select('role').eq('id', userId).single()
      const isAdmin = mcsUser?.role === 'super_admin' || mcsUser?.role === 'admin' || mcsUser?.role === 'manager'

      // Fetch allowed channels if not admin
      let allowedChannels: string[] = []
      if (!isAdmin) {
         const { data: memberData } = await supabase.from('chat_channel_members').select('channel_id').eq('user_id', userId)
         allowedChannels = memberData?.map(m => m.channel_id) || []
      }

      let query = supabase
        .from('chat_conversations')
        .select('*, channel:chat_channels(name, provider)')
        .order('last_message_at', { ascending: false })

      if (!isAdmin && allowedChannels.length > 0) {
        query = query.in('channel_id', allowedChannels)
      } else if (!isAdmin && allowedChannels.length === 0) {
        setConversations([])
        setLoading(false)
        return
      }

      const { data, error } = await query
      if (data) setConversations(data)
    } catch(err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return { conversations, loading, currentUserId }
}
