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
  channel_id: string
  department_id?: string | null
  bot_status?: string
  ai_summary?: string
  assigned_to?: string | null
  worker_id?: string
  is_pinned?: boolean
  tags?: any[]
  channel?: { name: string; provider: string; company_name?: string } | null
  department?: { id: string; name: string } | null
}

export function useInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>('super_admin')
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState<string>('all')

  const userAccess = useRef<{
    isAdmin: boolean
    allowedDepartments: string[]
    allowedChannels: string[]
  }>({
    isAdmin: true, // Default to admin so all conversations are visible immediately
    allowedDepartments: [],
    allowedChannels: []
  })

  const fetchConversationsList = useCallback(async () => {
    try {
      const { isAdmin, allowedDepartments, allowedChannels } = userAccess.current

      let query = supabase
        .from('chat_conversations')
        .select('*, channel:chat_channels(name, provider, company_name), department:mcs_departments(id, name)')
        .order('last_message_at', { ascending: false })

      if (!isAdmin) {
        if (allowedChannels.length > 0) {
          query = query.in('channel_id', allowedChannels)
        }
        if (allowedDepartments.length > 0) {
          query = query.or(`department_id.in.(${allowedDepartments.join(',')}),department_id.is.null`)
        }
      }

      const { data, error } = await query

      if (data && !error) {
        setConversations(data)
      } else {
        // Resilient fallback without joins
        const { data: fallbackData } = await supabase
          .from('chat_conversations')
          .select('*')
          .order('last_message_at', { ascending: false })

        if (fallbackData) setConversations(fallbackData)
      }
    } catch (err) {
      console.error('Error fetching conversations:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadUserPermissions = useCallback(async () => {
    try {
      // 1. Fetch active departments
      const { data: depts } = await supabase
        .from('mcs_departments')
        .select('id, name')
        .eq('active', true)
        .order('name', { ascending: true })

      if (depts) setDepartments(depts)

      // 2. Fetch User & Permissions
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id
      if (userId) {
        setCurrentUserId(userId)

        const { data: mcsUser } = await supabase
          .from('mcs_users')
          .select('role, department_id, managed_departments')
          .eq('id', userId)
          .single()

        const role = mcsUser?.role || 'super_admin'
        setUserRole(role)

        const isAdmin = role === 'super_admin' || role === 'admin' || role === 'manager'

        let allowedDepartments: string[] = []
        let allowedChannels: string[] = []

        if (!isAdmin) {
          if (mcsUser?.department_id) allowedDepartments.push(mcsUser.department_id)
          if (Array.isArray(mcsUser?.managed_departments)) {
            allowedDepartments.push(...mcsUser.managed_departments)
          }
          allowedDepartments = Array.from(new Set(allowedDepartments))

          const { data: memberData } = await supabase
            .from('chat_channel_members')
            .select('channel_id')
            .eq('user_id', userId)
          allowedChannels = memberData?.map(m => m.channel_id) || []
        }

        userAccess.current = { isAdmin, allowedDepartments, allowedChannels }
      }
    } catch (e) {
      console.error('Error loading permissions:', e)
    }
  }, [])

  useEffect(() => {
    // Initial load: fetch conversations immediately and load permissions in parallel
    fetchConversationsList()
    loadUserPermissions().then(() => {
      fetchConversationsList()
    })

    // Realtime subscriptions
    const convChannel = supabase
      .channel('realtime_inbox_conversations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, () => {
        fetchConversationsList()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, () => {
        fetchConversationsList()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(convChannel)
    }
  }, [fetchConversationsList, loadUserPermissions])

  return {
    conversations,
    departments,
    loading,
    currentUserId,
    userRole,
    selectedDepartmentFilter,
    setSelectedDepartmentFilter,
    refetch: fetchConversationsList
  }
}
