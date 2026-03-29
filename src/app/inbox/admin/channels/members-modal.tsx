"use client"
import { useState, useEffect } from 'react'
import { X, Users, Search, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

interface MembersModalProps {
  isOpen: boolean
  onClose: () => void
  channelId: string
  channelName: string
}

export function MembersModal({ isOpen, onClose, channelId, channelName }: MembersModalProps) {
  const [users, setUsers] = useState<any[]>([])
  const [members, setMembers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (isOpen) {
      fetchUsersAndMembers()
    }
  }, [isOpen, channelId])

  const fetchUsersAndMembers = async () => {
    setLoading(true)
    
    // Fetch all active users
    const { data: usersData } = await supabase
      .from('mcs_users')
      .select('id, email, display_name')
      .eq('active', true)
      
    if (usersData) setUsers(usersData)
      
    // Fetch current members for this channel
    const { data: membersData } = await supabase
      .from('chat_channel_members')
      .select('user_id')
      .eq('channel_id', channelId)
      
    if (membersData) {
      setMembers(membersData.map(m => m.user_id))
    }
    
    setLoading(false)
  }

  const toggleMember = (userId: string) => {
    setMembers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const handleSave = async () => {
    setSaving(true)
    
    try {
      // Delete old members
      await supabase
        .from('chat_channel_members')
        .delete()
        .eq('channel_id', channelId)
        
      // Insert new members
      if (members.length > 0) {
        const inserts = members.map(userId => ({
          channel_id: channelId,
          user_id: userId
        }))
        await supabase
          .from('chat_channel_members')
          .insert(inserts)
      }
      
      onClose()
    } catch (error) {
      console.error('Error saving members:', error)
      alert('Erro ao salvar membros.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const filteredUsers = users.filter(u => 
    (u.display_name?.toLowerCase() || '').includes(search.toLowerCase()) || 
    (u.email?.toLowerCase() || '').includes(search.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-white leading-tight">Membros da Equipe</h3>
              <p className="text-xs text-slate-500 font-medium">Canal: {channelName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Search */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
           <div className="relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
             <input 
               type="text" 
               placeholder="Buscar usuário por nome ou email..." 
               value={search}
               onChange={(e) => setSearch(e.target.value)}
               className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-medium"
             />
           </div>
        </div>

        {/* User List */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
             <div className="flex justify-center p-8">
               <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
             </div>
          ) : filteredUsers.length === 0 ? (
             <p className="text-center text-slate-500 text-sm py-8 font-medium">Nenhum usuário encontrado.</p>
          ) : (
            <div className="space-y-1">
              {filteredUsers.map(user => {
                const isSelected = members.includes(user.id)
                return (
                  <div 
                    key={user.id} 
                    onClick={() => toggleMember(user.id)}
                    className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800' : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-slate-100 dark:hover:border-slate-800'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">
                        {user.display_name ? user.display_name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className={`text-sm font-bold ${isSelected ? 'text-indigo-900 dark:text-indigo-100' : 'text-slate-800 dark:text-slate-200'}`}>
                          {user.display_name || 'Sem nome'}
                        </span>
                        <span className="text-xs text-slate-500 truncate max-w-[200px]">{user.email}</span>
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'}`}>
                      {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 shrink-0 flex justify-end gap-3 bg-slate-50/50 dark:bg-slate-900/50">
           <button 
             onClick={onClose}
             className="px-5 py-2.5 rounded-xl font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
           >
             Cancelar
           </button>
           <button 
             onClick={handleSave}
             disabled={saving || loading}
             className="px-6 py-2.5 rounded-xl font-bold bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transition-all disabled:opacity-50"
           >
             {saving ? 'Salvando...' : 'Salvar Acessos'}
           </button>
        </div>
      </div>
    </div>
  )
}
