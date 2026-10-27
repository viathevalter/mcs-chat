import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'

export interface Conversation {
  id: string
  contact_name: string
  contact_phone: string
  contact_avatar_url?: string | null
  status: string
  unread_count: number
  last_message_at: string
  last_message_text?: string | null
  last_message_preview?: string | null
  last_message_direction?: 'inbound' | 'outbound' | string | null
  lastMessage?: string
  lastMessageDirection?: 'inbound' | 'outbound' | string | null
  channel_id: string
  department_id?: string | null
  bot_status?: string
  ai_summary?: string
  assigned_to?: string | null
  assigned_to_name?: string | null
  worker_id?: string | null
  worker_client_name?: string | null
  worker_company_name?: string | null
  worker_function_name?: string | null
  is_pinned?: boolean
  tags?: any[]
  channel?: {
    id?: string
    name: string
    provider: string
    company_name?: string
    channel_type?: 'workers' | 'clients' | 'general' | string
    display_label?: string
    phone_number?: string
  } | null
  department?: { id: string; name: string } | null
}

export interface ChatChannelInfo {
  id: string
  name: string
  company_name?: string | null
  channel_type?: 'workers' | 'clients' | 'general' | string
  display_label?: string | null
  phone_number?: string | null
  status?: string | null
  is_active?: boolean
}

function resolveReadablePreview(conv: any): { lastMessage: string; lastMessageDirection: 'inbound' | 'outbound' } {
  const msgs = Array.isArray(conv.chat_messages) ? conv.chat_messages : []
  const latestMsg = msgs.find(
    (m: any) => m.message_type !== 'system_block' && m.message_type !== 'internal_note' && m.message_type !== 'private_note'
  ) || msgs[0]

  let preview = ''
  let direction: 'inbound' | 'outbound' =
    (conv.last_message_direction === 'outbound' ? 'outbound' : 'inbound')

  if (latestMsg) {
    direction = latestMsg.direction === 'outbound' ? 'outbound' : 'inbound'
    const mType = String(latestMsg.message_type || '').toLowerCase()
    const rawContent = String(latestMsg.content || '').trim()
    const isRawPlaceholder =
      !rawContent ||
      rawContent.startsWith('[') ||
      rawContent.startsWith('http') ||
      rawContent.startsWith('data:') ||
      rawContent.startsWith('{"URL"')

    if (mType === 'image') preview = isRawPlaceholder ? '📷 Foto' : `📷 ${rawContent}`
    else if (mType === 'audio' || mType === 'ptt') preview = isRawPlaceholder ? '🎵 Áudio' : rawContent
    else if (mType === 'video') preview = isRawPlaceholder ? '🎥 Vídeo' : `🎥 ${rawContent}`
    else if (mType === 'document') preview = isRawPlaceholder ? '📄 Documento' : `📄 ${rawContent}`
    else if (mType === 'sticker') preview = '🏷️ Figurinha'
    else preview = rawContent
  }

  if (!preview) {
    const dbText = String(conv.last_message_text || conv.last_message_preview || '').trim()
    if (dbText === '[IMAGE]' || dbText === '[image]') preview = '📷 Foto'
    else if (dbText === '[AUDIO]' || dbText === '[audio]' || dbText === '[Mensagem de Voz]') preview = '🎵 Áudio'
    else if (dbText === '[VIDEO]' || dbText === '[video]') preview = '🎥 Vídeo'
    else if (dbText === '[DOCUMENT]' || dbText === '[document]') preview = '📄 Documento'
    else preview = dbText
  }

  return {
    lastMessage: preview || 'Conversa iniciada',
    lastMessageDirection: direction
  }
}

export function useInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([])
  const [channels, setChannels] = useState<ChatChannelInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserDepartmentId, setCurrentUserDepartmentId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>('super_admin')
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState<string>('all')

  const userAccess = useRef<{
    isAdmin: boolean
    visibilityMode: string
    allowedDepartments: string[]
    allowedChannels: string[]
  }>({
    isAdmin: true,
    visibilityMode: 'all',
    allowedDepartments: [],
    allowedChannels: []
  })

  const fetchConversationsList = useCallback(async () => {
    try {
      const { isAdmin, visibilityMode, allowedDepartments, allowedChannels } = userAccess.current

      let query = supabase
        .from('chat_conversations')
        .select(`
          *,
          channel:chat_channels(id, name, provider, company_name, channel_type, display_label, phone_number),
          department:mcs_departments(id, name),
          chat_messages(content, created_at, direction, message_type, sender_name)
        `)
        .order('last_message_at', { ascending: false })
        .order('created_at', { foreignTable: 'chat_messages', ascending: false })
        .limit(1, { foreignTable: 'chat_messages' })
        .limit(250)

      if (!isAdmin && visibilityMode === 'strict_department') {
        if (allowedChannels.length > 0) {
          query = query.in('channel_id', allowedChannels)
        }
        if (allowedDepartments.length > 0) {
          query = query.or(`department_id.in.(${allowedDepartments.join(',')}),assigned_to.eq.${currentUserId}`)
        }
      }

      const { data, error } = await query

      if (data && !error) {
        const enriched = data.map((conv: any) => {
          const { lastMessage, lastMessageDirection } = resolveReadablePreview(conv)
          return {
            ...conv,
            lastMessage,
            lastMessageDirection
          }
        })
        // Deduplicação defensiva por (channel_id + telefone) para nunca exibir 2 cards do mesmo trabalhador no mesmo canal
        const seenByChannelPhone = new Map<string, any>()
        for (const item of enriched) {
          const cleanDigits = String(item.contact_phone || '').replace(/\D/g, '')
          const phoneKey = cleanDigits.length >= 9 ? cleanDigits.slice(-9) : cleanDigits
          const dedupeKey = phoneKey ? `${item.channel_id}|${phoneKey}` : item.id
          const prev = seenByChannelPhone.get(dedupeKey)
          if (!prev) {
            seenByChannelPhone.set(dedupeKey, item)
          } else {
            // Prioriza a conversa que possui atendente atribuído ou que está aberta
            const prevScore = (prev.assigned_to ? 4 : 0) + (prev.status === 'open' ? 2 : 0)
            const currScore = (item.assigned_to ? 4 : 0) + (item.status === 'open' ? 2 : 0)
            if (currScore > prevScore) {
              seenByChannelPhone.set(dedupeKey, item)
            }
          }
        }
        setConversations(Array.from(seenByChannelPhone.values()))
      } else {
        const { data: fallbackData } = await supabase
          .from('chat_conversations')
          .select('*')
          .order('last_message_at', { ascending: false })
          .limit(250)

        if (fallbackData) {
          setConversations(
            fallbackData.map((conv: any) => {
              const { lastMessage, lastMessageDirection } = resolveReadablePreview(conv)
              return { ...conv, lastMessage, lastMessageDirection }
            })
          )
        }
      }
    } catch (err) {
      console.error('Error fetching conversations:', err)
    } finally {
      setLoading(false)
    }
  }, [currentUserId])

  const loadUserPermissions = useCallback(async () => {
    try {
      const [{ data: depts }, { data: chs }] = await Promise.all([
        supabase
          .from('mcs_departments')
          .select('id, name')
          .eq('active', true)
          .order('name', { ascending: true }),
        supabase
          .from('chat_channels')
          .select('id, name, company_name, channel_type, display_label, phone_number, status, is_active')
          .eq('is_active', true)
          .order('company_name', { ascending: true })
      ])

      if (depts) setDepartments(depts)
      if (chs) setChannels(chs)

      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id
      if (userId) {
        setCurrentUserId(userId)

        const { data: mcsUser } = await supabase
          .from('mcs_users')
          .select('role, department_id, managed_departments, visibility_mode')
          .eq('id', userId)
          .single()

        const role = mcsUser?.role || 'super_admin'
        setUserRole(role)
        setCurrentUserDepartmentId(mcsUser?.department_id || null)

        const isAdmin = role === 'super_admin' || role === 'admin' || role === 'manager'
        const visibilityMode = mcsUser?.visibility_mode || 'department'

        let allowedDepartments: string[] = []
        let allowedChannels: string[] = []

        if (mcsUser?.department_id) allowedDepartments.push(mcsUser.department_id)
        if (Array.isArray(mcsUser?.managed_departments)) {
          allowedDepartments.push(...mcsUser.managed_departments)
        }
        allowedDepartments = Array.from(new Set(allowedDepartments))

        if (!isAdmin) {
          const { data: memberData } = await supabase
            .from('chat_channel_members')
            .select('channel_id')
            .eq('user_id', userId)
          allowedChannels = memberData?.map(m => m.channel_id) || []
        }

        userAccess.current = { isAdmin, visibilityMode, allowedDepartments, allowedChannels }
      }
    } catch (e) {
      console.error('Error loading permissions:', e)
    }
  }, [])

  useEffect(() => {
    fetchConversationsList()
    loadUserPermissions().then(() => {
      fetchConversationsList()
    })

    // 1. Assinatura Realtime Instantânea do Supabase (chat_conversations e chat_messages)
    const convChannel = supabase
      .channel('realtime_inbox_conversations_v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, () => {
        fetchConversationsList()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => {
        fetchConversationsList()
      })
      .subscribe()

    // 2. Evento local instantâneo disparado pelo painel ao enviar/editar/apagar/ler mensagem (0ms)
    const handleLocalUpdate = () => {
      fetchConversationsList()
    }
    window.addEventListener('mcs-chat-updated', handleLocalUpdate)

    // 3. Atualização automática ao voltar para a aba / foco da janela
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchConversationsList()
      }
    }
    window.addEventListener('focus', handleVisibilityOrFocus)
    document.addEventListener('visibilitychange', handleVisibilityOrFocus)

    // 4. Refresh silencioso de segurança a cada 6s + Delta-Poll UazAPI a cada 18s para garantir fila 100% viva
    const dbPollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchConversationsList()
      }
    }, 6000)

    const uazPollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetch('/api/channels/uazapi/live-poll', { method: 'POST' })
          .then(r => r.json())
          .then(d => {
            if (d?.updated > 0) fetchConversationsList()
          })
          .catch(() => {})
      }
    }, 18000)

    // Executa 1 delta-poll inicial ao abrir o Inbox
    fetch('/api/channels/uazapi/live-poll', { method: 'POST' })
      .then(r => r.json())
      .then(d => {
        if (d?.updated > 0) fetchConversationsList()
      })
      .catch(() => {})

    return () => {
      supabase.removeChannel(convChannel)
      window.removeEventListener('mcs-chat-updated', handleLocalUpdate)
      window.removeEventListener('focus', handleVisibilityOrFocus)
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus)
      clearInterval(dbPollTimer)
      clearInterval(uazPollTimer)
    }
  }, [fetchConversationsList, loadUserPermissions])

  return {
    conversations,
    departments,
    channels,
    loading,
    currentUserId,
    currentUserDepartmentId,
    userRole,
    selectedDepartmentFilter,
    setSelectedDepartmentFilter,
    refetch: fetchConversationsList
  }
}
