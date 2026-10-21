"use client"
import { useState, useEffect } from 'react'
import { Search, X, User, ArrowRight, Loader2, Phone, Briefcase } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/contexts/i18n-context'

const COUNTRIES = [
  { code: '34', name: 'ES', flag: '🇪🇸', label: 'Espanha' },
  { code: '57', name: 'CO', flag: '🇨🇴', label: 'Colômbia' },
  { code: '55', name: 'BR', flag: '🇧🇷', label: 'Brasil' },
  { code: '39', name: 'IT', flag: '🇮🇹', label: 'Itália' },
  { code: '33', name: 'FR', flag: '🇫🇷', label: 'França' },
  { code: '351', name: 'PT', flag: '🇵🇹', label: 'Portugal' },
  { code: '1', name: 'US', flag: '🇺🇸', label: 'EUA' },
  { code: '54', name: 'AR', flag: '🇦🇷', label: 'Argentina' },
  { code: '56', name: 'CL', flag: '🇨🇱', label: 'Chile' },
  { code: '52', name: 'MX', flag: '🇲🇽', label: 'México' },
]

export function NewChatModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
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
  const [waDdi, setWaDdi] = useState('34')
  const [waPhone, setWaPhone] = useState('')
  const [waName, setWaName] = useState('')
  const [waChecking, setWaChecking] = useState(false)
  const [waResult, setWaResult] = useState<{
    exists: boolean
    formattedNumber?: string
    displayName?: string
    profilePictureUrl?: string
  } | null>(null)

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
      setWaDdi('34')
    } else {
      fetchChannels()
    }
  }, [isOpen])

  const fetchChannels = async () => {
    const { data } = await supabase
      .from('chat_channels')
      .select('id, name, company_name, channel_type, display_label, phone_number')
      .eq('is_active', true)
      .order('company_name', { ascending: true })
    setChannels(data || [])
    if (data && data.length > 0) {
      setSelectedChannelId(data[0].id)
    }
  }

  const resolveChannelForWorker = (worker: any) => {
    if (worker?.contratante) {
      const norm = String(worker.contratante).trim().toUpperCase()
      const exact = channels.find(
        ch => (ch.channel_type || 'workers') === 'workers' && (ch.company_name || '').trim().toUpperCase() === norm
      )
      if (exact) return exact
      const partial = channels.find(
        ch =>
          (ch.company_name || '').toUpperCase().includes(norm) ||
          norm.includes((ch.company_name || '').toUpperCase())
      )
      if (partial) return partial
    }
    return channels.find(ch => ch.id === selectedChannelId) || channels[0] || null
  }

  useEffect(() => {
    const search = async () => {
      if (activeTab !== 'db') return
      if (query.length < 3) return setWorkers([])
      setLoading(true)
      const { data } = await supabase
        .schema('core_personal')
        .from('workers')
        .select('id, nome, movil, contratante, cliente, funcion')
        .or(`nome.ilike.%${query}%,movil.ilike.%${query}%,contratante.ilike.%${query}%,cliente.ilike.%${query}%`)
        .limit(10)

      const list = data || []
      setWorkers(list)
      // Se encontrou apenas 1 trabalhador ou o primeiro tem contratante, pré-seleciona o canal oficial dele
      if (list.length > 0 && list[0].contratante) {
        const matched = resolveChannelForWorker(list[0])
        if (matched?.id) {
          setSelectedChannelId(matched.id)
        }
      }
      setLoading(false)
    }

    const delay = setTimeout(search, 350)
    return () => clearTimeout(delay)
  }, [query, activeTab, channels])

  const checkWaNumber = async () => {
    if (!waPhone || waPhone.length < 6) return
    if (!selectedChannelId) return alert(t('newChatModal', 'noChannel'))

    setWaChecking(true)
    setWaResult(null)
    try {
      const purePhone = waPhone.replace(/\D/g, '')
      const cleanPhone = purePhone.replace(/^0+/, '')
      const formatted = `${waDdi}${cleanPhone}`

      const res = await fetch('/api/chat/check-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formatted, channelId: selectedChannelId })
      })
      if (!res.ok) throw new Error('API request failed')
      const data = await res.json()
      setWaResult(data)
      if (data.exists && data.displayName && !waName) {
        setWaName(data.displayName)
      }
    } catch (e) {
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

      // Sempre priorizar o canal oficial da empresa contratante do trabalhador (ex: WISEOWE -> canal WISEOWE)
      const matchedChannel = resolveChannelForWorker(worker)
      const targetChannelId = matchedChannel?.id || selectedChannelId
      if (targetChannelId) {
        setSelectedChannelId(targetChannelId)
      }

      setStartingId(worker.id)
      await createOrRedirect(phone, worker.nome, worker.id, false, targetChannelId, worker)
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
      await createOrRedirect(waResult.formattedNumber, waName || 'Desconhecido', null, true, selectedChannelId, null)
    } catch (err) {
      console.error(err)
      alert(t('newChatModal', 'error'))
      setStartingId(null)
    }
  }

  const createOrRedirect = async (
    phone: string,
    name: string,
    workerId: string | null,
    isFromWaSearch: boolean = false,
    channelIdOverride?: string,
    workerObj?: any
  ) => {
    let formattedPhone = phone

    if (!isFromWaSearch) {
      if (phone.length <= 11 && !phone.startsWith('55') && !phone.startsWith('34') && !phone.startsWith('351')) {
        formattedPhone = '55' + phone
      }
    }

    const effectiveChannelId = channelIdOverride || selectedChannelId
    if (!effectiveChannelId) {
      alert(t('newChatModal', 'noChannel'))
      throw new Error('No channel')
    }

    // Check if conversation exists FOR THIS SPECIFIC CHANNEL
    const { data: existing } = await supabase
      .from('chat_conversations')
      .select('id')
      .eq('contact_phone', formattedPhone)
      .eq('channel_id', effectiveChannelId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('chat_conversations')
        .update({
          status: 'open',
          ...(workerId ? { worker_id: workerId } : {}),
          ...(workerObj?.contratante ? { worker_company_name: workerObj.contratante } : {}),
          ...(workerObj?.cliente ? { worker_client_name: workerObj.cliente } : {}),
          ...(workerObj?.funcion ? { worker_function_name: workerObj.funcion } : {})
        })
        .eq('id', existing.id)
      onClose()
      router.push(`/inbox/${existing.id}`)
      return
    }

    // Create Conversation on the matched channel
    const { data: newConv, error } = await supabase
      .from('chat_conversations')
      .insert({
        channel_id: effectiveChannelId,
        contact_phone: formattedPhone,
        contact_name: name,
        worker_id: workerId,
        worker_company_name: workerObj?.contratante || null,
        worker_client_name: workerObj?.cliente || null,
        worker_function_name: workerObj?.funcion || null,
        status: 'open',
        last_message_at: new Date().toISOString()
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
        <div className="p-4 bg-emerald-50/50 border-b border-emerald-100 flex flex-col gap-1.5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
              {t('newChatModal', 'selectChannel')}
            </label>
            {activeTab === 'db' && (
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                ✓ Selecionado automaticamente pela empresa do trabalhador
              </span>
            )}
          </div>
          <select
            value={selectedChannelId}
            onChange={e => setSelectedChannelId(e.target.value)}
            className="w-full bg-white border border-emerald-200 rounded-xl py-2.5 px-3 text-[14px] font-bold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            {channels.map(ch => {
              const icon = ch.channel_type === 'clients' ? '🏢' : ch.channel_type === 'general' ? '🚗' : '👷'
              const label = ch.display_label || ch.name
              return (
                <option key={ch.id} value={ch.id}>
                  {icon} {label} {ch.phone_number ? `(+${ch.phone_number})` : ''}
                </option>
              )
            })}
          </select>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 flex-shrink-0">
          <button
            onClick={() => setActiveTab('db')}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'db'
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            {t('newChatModal', 'tabDatabase')}
          </button>
          <button
            onClick={() => setActiveTab('wa')}
            className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center justify-center gap-2 ${
              activeTab === 'wa'
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
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
                {loading && (
                  <div className="p-8 flex justify-center">
                    <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                  </div>
                )}

                {!loading && query.length > 0 && query.length < 3 && (
                  <p className="text-center text-sm text-slate-400 p-8">{t('newChatModal', 'typeMore')}</p>
                )}

                {!loading && query.length >= 3 && workers.length === 0 && (
                  <p className="text-center text-sm text-slate-400 p-8">{t('newChatModal', 'noWorker')}</p>
                )}

                {!loading &&
                  workers.map(worker => {
                    const workerCh = resolveChannelForWorker(worker)
                    return (
                      <div
                        key={worker.id}
                        className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl group transition-all cursor-pointer border border-transparent hover:border-slate-100 mb-1"
                        onClick={() => handleStartChatDb(worker)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                            <User className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-slate-700 text-[14px] truncate">{worker.nome}</h4>
                            <div className="flex items-center gap-1.5 flex-wrap text-xs text-slate-500 font-medium mt-0.5">
                              <span>{worker.movil || 'Sem número'}</span>
                              {worker.contratante && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase">
                                  📱 Canal: {worker.contratante}
                                  {workerCh?.phone_number ? ` (+${workerCh.phone_number.slice(-4)})` : ''}
                                </span>
                              )}
                              {worker.cliente && (
                                <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold truncate max-w-[160px]">
                                  🏗️ {worker.cliente}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          disabled={startingId === worker.id || !selectedChannelId}
                          className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                        >
                          {startingId === worker.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <span>Abrir {worker.contratante || ''}</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      </div>
                    )
                  })}
              </div>
            </>
          ) : (
            <>
              {/* Search Whatsapp */}
              <div className="p-6 flex flex-col gap-4">
                <div className="flex gap-2">
                  <div className="w-[125px] shrink-0">
                    <select
                      value={waDdi}
                      onChange={e => setWaDdi(e.target.value)}
                      className="w-full h-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-3 text-[14px] focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 transition-all font-medium text-slate-700"
                    >
                      {COUNTRIES.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.flag} (+{c.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="relative flex-1">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      autoFocus
                      type="text"
                      placeholder={t('newChatModal', 'waSearchPlaceholder')}
                      value={waPhone}
                      onChange={e => {
                        setWaPhone(e.target.value)
                        setWaResult(null)
                        setWaName('')
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-[15px] focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 transition-all font-medium text-slate-700"
                    />
                  </div>
                </div>

                <button
                  onClick={checkWaNumber}
                  disabled={waChecking || waPhone.length < 8 || !selectedChannelId}
                  className="w-full bg-slate-100 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {waChecking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                  {t('newChatModal', 'waSearchBtn')}
                </button>

                {waResult && !waResult.exists && (
                  <div className="mt-2 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-center text-sm font-medium">
                    {t('newChatModal', 'waNumberInvalid')}
                  </div>
                )}

                {waResult && waResult.exists && (
                  <div className="mt-2 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-emerald-700 justify-center">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="font-bold text-sm">{t('newChatModal', 'waNumberValid')}</span>
                    </div>

                    {waResult.profilePictureUrl && (
                      <div className="flex justify-center -mb-2">
                        <img
                          src={waResult.profilePictureUrl}
                          alt="Profile"
                          className="w-16 h-16 rounded-full object-cover border-2 border-emerald-200 shadow-sm"
                        />
                      </div>
                    )}

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
                      {startingId === 'wa-new' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
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
