"use client"
import { useState, useEffect } from 'react'
import { Plus, Server, CheckCircle2, AlertCircle, Phone, Globe, Key, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

export default function ChannelsAdminPage() {
  const [channels, setChannels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)

  const [provider, setProvider] = useState('uazapi')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [apiToken, setApiToken] = useState('')
  
  const fetchChannels = async () => {
    setLoading(true)
    const { data } = await supabase.from('chat_channels').select('*').order('created_at', { ascending: true })
    if (data) setChannels(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchChannels()
  }, [])

  const handleCreateChannel = async () => {
    if (!name || (!apiUrl && provider !== 'meta') || !apiToken) {
       alert('Preencha os campos obrigatórios básicos (Nome, URL da API e Token).')
       return
    }
    
    setIsCreating(true)
    const { error } = await supabase.from('chat_channels').insert({
      name,
      phone_number: phone,
      provider,
      api_url: apiUrl,
      api_token: apiToken,
      is_active: true
    })
    setIsCreating(false)
    if (!error) {
      setName('')
      setPhone('')
      setApiUrl('')
      setApiToken('')
      fetchChannels()
    } else {
      console.error(error)
      alert('Erro ao vincular canal')
    }
  }

  const handleDelete = async (id: string) => {
     if (confirm('Deseja realmente remover este canal? As mensagens atreladas poderão ficar órfãs.')) {
        await supabase.from('chat_channels').delete().eq('id', id)
        fetchChannels()
     }
  }

  const getProviderIcon = (prov: string) => {
     switch(prov) {
        case 'uazapi': return { text: 'UAZ', color: 'bg-blue-100 text-blue-700' }
        case 'evolution': return { text: 'EVO', color: 'bg-emerald-100 text-emerald-700' }
        case 'zapi': return { text: 'ZAP', color: 'bg-amber-100 text-amber-700' }
        case 'meta': return { text: 'META', color: 'bg-green-100 text-green-700' }
        default: return { text: 'API', color: 'bg-slate-100 text-slate-700' }
     }
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 relative">
       
       <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Canais de Atendimento</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Configure suas integrações de WhatsApp API (Provedores) para o Inbox.</p>
          </div>
       </div>

       {/* Lista de Canais */}
       <div className="space-y-4 mb-12">
          {loading ? (
            <p className="text-slate-400 dark:text-slate-500 text-sm">Carregando canais...</p>
          ) : channels.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-center">
               <p className="text-slate-500 dark:text-slate-400 font-medium">Nenhuma integração de API configurada.</p>
               <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Adicione seu primeiro provedor abaixo.</p>
            </div>
          ) : (
            channels.map(channel => {
               const pIcon = getProviderIcon(channel.provider || 'evolution')
               return (
                 <div key={channel.id} className="flex items-center justify-between p-5 rounded-2xl border border-slate-200 bg-white hover:border-indigo-200 transition-colors shadow-sm group">
                    <div className="flex items-center gap-4">
                       <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black tracking-tighter text-sm ${pIcon.color}`}>
                          {pIcon.text}
                       </div>
                       <div>
                          <h4 className="font-bold text-slate-800 flex items-center gap-2">
                             {channel.name}
                             <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-500">
                                {channel.provider?.toUpperCase()}
                             </span>
                          </h4>
                          <div className="flex items-center gap-3 mt-1.5">
                             <span className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                                <Phone className="w-3.5 h-3.5" /> {channel.phone_number || 'Sem número'}
                             </span>
                             <span className="flex items-center gap-1 text-xs text-slate-500 font-medium max-w-[200px] truncate">
                                <Globe className="w-3.5 h-3.5" /> {(channel.api_url || '').replace(/https?:\/\//, '') || 'URL oculta'}
                             </span>
                          </div>
                       </div>
                    </div>
                    <div className="flex items-center gap-4">
                       <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 uppercase tracking-widest">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Active
                       </span>
                       <button onClick={() => handleDelete(channel.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                          <Trash2 className="w-4 h-4" />
                       </button>
                    </div>
                 </div>
               )
            })
          )}
       </div>

       {/* Formulario Nova Conexão */}
       <div className="bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/60 rounded-3xl p-8 mb-8">
          <div className="flex items-center gap-3 mb-6">
             <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Plus className="w-5 h-5" />
             </div>
             <h3 className="font-bold text-slate-800 dark:text-white text-lg">Nova Conexão Multi-Provedor</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
             {/* Provider */}
             <div>
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1 mb-2 block">Provedor de API</label>
                <select 
                   value={provider}
                   onChange={e => setProvider(e.target.value)}
                   className="w-full p-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 outline-none text-[15px] font-bold text-slate-800 dark:text-white transition-all appearance-none cursor-pointer"
                >
                   <option value="uazapi">UAZ API (Recomendado)</option>
                   <option value="evolution">Evolution API</option>
                   <option value="zapi">Z-API</option>
                   <option value="meta">WhatsApp Cloud Oficial (Meta)</option>
                </select>
             </div>
             
             {/* Name */}
             <div>
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1 mb-2 block">Nome da Instância</label>
                <input 
                   value={name}
                   onChange={e => setName(e.target.value)}
                   className="w-full p-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 outline-none text-[15px] font-medium transition-all text-slate-800 dark:text-white"
                   placeholder="Ex: uaz_rh_principal"
                />
             </div>

             {/* Phone */}
             <div>
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1 mb-2 block">Número do WhatsApp</label>
                <div className="relative">
                   <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                   <input 
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="w-full py-3.5 pl-11 pr-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 outline-none text-[15px] font-medium transition-all text-slate-800 dark:text-white"
                      placeholder="5511999999999"
                   />
                </div>
             </div>

             {/* API URL */}
             <div>
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1 mb-2 block">URL Base da API</label>
                <div className="relative">
                   <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                   <input 
                      value={apiUrl}
                      onChange={e => setApiUrl(e.target.value)}
                      className="w-full py-3.5 pl-11 pr-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 outline-none text-[15px] font-medium transition-all text-slate-800 dark:text-white"
                      placeholder="https://sua-api.com"
                   />
                </div>
             </div>
             
             {/* Token */}
             <div className="md:col-span-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide ml-1 mb-2 block">API Token / Global Key</label>
                <div className="relative">
                   <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                   <input 
                      type="password"
                      value={apiToken}
                      onChange={e => setApiToken(e.target.value)}
                      className="w-full py-3.5 pl-11 pr-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 outline-none text-[15px] font-medium transition-all text-slate-800 dark:text-white"
                      placeholder="Cole o token administrativo de integração..."
                   />
                </div>
             </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-200/60 dark:border-slate-700/60 mt-6">
             <button 
                onClick={handleCreateChannel}
                disabled={isCreating}
                className="px-8 py-3.5 bg-indigo-600 text-white font-bold rounded-xl shadow-md shadow-indigo-200 hover:bg-indigo-700 hover:shadow-lg transition-all disabled:opacity-50"
             >
                {isCreating ? 'Conectando...' : 'Adicionar Provedor'}
             </button>
          </div>
       </div>

    </div>
  )
}
