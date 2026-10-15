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

  // Edit Channel Modal state
  const [editingChannel, setEditingChannel] = useState<any | null>(null)
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Members Modal state
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false)
  const [selectedChannelId, setSelectedChannelId] = useState('')
  const [selectedChannelName, setSelectedChannelName] = useState('')

  const [provider, setProvider] = useState('uazapi')
  const [name, setName] = useState('')
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
      .order('created_at', { ascending: true })

    if (chs && !chsErr) {
      chsData = chs
    } else {
      const { data: fallbackChs } = await supabase.from('chat_channels').select('*').order('created_at', { ascending: true })
      if (fallbackChs) chsData = fallbackChs
    }

    const { data: emps } = await supabase.schema('core_common').from('empresas').select('id, nome, trade_name, codigo')
    const { data: ags } = await supabase.from('chat_ai_agents').select('id, name')
    const { data: depts } = await supabase.from('mcs_departments').select('id, name').eq('active', true)

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
       alert('Por favor, informe o nome do canal.')
       return
    }
    
    setIsCreating(true)
    try {
      const selectedCompany = companies.find(c => c.id === companyId)
      const res = await fetch('/api/channels/uazapi/instance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName: name,
          companyId: companyId || null,
          companyName: selectedCompany?.trade_name || selectedCompany?.nome || null,
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
      const companyName = selectedCompany ? (selectedCompany.trade_name || selectedCompany.nome) : null

      const { error } = await supabase
        .from('chat_channels')
        .update({
          name: editingChannel.name,
          phone_number: editingChannel.phone_number || null,
          company_id: editingChannel.company_id || null,
          company_name: companyName,
          department_id: editingChannel.department_id || null,
          ai_agent_id: editingChannel.ai_agent_id || null,
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

  return (
    <div className="flex-1 overflow-y-auto p-8 relative">
       
       <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Canais de Atendimento WhatsApp</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Vincule cada canal de WhatsApp à sua Empresa, Departamento padrão, Agente de IA para triagem e Atendentes autorizados.
            </p>
          </div>
       </div>

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
                  <div>
                     <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">Nome do Canal</label>
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                     <div>
                        <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">🏢 Empresa Vinculada</label>
                        <select
                          value={editingChannel.company_id || ''}
                          onChange={e => setEditingChannel({ ...editingChannel, company_id: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                        >
                          <option value="">Nenhuma / Geral</option>
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
       <div className="space-y-4 mb-12">
          {loading ? (
            <p className="text-slate-400 dark:text-slate-500 text-sm">Carregando canais...</p>
          ) : channels.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-center">
               <p className="text-slate-500 dark:text-slate-400 font-medium">Nenhum canal de WhatsApp configurado.</p>
               <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Conecte o primeiro canal de empresa abaixo.</p>
            </div>
          ) : (
            channels.map(channel => {
               const matchedAgent = agents.find(a => a.id === channel.ai_agent_id)
               const matchedDept = departments.find(d => d.id === channel.department_id)

               return (
                  <div key={channel.id} className="p-5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between shadow-sm hover:border-emerald-500/40 transition-all">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
                           WA
                        </div>
                        <div>
                           <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-sm text-slate-800 dark:text-white">{channel.name}</h4>
                              {channel.phone_number && (
                                <span className="text-xs text-slate-400 font-mono">
                                  +{channel.phone_number}
                                </span>
                              )}
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                channel.status === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {channel.status || 'ativo'}
                              </span>
                              {channel.company_name && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                  🏢 {channel.company_name}
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
                                <span className="text-slate-600 dark:text-slate-300 font-medium">📁 Depto: {matchedDept.name}</span>
                              ) : (
                                <span className="text-slate-400">📁 Depto: Geral</span>
                              )}
                           </div>
                        </div>
                     </div>

                     <div className="flex items-center gap-2">
                        {channel.qrcode_base64 && (
                           <button
                             onClick={() => setQrModalData({ name: channel.name, qrcode: channel.qrcode_base64 })}
                             className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                             title="Ver QR Code"
                           >
                             <QrCode className="w-4 h-4" />
                           </button>
                        )}
                        <button
                          onClick={() => setEditingChannel(channel)}
                          className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors"
                          title="Editar Vínculos (Empresa, Depto, IA)"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setSelectedChannelId(channel.id); setSelectedChannelName(channel.name); setIsMembersModalOpen(true); }}
                          className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors"
                          title="Gerenciar Atendentes Autorizados"
                        >
                          <Users className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(channel.id)}
                          className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
             <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Nome da Instância / Canal</label>
                <input
                  type="text"
                  placeholder="Ex: Zap STOCCO Trabalhadores"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
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
               className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50"
             >
               <Plus className="w-4 h-4" />
               {isCreating ? 'Provisionando na UazAPI...' : 'Conectar Canal WhatsApp'}
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
