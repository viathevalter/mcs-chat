import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

export interface Message {
  id: string
  conversation_id: string
  direction: 'inbound' | 'outbound'
  content: string
  media_url?: string
  message_type: string
  status: string
  created_at: string
  sender_name?: string
}

export function useChat(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!conversationId) return

    fetchMessages()
    
    // Auto mark as read
    supabase.from('chat_conversations').update({ unread_count: 0 }).eq('id', conversationId).then()

    const subscription = supabase
      .channel(`public:chat_messages:${conversationId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message])
      })
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [conversationId])

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (data) setMessages(data)
    setLoading(false)
  }

  const sendMessage = async (text: string) => {
    // Optimistic UI update could be added here
    await fetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, text })
    })
  }

  return { messages, loading, sendMessage }
}
