import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

export interface Message {
  quoted?: string | null
  id: string
  conversation_id: string
  direction: 'inbound' | 'outbound' | 'internal'
  content: string
  media_url?: string
  message_type: string
  status: string
  created_at: string
  sender_name?: string
  sender_department?: string | null
  sender_user_id?: string | null
  translations?: Record<string, string>
}

export function useChat(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [senderName, setSenderName] = useState<string>('Atendente')
  const [senderDept, setSenderDept] = useState<string>('')
  const [senderUserId, setSenderUserId] = useState<string | null>(null)

  useEffect(() => {
    if (!conversationId) return

    // Get current user profile & department for naming the sender block
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id || null
      setSenderUserId(uid)
      const fallbackName = data.user?.user_metadata?.full_name || data.user?.email?.split('@')[0] || 'Atendente'
      if (uid) {
        const { data: uRow } = await supabase
          .from('mcs_users')
          .select('name, display_name, email, department_id')
          .eq('id', uid)
          .single()
        const resolvedName = uRow?.display_name || uRow?.name || fallbackName
        setSenderName(resolvedName)

        if (uRow?.department_id) {
          const { data: dRow } = await supabase
            .from('mcs_departments')
            .select('name')
            .eq('id', uRow.department_id)
            .single()
          if (dRow?.name) setSenderDept(dRow.name)
        }
      } else {
        setSenderName(fallbackName)
      }
    })

    fetchMessages().then(() => {
      // Sincronizar automaticamente diálogos do WhatsApp Web / UazAPI ao abrir a conversa
      fetch('/api/channels/uazapi/sync-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_conversation_messages', conversationId })
      })
        .then(r => r.json())
        .then(d => {
          if (d?.imported > 0) {
            fetchMessages()
          }
        })
        .catch(() => {})
    })

    // Auto mark as read
    supabase.from('chat_conversations').update({ unread_count: 0 }).eq('id', conversationId).then()

    const subscription = supabase
      .channel(`chat_room_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
        },
        (payload) => {
          const newMessage = payload.new as Message
          if (newMessage && newMessage.conversation_id === conversationId) {
            if (payload.eventType === 'INSERT') {
              setMessages((prev) => {
                if (prev.some((m) => m.id === newMessage.id)) return prev
                return [...prev, newMessage]
              })
            } else if (payload.eventType === 'UPDATE') {
              setMessages((prev) => prev.map((m) => (m.id === newMessage.id ? newMessage : m)))
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [conversationId])

  const fetchMessages = async () => {
    const { data } = await supabase
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
    options?: {
      mediaUrl?: string
      fileName?: string
      quoted?: string
      senderName?: string
      senderDepartment?: string
      senderUserId?: string
    }
  ) => {
    const optId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const effectiveSender = options?.senderName || senderName || 'Atendente'
    const effectiveDept = options?.senderDepartment ?? senderDept
    const effectiveUserId = options?.senderUserId || senderUserId

    const optimisticMessage: Message = {
      id: optId,
      conversation_id: conversationId,
      direction: messageType === 'internal_note' || messageType === 'system_block' ? 'internal' : 'outbound',
      content: messageType === 'audio' ? '[Mensagem de Voz]' : text,
      media_url: messageType === 'audio' ? `data:audio/webm;base64,${text}` : options?.mediaUrl,
      message_type: messageType,
      status: 'sending',
      created_at: new Date().toISOString(),
      quoted: options?.quoted,
      sender_name: effectiveSender,
      sender_department: effectiveDept || null,
      sender_user_id: effectiveUserId,
    }

    setMessages((prev) => [...prev, optimisticMessage])

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
          quotedMessageId: options?.quoted,
          senderName: effectiveSender,
          senderDepartment: effectiveDept || null,
          senderUserId: effectiveUserId,
        }),
      })

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === optId
            ? { ...msg, status: messageType === 'internal_note' || messageType === 'system_block' ? 'delivered' : 'sent' }
            : msg
        )
      )

      await fetchMessages()
    } catch (err) {
      console.error('Error sending message:', err)
      setMessages((prev) => prev.filter((msg) => msg.id !== optId))
    }
  }

  return { messages, loading, sendMessage, senderName, senderDept, senderUserId }
}
