import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

export interface Message {
  id: string
  conversation_id: string
  direction: 'inbound' | 'outbound' | 'internal'
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
      .channel(`chat_room_${conversationId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'chat_messages'
      }, (payload) => {
        const newMessage = payload.new as Message
        if (newMessage && newMessage.conversation_id === conversationId) {
          if (payload.eventType === 'INSERT') {
            setMessages(prev => {
              if (prev.some(m => m.id === newMessage.id)) return prev
              return [...prev, newMessage]
            })
          } else if (payload.eventType === 'UPDATE') {
            setMessages(prev => prev.map(m => m.id === newMessage.id ? newMessage : m))
          }
        }
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

  const sendMessage = async (
    text: string, 
    messageType: string = 'text', 
    options?: { mediaUrl?: string; fileName?: string; quoted?: string }
  ) => {
    // Generate optimistic ID
    const optId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`
    
    // Optimistic UI update
    const optimisticMessage: Message = {
      id: optId,
      conversation_id: conversationId,
      direction: messageType === 'internal_note' ? 'internal' : 'outbound',
      content: messageType === 'audio' ? '[Mensagem de Voz]' : text,
      media_url: messageType === 'audio' ? `data:audio/webm;base64,${text}` : options?.mediaUrl,
      message_type: messageType,
      status: 'sending',
      created_at: new Date().toISOString(),
      quoted: options?.quoted,
      sender_name: messageType === 'internal_note' ? 'RH (Nota Interna)' : 'RH (Atendente)'
    }
    
    setMessages(prev => [...prev, optimisticMessage])

    try {
      await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          conversationId, 
          text, 
          messageType,
          mediaUrl: options?.mediaUrl,
          fileName: options?.fileName,
          quotedMessageId: options?.quoted
        })
      })
      
      // Update local state to delivered/sent (temporarily until realtime sync)
      setMessages(prev => prev.map(msg => 
        msg.id === optId 
          ? { ...msg, status: messageType === 'internal_note' ? 'delivered' : 'sent' } 
          : msg
      ))
      
      // Assure sync with backend (fetches latest state, ignoring duplicate realtime events by ID soon if we use a Set or handle duplicates, but Supabase Realtime just appends. 
      // Actually, if we fetchMessages, it will replace all messages, overriding the optimistic one with the real DB one containing the real ID.)
      await fetchMessages()
    } catch (err) {
      console.error('Error sending message:', err)
      // Remove optimistic message on fail
      setMessages(prev => prev.filter(msg => msg.id !== optId))
    }
  }

  return { messages, loading, sendMessage }
}
