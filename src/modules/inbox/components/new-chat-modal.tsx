"use client"
import { useState, useEffect } from 'react'
import { Search, X, User, ArrowRight, Loader2, Phone, Briefcase } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/contexts/i18n-context'

export function NewChatModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const { t } = useI18n()
  
  const [activeTab, setActiveTab] = useState<'db' | 'wa'>('db')
  const [channels, setChannels] = useState<any[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<string>('')
  
  // Database fields
  const [query, setQuery] = useState('')
  const [workers, setWorkers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [startingId, setStartingId] = useState<string | null>(null)
  
  // WA direct fields
  const [waPhone, setWaPhone] = useState('')
  const [waName, setWaName] = useState('')
  const [waChecking, setWaChecking] = useState(false)
  const [waResult, setWaResult] = useState<{ exists: boolean, formattedNumber?: string, _debug?: any } | null>(null)

  const router = useRouter()

  useEffect(() => {
    if (!isOpen) { 
      setQuery('')
      setWorkers([])
      setWaPhone('')
      setWaName('')
      setWaResult(null)
      setActiveTab('db')
      setStartingId(null)
    } else {
      fetchChannels()
    }
  }, [isOpen])

  const fetchChannels = async () => {
    const { data } = await supabase.from('chat_channels').select('id, name').eq('is_active', true).order('name')
    setChannels(data || [])
    if (data && data.length > 0) {
      setSelectedChannelId(data[0].id)
    }
  }

  useEffect(() => {
    const search = async () => {
      if (activeTab !== 'db') return
      if (query.length < 3) return setWorkers([])
      setLoading(true)
      const { data } = await supabase
        .schema('core_personal')
        .from('workers')
        .select('id, nome, movil')
        .or(`nome.ilike.%${query}%,movil.ilike.%${query}%`)
        .limit(10)
      
      setWorkers(data || [])
      setLoading(false)
    }

    const delay = setTimeout(search, 400)
    return () => clearTimeout(delay)
  }, [query, activeTab])

  const checkWaNumber = async () => {
    if (!waPhone || waPhone.length < 8) return
    if (!selectedChannelId) return alert(t('newChatModal', 'noChannel'))
    
    setWaChecking(true)
    setWaResult(null)
    try {
      const formatted = waPhone.replace(/\D/g, '')
      const res = await fetch('/api/chat/check-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formatted, channelId: selectedChannelId })
      })
      if (!res.ok) throw new Error('API request failed')
      const data = await res.json()
      setWaResult(data)
    } catch(e) {
      setWaResult({ exists: false })
    } finally {
      setWaChecking(false)
    }
  }

  const handleStartChatDb = async (worker: any) => {
    if (startingId) return
    
    try {
      const phone = worker.movil ? worker.movil.replace(/\D/g, '') : null
      if (!phone) {
         alert(t('newChatModal', 'noPhone'))
         return
      }
      
      setStartingId(worker.id)
      await createOrRedirect(phone, worker.nome, worker.id)
    } catch (err) {
      console.error(err)
      alert(t('newChatModal', 'error'))
      setStartingId(null)
    }
  }

  const handleStartChatWa = async () => {
    if (!waResult?.exists || !waResult.formattedNumber || startingId) return
    setStartingId('wa-new')
    try {
      await createOrRedirect(waResult.formattedNumber, waName || 'Desconhecido', null)
    } catch (err) {
      console.error(err)
      alert(t('newChatModal', 'error'))
      setStartingId(null)
    }
  }

  const createOrRedirect = async (phone: string, name: string, workerId: string | null) => {
      const formattedPhone = phone.startsWith('55') ? phone : '55' + phone
      
      if (!selectedChannelId) {
         alert(t('newChatModal', 'noChannel'))
         throw new Error('No channel')
      }

      // Check if conversation exists FOR THIS CHANNEL
      const { data: existing } = await supabase
        .from('chat_conversations')
        .select('id')
        .eq('contact_phone', formattedPhone)
        .eq('channel_id', selectedChannelId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      if (existing) {
         onClose()
         router.push(`/inbox/${existing.id}`)
         return
      }

      // Create Conversation
      const { data: newConv, error } = await supabase
        .from('chat_conversations')
        .insert({
           channel_id: selectedChannelId,
           contact_phone: formattedPhone,
           contact_name: name,
           worker_id: workerId,
           status: 'open'
        })
        .select()
        .single()
        
      if (error) throw error

      onClose()
      router.push(`/inbox/${newConv.id}`)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
         {/* Header */}
         <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
            <h2 className="text-xl font-bold text-slate-800">{t('newChatModal', 'title')}</h2>
            <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
               <X className="w-5 h-5" />
            </button>
         </div>

         {/* Channel Selector */}
         <div className="p-4 bg-emerald-50/50 border-b border-emerald-100 flex flex-col gap-2 flex-shrink-0">
            <label className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
              {t('newChatModal', 'selectChannel')}
            </label>
            <select
              value={selectedChannelId}
              onChange={e => setSelectedChannelId(e.target.value)}
              className="w-full bg-white border border-emerald-200 rounded-xl py-2.5 px-3 text-[14px] font-medium text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              {channels.map(ch => (
                <option key={ch.id} value={ch.id}>{ch.name}</option>
              ))}
            </select>
         </div>

         {/* Tabs */}
         <div className="flex border-b border-slate-100 flex-shrink-0">
           <button 
             onClick={() => setActiveTab('db')}
             className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'db' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
           >
             <Briefcase className="w-4 h-4" />
             {t('newChatModal', 'tabDatabase')}
           </button>
           <button 
             onClick={() => setActiveTab('wa')}
             className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'wa' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
           >
             <Phone className="w-4 h-4" />
             {t('newChatModal', 'tabWhatsapp')}
           </button>
         </div>

         {/* Content Area */}
         <div className="flex-1 overflow-y-auto">
           {activeTab === 'db' ? (
             <>
               {/* Search DB */}
               <div className="p-6 border-b border-slate-100 sticky top-0 bg-white z-10">
                  <div className="relative">
                     <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                     <input 
                       autoFocus
                       type="text"
                       placeholder={t('newChatModal', 'searchPlaceholder')}
                       value={query}
                       onChange={e => setQuery(e.target.value)}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-[15px] focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 transition-all font-medium text-slate-700"
                     />
                  </div>
               </div>

               {/* Results DB */}
               <div className="p-4">
                  {loading && <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /></div>}
                  
                  {!loading && query.length > 0 && query.length < 3 && (
                     <p className="text-center text-sm text-slate-400 p-8">{t('newChatModal', 'typeMore')}</p>
                  )}

                  {!loading && query.length >= 3 && workers.length === 0 && (
                     <p className="text-center text-sm text-slate-400 p-8">{t('newChatModal', 'noWorker')}</p>
                  )}

                  {!loading && workers.map(worker => (
                     <div key={worker.id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl group transition-all cursor-pointer border border-transparent hover:border-slate-100 mb-1" onClick={() => handleStartChatDb(worker)}>
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                              <User className="w-5 h-5" />
                           </div>
                           <div>
                              <h4 className="font-bold text-slate-700 text-[15px]">{worker.nome}</h4>
                              <p className="text-xs text-slate-500 font-medium">{worker.movil || 'Sem número'}</p>
                           </div>
                        </div>
                        <button disabled={startingId === worker.id || !selectedChannelId} className="p-2.5 bg-white border border-slate-200 text-slate-400 rounded-full group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 shadow-sm transition-all disabled:opacity-50 flex-shrink-0">
                           {startingId === worker.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                        </button>
                     </div>
                  ))}
               </div>
             </>
           ) : (
             <>
               {/* Search Whatsapp */}
               <div className="p-6 flex flex-col gap-4">
                  <div className="relative">
                     <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                     <input 
                       autoFocus
                       type="text"
                       placeholder={t('newChatModal', 'waSearchPlaceholder')}
                       value={waPhone}
                       onChange={e => {
                          setWaPhone(e.target.value);
                          setWaResult(null); // reset result if typing again
                       }}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-[15px] focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 transition-all font-medium text-slate-700"
                     />
                  </div>
                  
                  <button 
                    onClick={checkWaNumber}
                    disabled={waChecking || waPhone.length < 8 || !selectedChannelId}
                    className="w-full bg-slate-100 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {waChecking ? <Loader2 className="w-5 h-5 animate-spin"/> : <Search className="w-5 h-5" />}
                    {t('newChatModal', 'waSearchBtn')}
                  </button>

                  {waResult && !waResult.exists && (
                    <div className="mt-2 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-center text-sm font-medium break-all text-left">
                      {t('newChatModal', 'waNumberInvalid')}
                      {waResult._debug && (
                        <pre className="mt-2 text-xs text-red-400 overflow-x-auto">
                          {JSON.stringify(waResult._debug, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}

                  {waResult && waResult.exists && (
                    <div className="mt-2 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex flex-col gap-4">
                      <div className="flex items-center gap-2 text-emerald-700 justify-center">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="font-bold text-sm">{t('newChatModal', 'waNumberValid')}</span>
                      </div>
                      
                      <input 
                        type="text"
                        placeholder={t('newChatModal', 'waNamePlaceholder')}
                        value={waName}
                        onChange={e => setWaName(e.target.value)}
                        className="w-full bg-white border border-emerald-200 rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />

                      <button 
                        onClick={handleStartChatWa}
                        disabled={startingId === 'wa-new'}
                        className="w-full bg-emerald-600 text-white font-bold py-2.5 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
                      >
                        {startingId === 'wa-new' ? <Loader2 className="w-4 h-4 animate-spin"/> : <ArrowRight className="w-4 h-4" />}
                        {t('newChatModal', 'waStartChat')}
                      </button>
                    </div>
                  )}
               </div>
             </>
           )}
         </div>
      </div>
    </div>
  )
}
