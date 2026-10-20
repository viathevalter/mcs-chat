"use client"
import { useState, useEffect } from 'react'
import { Plus, Server, CheckCircle2, AlertCircle, Phone, Globe, Key, Trash2, Users, Building2, Bot, QrCode, RefreshCw, Edit, Settings2, Save, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { MembersModal } from './members-modal'

export default function ChannelsAdminPage() {
  const [channels, setChannels] = useState<any[]>([])
  const [companies, setCompanies] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [qrModalData, setQrModalData] = useState<{ name: string; qrcode: string } | null>(null)
  const [typeFilter, setTypeFilter] = useState<'all' | 'workers' | 'clients' | 'general'>('all')

  // Edit Channel Modal state
  const [editingChannel, setEditingChannel] = useState<any | null>(null)
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Members Modal state
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false)
  const [selectedChannelId, setSelectedChannelId] = useState('')
  const [selectedChannelName, setSelectedChannelName] = useState('')

  const [name, setName] = useState('')
  const [displayLabel, setDisplayLabel] = useState('')
  const [channelType, setChannelType] = useState<'workers' | 'clients' | 'general'>('workers')
  const [phone, setPhone] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [aiAgentId, setAiAgentId] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [apiToken, setApiToken] = useState('')
  
  const fetchAllData = async () => {
    setLoading(true)
    let chsData: any[] = []
    
    const { data: chs, error: chsErr } = await supabase
      .from('chat_channels')
      .select('*, ai_agent:chat_ai_agents(name), department:mcs_departments(name)')
      .order('company_name', { ascending: true })

    if (chs && !chsErr) {
      chsData = chs
    } else {
      const { data: fallbackChs } = await supabase.from('chat_channels').select('*').order('company_name', { ascending: true })
      if (fallbackChs) chsData = fallbackChs
    }

    const { data: emps } = await supabase.schema('core_common').from('empresas').select('id, nome, trade_name, codigo')
    const { data: ags } = await supabase.from('chat_ai_agents').select('id, name')
    const { data: depts } = await supabase.from('mcs_departments').select('id, name').eq('active', true).order('name')

    setChannels(chsData)
    if (emps) setCompanies(emps)
    if (ags) setAgents(ags)
    if (depts) setDepartments(depts)
    setLoading(false)
  }

  useEffect(() => {
    fetchAllData()
  }, [])

  const handleCreateChannel = async () => {
    if (!name) {
       alert('Por favor, informe o nome da instância do canal.')
       return
    }
    
    setIsCreating(true)
    try {
      const selectedCompany = companies.find(c => c.id === companyId)
      const compName = selectedCompany?.trade_name || selectedCompany?.nome || null
      const res = await fetch('/api/channels/uazapi/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName: name.trim(),
          phoneNumber: phone.trim() || undefined,
          companyId: companyId || null,
          companyName: compName,
          channelType,
          displayLabel: displayLabel.trim() || undefined,
          departmentId: departmentId || null,
          aiAgentId: aiAgentId || null,
          apiUrl: apiUrl || undefined,
          apiToken: apiToken || undefined
        })
      })

      const data = await res.json()
      if (!res.ok) {
        alert('Erro ao criar canal: ' + (data.error || 'Erro desconhecido'))
      } else {
        if (data.qrcode) {
          setQrModalData({ name, qrcode: data.qrcode })
        }
        setName('')
        setDisplayLabel('')
        setChannelType('workers')
        setPhone('')
        setCompanyId('')
        setDepartmentId('')
        setAiAgentId('')
        setApiUrl('')
        setApiToken('')
        fetchAllData()
      }
    } catch (e: any) {
      alert('Erro na requisição: ' + e.message)
    } finally {
      setIsCreating(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!editingChannel) return
    setIsSavingEdit(true)

    try {
      const selectedCompany = companies.find(c => c.id === editingChannel.company_id)
      const companyName = selectedCompany
        ? (selectedCompany.trade_name || selectedCompany.nome)
        : (editingChannel.company_name || null)

      const cleanName = (editingChannel.name || '').trim()
      const cleanToken = (editingChannel.api_token || editingChannel.instance_token || '').trim() || null

      const { error } = await supabase
        .from('chat_channels')
        .update({
          name: cleanName,
          instance_name: cleanName,
          display_label: editingChannel.display_label || null,
          channel_type: editingChannel.channel_type || 'workers',
          phone_number: editingChannel.phone_number ? String(editingChannel.phone_number).replace(/\D/g, '') : null,
          company_id: editingChannel.company_id || null,
          company_name: companyName,
          department_id: editingChannel.department_id || null,
          ai_agent_id: editingChannel.ai_agent_id || null,
          api_token: cleanToken,
          instance_token: cleanToken,
          status: editingChannel.status || 'connected',
          auto_reject_calls: editingChannel.auto_reject_calls ?? false,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingChannel.id)

      if (error) {
        alert('Erro ao salvar canal: ' + error.message)
      } else {
        setEditingChannel(null)
        fetchAllData()
      }
    } catch (err: any) {
      alert('Erro ao atualizar: ' + err.message)
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleDelete = async (id: string) => {
     if (confirm('Deseja realmente remover este canal e desconectar da UazAPI?')) {
        try {
          const res = await fetch('/api/channels/uazapi/delete-instance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId: id })
          })
          const data = await res.json()
          if (!res.ok) {
            alert('Aviso ao excluir: ' + (data.error || 'Erro'))
          }
          fetchAllData()
        } catch(e: any) {
          alert('Erro ao excluir: ' + e.message)
        }
     }
  }

  const [syncingChannelId, setSyncingChannelId] = useState<string | null>(null)
  const [isRematching, setIsRematching] = useState(false)
  const [isClearingAll, setIsClearingAll] = useState(false)

  // Organized Import Modal state
  const [importModalChannel, setImportModalChannel] = useState<any | null>(null)
  const [importTokenInput, setImportTokenInput] = useState('')
  const [importPreview, setImportPreview] = useState<any | null>(null)
  const [isAnalyzingImport, setIsAnalyzingImport] = useState(false)
  const [isExecutingImport, setIsExecutingImport] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const handleConnectQr = async (channel: any) => {
    setSyncingChannelId(channel.id)
    try {
      const res = await fetch('/api/channels/uazapi/sync-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect_qr', channelId: channel.id })
      })
      const data = await res.json()
      if (data.qrcode) {
        setQrModalData({ name: channel.name, qrcode: data.qrcode })
      } else if (data.status === 'connected') {
        alert('Esta instância já está conectada (connected)!')
      } else {
        alert(data.error || 'Não foi possível gerar o QR Code no momento. Verifique o token da instância na UazAPI.')
      }
      fetchAllData()
    } catch (err: any) {
      alert('Erro ao solicitar QR Code: ' + err.message)
    } finally {
      setSyncingChannelId(null)
    }
  }

  const runChannelPreview = async (channel: any, tokenOverride?: string) => {
    setIsAnalyzingImport(true)
    setImportError(null)
    try {
      const res = await fetch('/api/channels/uazapi/sync-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview_channel',
          channelId: channel.id,
          tokenOverride: tokenOverride || undefined
        })
      })
      const data = await res.json()
      if (!res.ok) {
        setImportError(data.error || 'Erro ao analisar conversas na UazAPI')
        setImportPreview(null)
      } else {
        setImportPreview(data)
        fetchAllData()
      }
    } catch (err: any) {
      setImportError('Erro de conexão: ' + err.message)
    } finally {
      setIsAnalyzingImport(false)
    }
  }

  const handleOpenImportModal = (channel: any) => {
    const existingTk = channel.instance_token || channel.api_token || ''
    setImportModalChannel(channel)
    setImportTokenInput(existingTk)
    setImportPreview(null)
    setImportError(null)
    if (existingTk) {
      runChannelPreview(channel, existingTk)
    }
  }

  const handleExecuteOrganizedImport = async (filterMode: 'matched_only' | 'recent_30d' | 'all') => {
    if (!importModalChannel) return
    setIsExecutingImport(true)
    setImportError(null)
    try {
      const res = await fetch('/api/channels/uazapi/sync-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync_channel',
          channelId: importModalChannel.id,
          tokenOverride: importTokenInput || undefined,
          filterMode,
          importMessages: true
        })
      })
      const data = await res.json()
      if (!res.ok) {
        setImportError(data.error || 'Erro ao importar conversas')
      } else {
        alert(data.message || 'Importação concluída com sucesso!')
        setImportModalChannel(null)
        fetchAllData()
      }
    } catch (err: any) {
      setImportError('Erro ao importar: ' + err.message)
    } finally {
      setIsExecutingImport(false)
    }
  }

  const handleRematchAllWorkers = async () => {
    setIsRematching(true)
    try {
      const res = await fetch('/api/channels/uazapi/sync-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rematch_workers' })
      })
      const data = await res.json()
      alert(data.message || 'Cruzamento concluído!')
    } catch (err: any) {
      alert('Erro ao cruzar números: ' + err.message)
    } finally {
      setIsRematching(false)
    }
  }

  const handleClearAllConversations = async () => {
    if (!confirm('ATENÇÃO: Deseja realmente ZERAR todas as conversas e mensagens do MCS Chat para começar do zero?')) return
    setIsClearingAll(true)
    try {
      const res = await fetch('/api/channels/uazapi/sync-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_all_conversations' })
      })
      const data = await res.json()
      alert(data.message || 'Todas as conversas foram zeradas!')
    } catch (err: any) {
      alert('Erro ao zerar conversas: ' + err.message)
    } finally {
      setIsClearingAll(false)
    }
  }

  const filteredChannels = channels.filter(ch => {
    if (typeFilter === 'all') return true
    const chType = ch.channel_type || (ch.name?.toLowerCase().includes('cliente') ? 'clients' : 'workers')
    return chType === typeFilter
  })

  return (
    <div className="flex-1 overflow-y-auto p-8 relative">
       
       <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Canais de Atendimento WhatsApp</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Vincule cada canal de WhatsApp à sua Empresa, Público (Trabalhadores vs Clientes), Departamento padrão e Atendentes.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleRematchAllWorkers}
              disabled={isRematching}
              className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Cruzar todos os telefones do WhatsApp com o cadastro de Trabalhadores (core_personal.workers)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRematching ? 'animate-spin' : ''}`} />
              <span>{isRematching ? 'Cruzando...' : 'Cruzar Telefones c/ Trabalhadores'}</span>
            </button>

            <button
              onClick={handleClearAllConversations}
              disabled={isClearingAll}
              className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Zerar todas as conversas e mensagens para recomeçar do zero"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isClearingAll ? 'Zerando...' : 'Zerar Conversas'}</span>
            </button>

            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold self-start">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                typeFilter === 'all' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600'
              }`}
            >
              Todos ({channels.length})
            </button>
            <button
              onClick={() => setTypeFilter('workers')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                typeFilter === 'workers' ? 'bg-teal-600 text-white shadow-xs' : 'text-slate-600 hover:text-teal-700'
              }`}
            >
              👷 Trabalhadores ({channels.filter(c => (c.channel_type || 'workers') === 'workers').length})
            </button>
            <button
              onClick={() => setTypeFilter('clients')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                typeFilter === 'clients' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 hover:text-purple-700'
              }`}
            >
              🏢 Clientes / Obras ({channels.filter(c => c.channel_type === 'clients').length})
            </button>
            <button
              onClick={() => setTypeFilter('general')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                typeFilter === 'general' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-amber-700'
              }`}
            >
              🚗 Frota & EPI ({channels.filter(c => c.channel_type === 'general').length})
            </button>
          </div>
          </div>
       </div>

       {/* Modal de Importação Organizada de Conversas da UazAPI */}
       {importModalChannel && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-2xl w-full space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col">
               <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                       <RefreshCw className={`w-5 h-5 text-indigo-600 ${isAnalyzingImport || isExecutingImport ? 'animate-spin' : ''}`} />
                       Importador Organizado WhatsApp ({importModalChannel.display_label || importModalChannel.name})
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                       Instância UazAPI: <span className="font-mono font-bold">{importModalChannel.name}</span> {importModalChannel.phone_number ? `• +${importModalChannel.phone_number}` : ''}
                    </p>
                  </div>
                  <button onClick={() => setImportModalChannel(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                     <X className="w-5 h-5" />
                  </button>
               </div>

               {/* Token da Instância se necessário */}
               <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
                    🔑 Token da Instância na UazAPI ({importModalChannel.name})
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={importTokenInput}
                      onChange={e => setImportTokenInput(e.target.value)}
                      placeholder="Cole aqui o token desta instância na UazAPI (ex: 995f0eb7-...)"
                      className="flex-1 px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                    <button
                      onClick={() => runChannelPreview(importModalChannel, importTokenInput)}
                      disabled={isAnalyzingImport || !importTokenInput.trim()}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl cursor-pointer transition-colors"
                    >
                      {isAnalyzingImport ? 'Analisando na UazAPI...' : 'Analisar Conversas'}
                    </button>
                  </div>
               </div>

               {importError && (
                 <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                   ⚠️ {importError}
                 </div>
               )}

               {isAnalyzingImport && (
                 <div className="py-10 text-center space-y-2">
                   <RefreshCw className="w-7 h-7 text-indigo-600 animate-spin mx-auto" />
                   <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                     Consultando histórico na UazAPI e cruzando telefones com o cadastro de Trabalhadores (MCS)...
                   </p>
                 </div>
               )}

               {importPreview && !isAnalyzingImport && (
                 <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                    {/* Cards de Resumo */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                       <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
                          <div className="text-lg font-extrabold text-slate-800 dark:text-white">{importPreview.totalIndividualChats}</div>
                          <div className="text-[11px] text-slate-500 font-medium">Conversas Individuais</div>
                       </div>
                       <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-center">
                          <div className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300">{importPreview.matchedWorkersCount}</div>
                          <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">👷 Trabalhadores MCS</div>
                       </div>
                       <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-center">
                          <div className="text-lg font-extrabold text-blue-700 dark:text-blue-300">{importPreview.recent30dCount}</div>
                          <div className="text-[11px] text-blue-700 dark:text-blue-400 font-bold">📅 Ativas (Últ. 30 dias)</div>
                       </div>
                       <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-center">
                          <div className="text-lg font-extrabold text-amber-700 dark:text-amber-300">{importPreview.unmatchedCount}</div>
                          <div className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">❓ Sem Vínculo Automático</div>
                       </div>
                    </div>

                    {/* Prévia dos Trabalhadores Encontrados */}
                    {importPreview.sampleMatched?.length > 0 && (
                      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                        <div className="bg-emerald-50/70 dark:bg-emerald-950/30 px-3.5 py-2 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                          ✅ Prévia de Trabalhadores Identificados pelo Número ({importPreview.matchedWorkersCount} encontrados)
                        </div>
                        <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                          {importPreview.sampleMatched.map((m: any, idx: number) => (
                            <div key={idx} className="px-3.5 py-2 flex items-center justify-between gap-2">
                              <div>
                                <span className="font-bold text-slate-800 dark:text-white">{m.workerName}</span>
                                <span className="text-slate-400 font-mono ml-2">+{m.phone}</span>
                                {m.lastMessage && (
                                  <p className="text-[11px] text-slate-500 truncate max-w-md">{m.lastMessage}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {m.company && (
                                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold">
                                    🏢 {m.company}
                                  </span>
                                )}
                                {m.client && (
                                  <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-[10px] font-bold max-w-[150px] truncate">
                                    🏗️ {m.client}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Botões de Importação Organizada */}
                    <div className="space-y-2 pt-2">
                       <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                         Escolha como deseja importar para o MCS Chat:
                       </p>
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                          <button
                            onClick={() => handleExecuteOrganizedImport('matched_only')}
                            disabled={isExecutingImport}
                            className="p-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-left transition-colors cursor-pointer shadow-sm"
                          >
                            <div className="text-xs font-extrabold">1. Apenas Trabalhadores ({importPreview.matchedWorkersCount})</div>
                            <div className="text-[10px] text-emerald-100 mt-0.5">
                              Recomendado: importa só quem já tem cadastro identificado no MCS.
                            </div>
                          </button>

                          <button
                            onClick={() => handleExecuteOrganizedImport('recent_30d')}
                            disabled={isExecutingImport}
                            className="p-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-left transition-colors cursor-pointer shadow-sm"
                          >
                            <div className="text-xs font-extrabold">2. Ativas Últ. 30 Dias ({importPreview.recent30dCount})</div>
                            <div className="text-[10px] text-indigo-100 mt-0.5">
                              Importa conversas recentes (identificadas + novos números para vincular).
                            </div>
                          </button>

                          <button
                            onClick={() => handleExecuteOrganizedImport('all')}
                            disabled={isExecutingImport}
                            className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-left transition-colors cursor-pointer shadow-sm"
                          >
                            <div className="text-xs font-extrabold">3. Todas Individuais ({importPreview.totalIndividualChats})</div>
                            <div className="text-[10px] text-slate-300 mt-0.5">
                              Importa todo o histórico individual da instância (ignora grupos).
                            </div>
                          </button>
                       </div>
                    </div>
                 </div>
               )}
            </div>
         </div>
       )}

       {/* Modal QR Code */}
       {qrModalData && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800">
               <h3 className="text-base font-bold text-slate-800 dark:text-white">Escanear QR Code WhatsApp</h3>
               <p className="text-xs text-slate-500">Abra o WhatsApp no celular &gt; Aparelhos Conectados &gt; Conectar Aparelho</p>
               <div className="flex justify-center p-4 bg-white rounded-2xl border border-slate-100 shadow-inner">
                  <img src={qrModalData.qrcode} alt="QR Code" className="w-52 h-52 object-contain" />
               </div>
               <button
                 onClick={() => setQrModalData(null)}
                 className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors"
               >
                 Concluir
               </button>
            </div>
         </div>
       )}

       {/* Modal de Edição de Vínculos do Canal */}
       {editingChannel && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800">
               <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                     <Settings2 className="w-5 h-5 text-emerald-600" />
                     Configurar Vínculos do Canal ({editingChannel.name})
                  </h3>
                  <button onClick={() => setEditingChannel(null)} className="text-slate-400 hover:text-slate-600">
                     <X className="w-5 h-5" />
                  </button>
               </div>

               <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                     <div>
                        <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">Nome de Exibição no Inbox</label>
                        <input
                          type="text"
                          value={editingChannel.display_label || ''}
                          onChange={e => setEditingChannel({ ...editingChannel, display_label: e.target.value })}
                          placeholder="Ex: WISEOWE • Trabalhadores"
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                        />
                     </div>
                     <div>
                        <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">🎯 Público / Tipo do Canal</label>
                        <select
                          value={editingChannel.channel_type || 'workers'}
                          onChange={e => setEditingChannel({ ...editingChannel, channel_type: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                        >
                          <option value="workers">👷 Trabalhadores / Colaboradores</option>
                          <option value="clients">🏢 Clientes / Obras / Comercial</option>
                          <option value="general">🚗 Geral / Frota / Segurança (EPI)</option>
                        </select>
                     </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                     <div>
                        <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">Instância Técnica (UazAPI)</label>
                        <input
                          type="text"
                          value={editingChannel.name || ''}
                          onChange={e => setEditingChannel({ ...editingChannel, name: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                        />
                     </div>

                     <div>
                        <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">Número de Telefone</label>
                        <input
                          type="text"
                          value={editingChannel.phone_number || ''}
                          onChange={e => setEditingChannel({ ...editingChannel, phone_number: e.target.value })}
                          placeholder="Ex: 34937374181"
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                        />
                     </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                     <div>
                        <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">🏢 Empresa Vinculada</label>
                        <select
                          value={editingChannel.company_id || ''}
                          onChange={e => setEditingChannel({ ...editingChannel, company_id: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                        >
                          <option value="">Nenhuma / Geral ({editingChannel.company_name || 'Sem empresa'})</option>
                          {companies.map(emp => (
                            <option key={emp.id} value={emp.id}>
                              {emp.trade_name || emp.nome}
                            </option>
                          ))}
                        </select>
                     </div>

                     <div>
                        <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">📁 Departamento Padrão</label>
                        <select
                          value={editingChannel.department_id || ''}
                          onChange={e => setEditingChannel({ ...editingChannel, department_id: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                        >
                          <option value="">Sem Departamento Fixo</option>
                          {departments.map(dept => (
                            <option key={dept.id} value={dept.id}>
                              {dept.name}
                            </option>
                          ))}
                        </select>
                     </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                     <div>
                        <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">🤖 Agente de IA para Triagem Automática</label>
                        <select
                          value={editingChannel.ai_agent_id || ''}
                          onChange={e => setEditingChannel({ ...editingChannel, ai_agent_id: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                        >
                          <option value="">Nenhum (Apenas Atendentes Humanos)</option>
                          {agents.map(ag => (
                            <option key={ag.id} value={ag.id}>
                              {ag.name}
                            </option>
                          ))}
                        </select>
                     </div>

                     <div>
                        <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">🔑 Token da Instância (UazAPI)</label>
                        <input
                          type="text"
                          value={editingChannel.api_token || editingChannel.instance_token || ''}
                          onChange={e => setEditingChannel({ ...editingChannel, api_token: e.target.value, instance_token: e.target.value })}
                          placeholder="Capturado via Webhook ou cole aqui"
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-[11px]"
                        />
                     </div>
                  </div>

                  <div className="pt-2">
                     <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingChannel.auto_reject_calls || false}
                          onChange={e => setEditingChannel({ ...editingChannel, auto_reject_calls: e.target.checked })}
                          className="rounded text-emerald-600"
                        />
                        <span className="text-slate-700 dark:text-slate-300 font-medium">
                          Auto-recusar chamadas de voz e orientar atendimento por mensagem
                        </span>
                     </label>
                  </div>
               </div>

               <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => setEditingChannel(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={isSavingEdit}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-1.5"
                  >
                    <Save className="w-4 h-4" />
                    {isSavingEdit ? 'Salvando...' : 'Salvar Vínculos'}
                  </button>
               </div>
            </div>
         </div>
       )}

       {/* Lista de Canais */}
       <div className="space-y-3 mb-12">
          {loading ? (
            <p className="text-slate-400 dark:text-slate-500 text-sm">Carregando canais...</p>
          ) : filteredChannels.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-center">
               <p className="text-slate-500 dark:text-slate-400 font-medium">Nenhum canal de WhatsApp encontrado neste filtro.</p>
            </div>
          ) : (
            filteredChannels.map(channel => {
               const matchedAgent = agents.find(a => a.id === channel.ai_agent_id)
               const matchedDept = departments.find(d => d.id === channel.department_id)
               const chType = channel.channel_type || (channel.name?.toLowerCase().includes('cliente') ? 'clients' : 'workers')

               return (
                  <div key={channel.id} className="p-5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between shadow-sm hover:border-emerald-500/40 transition-all">
                     <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm ${
                          chType === 'clients'
                            ? 'bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400'
                            : chType === 'general'
                              ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
                              : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                        }`}>
                           {chType === 'clients' ? '🏢' : chType === 'general' ? '🚗' : '👷'}
                        </div>
                        <div>
                           <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-sm text-slate-800 dark:text-white">
                                {channel.display_label || channel.name}
                              </h4>
                              <span className="text-[11px] text-slate-400 font-mono">
                                ({channel.name})
                              </span>
                              {channel.phone_number && (
                                <span className="text-xs text-slate-500 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                                  +{channel.phone_number}
                                </span>
                              )}
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                channel.status === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {channel.status || 'ativo'}
                              </span>
                              {channel.company_name && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200/60">
                                  🏢 {channel.company_name}
                                </span>
                              )}
                              {chType === 'clients' ? (
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-200">
                                  🏢 Canal de Clientes / Obras
                                </span>
                              ) : chType === 'general' ? (
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200">
                                  🚗 Canal Geral / Frota / EPI
                                </span>
                              ) : (
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 border border-teal-200">
                                  👷 Canal de Trabalhadores
                                </span>
                              )}
                           </div>
                           <div className="flex items-center gap-3 text-xs text-slate-400 mt-1.5 flex-wrap">
                              {matchedAgent?.name ? (
                                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                                  <Bot className="w-3.5 h-3.5" /> IA: {matchedAgent.name}
                                </span>
                              ) : (
                                <span className="text-slate-400">🤖 Sem IA (Humano)</span>
                              )}
                              {matchedDept?.name ? (
                                <span className="text-slate-600 dark:text-slate-300 font-medium">📁 Fila Padrão: {matchedDept.name}</span>
                              ) : (
                                <span className="text-slate-400">📁 Fila Padrão: Geral</span>
                              )}
                           </div>
                        </div>
                     </div>

                     <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleConnectQr(channel)}
                          disabled={syncingChannelId === channel.id}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors text-xs font-bold flex items-center gap-1 cursor-pointer"
                          title="Conectar WhatsApp / Gerar QR Code na UazAPI"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span className="hidden lg:inline">QR Code</span>
                        </button>
                        <button
                          onClick={() => handleOpenImportModal(channel)}
                          disabled={syncingChannelId === channel.id}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors text-xs font-bold flex items-center gap-1 cursor-pointer"
                          title="Abrir Importador Organizado de Conversas desta instância na UazAPI"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${syncingChannelId === channel.id ? 'animate-spin' : ''}`} />
                          <span className="hidden lg:inline">Importar & Cruzar</span>
                        </button>
                        <button
                          onClick={() => setEditingChannel(channel)}
                          className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors cursor-pointer"
                          title="Editar Vínculos (Público, Empresa, Depto, IA)"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setSelectedChannelId(channel.id); setSelectedChannelName(channel.display_label || channel.name); setIsMembersModalOpen(true); }}
                          className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors cursor-pointer"
                          title="Gerenciar Atendentes Autorizados"
                        >
                          <Users className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(channel.id)}
                          className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
                          title="Excluir Canal"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                     </div>
                  </div>
               )
            })
          )}
       </div>

       {/* Formulário de Criação de Novo Canal */}
       <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <h3 className="text-base font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
             <Plus className="w-5 h-5 text-emerald-600" />
             Adicionar Novo Canal de WhatsApp
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
             <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Nome da Instância (UazAPI)</label>
                <input
                  type="text"
                  placeholder="Ex: oldstoccotrabajadores"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono"
                />
             </div>

             <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Número WhatsApp</label>
                <input
                  type="text"
                  placeholder="Ex: 34685818604"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono"
                />
             </div>

             <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Token da Instância (Opcional)</label>
                <input
                  type="text"
                  placeholder="Token na UazAPI..."
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono"
                />
             </div>

             <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">🎯 Público do Canal</label>
                <select
                  value={channelType}
                  onChange={(e) => setChannelType(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="workers">👷 Trabalhadores</option>
                  <option value="clients">🏢 Clientes / Obras</option>
                  <option value="general">🚗 Geral / Frota / EPI</option>
                </select>
             </div>
             
             <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Empresa Vinculada</label>
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="">Selecione a Empresa...</option>
                  {companies.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.trade_name || emp.nome} ({emp.codigo})</option>
                  ))}
                </select>
             </div>

             <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Agente de IA para Triagem</label>
                <select
                  value={aiAgentId}
                  onChange={(e) => setAiAgentId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="">Nenhum (Sem IA / Apenas Humano)</option>
                  {agents.map(agent => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
             </div>
          </div>

          <div className="flex justify-end">
             <button
               onClick={handleCreateChannel}
               disabled={isCreating}
               className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
             >
               <Plus className="w-4 h-4" />
               {isCreating ? 'Vinculando Instância...' : 'Vincular Instância Ativa da UazAPI'}
             </button>
          </div>
       </div>

       {/* Modal Gerenciar Membros/Atendentes */}
       <MembersModal 
          isOpen={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
          channelId={selectedChannelId}
          channelName={selectedChannelName}
       />

    </div>
  )
}
