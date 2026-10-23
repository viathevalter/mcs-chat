import { useState, useEffect, useCallback } from 'react'
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
  external_id?: string | null
  created_at: string
  sender_name?: string
  sender_department?: string | null
  sender_user_id?: string | null
  translations?: Record<string, string>
}

function notifyInboxUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mcs-chat-updated'))
  }
}

export function useChat(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [senderName, setSenderName] = useState<string>('Atendente')
  const [senderDept, setSenderDept] = useState<string>('')
  const [senderUserId, setSenderUserId] = useState<string | null>(null)

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (data) {
      setMessages((prev) => {
        // Evitar re-render desnecessário quando a lista de mensagens não mudou no polling
        const nonTempPrev = prev.filter((m) => !String(m.id).startsWith('temp_'))
        if (nonTempPrev.length === data.length) {
          let identical = true
          for (let i = 0; i < data.length; i++) {
            const p = nonTempPrev[i]
            const n = data[i]
            if (
              p.id !== n.id ||
              p.content !== n.content ||
              p.status !== n.status ||
              p.media_url !== n.media_url ||
              p.message_type !== n.message_type
            ) {
              identical = false
              break
            }
          }
          if (identical) return prev
        }
        return data
      })
    }
    setLoading(false)
  }, [conversationId])

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
          notifyInboxUpdated()
        })
        .catch(() => {})
    })

    // Auto mark as read
    supabase
      .from('chat_conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId)
      .then(() => notifyInboxUpdated())

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
              notifyInboxUpdated()
            } else if (payload.eventType === 'UPDATE') {
              setMessages((prev) => prev.map((m) => (m.id === newMessage.id ? newMessage : m)))
              notifyInboxUpdated()
            }
          }
        }
      )
      .subscribe()

    // Silent poll inside active chat every 4s for guaranteed live delivery
    const pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchMessages()
      }
    }, 4000)

    return () => {
      supabase.removeChannel(subscription)
      clearInterval(pollTimer)
    }
  }, [conversationId, fetchMessages])

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
      const res = await fetch('/api/chat/send', {
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
      const resData = await res.json().catch(() => ({}))

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === optId
            ? resData?.message || {
                ...msg,
                status: messageType === 'internal_note' || messageType === 'system_block' ? 'delivered' : 'sent'
              }
            : msg
        )
      )

      await fetchMessages()
      notifyInboxUpdated()
    } catch (err) {
      console.error('Error sending message:', err)
      setMessages((prev) => prev.filter((msg) => msg.id !== optId))
    }
  }

  const editMessage = async (messageId: string, newText: string) => {
    if (!newText.trim()) return false
    const res = await fetch('/api/chat/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, newText })
    })
    if (res.ok) {
      await fetchMessages()
      notifyInboxUpdated()
      return true
    }
    return false
  }

  return { messages, loading, sendMessage, editMessage, refetchMessages: fetchMessages, senderName, senderDept, senderUserId }
}
