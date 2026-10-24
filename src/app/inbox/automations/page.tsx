"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Megaphone,
  Users,
  Send,
  AlertCircle,
  CheckCircle2,
  Building2,
  Briefcase,
  Loader2,
  Check,
  Search,
  Plus,
  Trash2,
  Pencil,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  ShieldCheck,
  RefreshCw,
  Pause,
  Play,
  XCircle,
  Clock,
  Layers,
  Languages,
  Copy,
  ExternalLink,
  Filter,
  UserPlus,
  CheckSquare,
  Square,
  Sparkles,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { translateOutboundMessage } from '@/app/actions/translation-actions'
import Link from 'next/link'

interface WorkerRow {
  id: string
  cod_colab?: string | null
  nome: string
  movil?: string | null
  contratante?: string | null
  cliente?: string | null
  funcion?: string | null
  status_trabajador?: string | null
  status_seguridad?: string | null
  pedido_code?: string | null
  obra_nome?: string | null
}

interface PedidoOverview {
  cod_pedido: string
  cliente_nome: string
  obra_nome: string
  data_inicio?: string | null
  status_pedido?: string | null
  worker_ids: string[]
  worker_codes: string[]
}

interface CampaignTemplate {
  id: string
  title: string
  category: string
  content: string
  media_url?: string | null
  media_type?: string | null
  media_filename?: string | null
  link_url?: string | null
  created_at?: string
}

const TEMPLATE_CATEGORIES: Array<{ id: string; label: string; badgeClass: string }> = [
  { id: 'alojamento', label: '🏠 Alojamento & Endereço', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'inicio_obra', label: '🏗️ Início de Obra / Pedido', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { id: 'horas', label: '⏱️ Folha de Horas', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' },
  { id: 'documentos', label: '📄 Documentos / Contrato', badgeClass: 'bg-purple-100 text-purple-800 border-purple-200' },
  { id: 'comunicado', label: '📢 Comunicado Geral', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
]

function normalizePhoneDigits(raw?: string | null): string {
  if (!raw) return ''
  let clean = raw.replace(/\D/g, '')
  if (!clean) return ''
  if (clean.startsWith('00')) clean = clean.replace(/^00+/, '')
  if (clean.length === 9 && (clean.startsWith('6') || clean.startsWith('7'))) return '34' + clean
  if (clean.length === 9 && clean.startsWith('9')) return '351' + clean
  if (clean.length === 10 && clean.startsWith('3')) return '57' + clean
  return clean
}

function isWorkerActiveStatus(status?: string | null, includePendingEntry = true): boolean {
  const s = (status || '').trim().toUpperCase()
  if (s === 'ATIVO' || s === 'ACTIVE') return true
  if (includePendingEntry && (s.includes('PENDENTE') || s.includes('PENDIENTE'))) return true
  return false
}

function isWorkerInactiveOrBlocked(status?: string | null): boolean {
  const s = (status || '').trim().toUpperCase()
  return s === 'INATIVO' || s === 'DESISTIU' || s === 'DESLIGADO' || s === 'BAIXA' || s === 'AFASTADO'
}

export default function AutomationsPage() {
  // Navegação principal do módulo
  const [activeView, setActiveView] = useState<'builder' | 'templates' | 'history'>('builder')

  // Dados Base carregados do Supabase
  const [allWorkers, setAllWorkers] = useState<WorkerRow[]>([])
  const [pedidosList, setPedidosList] = useState<PedidoOverview[]>([])
  const [channels, setChannels] = useState<any[]>([])
  const [templates, setTemplates] = useState<CampaignTemplate[]>([])
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [currentUserName, setCurrentUserName] = useState('Operador MCS')

  // Segmentação (Pilar 2)
  const [segmentMode, setSegmentMode] = useState<'pedido' | 'clients' | 'companies' | 'manual'>('pedido')
  const [selectedPedidos, setSelectedPedidos] = useState<string[]>([])
  const [pedidoSearch, setPedidoSearch] = useState('')
  const [selectedClients, setSelectedClients] = useState<string[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([])
  const [includePendingIngreso, setIncludePendingIngreso] = useState(true)
  const [hideInactiveSafetyLock, setHideInactiveSafetyLock] = useState(true)
  const [workerTableSearch, setWorkerTableSearch] = useState('')
  const [extraManualWorkerIds, setExtraManualWorkerIds] = useState<string[]>([])
  const [manualAddSearch, setManualAddSearch] = useState('')
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<string>>(new Set())

  // Compositor da Campanha & Anexos (Pilar 3 & 4)
  const [campaignName, setCampaignName] = useState('')
  const [campaignCategory, setCampaignCategory] = useState('comunicado')
  const [content, setContent] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<'image' | 'document' | null>(null)
  const [mediaFilename, setMediaFilename] = useState<string | null>(null)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [translatingContent, setTranslatingContent] = useState(false)

  // Roteamento de Canal e Cadência Anti-Ban
  const [channelMode, setChannelMode] = useState<'auto_company' | 'manual'>('auto_company')
  const [selectedChannelId, setSelectedChannelId] = useState('')
  const [cadenceMode, setCadenceMode] = useState<'safe' | 'conservative' | 'fast'>('safe')
  const [dispatching, setDispatching] = useState(false)
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // CRUD de Templates State
  const [editingTemplate, setEditingTemplate] = useState<CampaignTemplate | null>(null)
  const [tplTitle, setTplTitle] = useState('')
  const [tplCategory, setTplCategory] = useState('alojamento')
  const [tplContent, setTplContent] = useState('')
  const [tplLinkUrl, setTplLinkUrl] = useState('')
  const [tplMediaUrl, setTplMediaUrl] = useState<string | null>(null)
  const [tplMediaType, setTplMediaType] = useState<'image' | 'document' | null>(null)
  const [tplMediaFilename, setTplMediaFilename] = useState<string | null>(null)
  const [savingTemplate, setSavingTemplate] = useState(false)

  // Auditoria & Histórico de Envios State (Pilar 5)
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [campaignItems, setCampaignItems] = useState<any[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [itemFilterStatus, setItemFilterStatus] = useState<'all' | 'sent' | 'pending' | 'failed'>('all')
  const [processingQueueNow, setProcessingQueueNow] = useState(false)

  const imageInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const tplImageInputRef = useRef<HTMLInputElement>(null)
  const tplDocInputRef = useRef<HTMLInputElement>(null)

  const loadTemplates = useCallback(async () => {
    const { data } = await supabase
      .from('chat_campaign_templates')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setTemplates(data)
  }, [])

  const loadCampaignsHistory = useCallback(async () => {
    const { data } = await supabase
      .from('chat_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(40)
    if (data) {
      setCampaigns(data)
      if (!selectedCampaignId && data.length > 0) {
        setSelectedCampaignId(data[0].id)
      }
    }
  }, [selectedCampaignId])

  const loadCampaignRecipientItems = useCallback(async (campId: string) => {
    if (!campId) return
    setLoadingItems(true)
    const { data } = await supabase
      .from('chat_scheduled_messages')
      .select('*')
      .eq('campaign_id', campId)
      .order('scheduled_for', { ascending: true })
    if (data) setCampaignItems(data)
    setLoadingItems(false)
  }, [])

  useEffect(() => {
    async function init() {
      setLoadingInitial(true)
      try {
        const [chRes, wrkRes, pedRes] = await Promise.all([
          supabase
            .from('chat_channels')
            .select('*')
            .eq('is_active', true)
            .order('company_name', { ascending: true }),
          supabase
            .schema('core_personal')
            .from('workers')
            .select('id, cod_colab, nome, movil, contratante, cliente, funcion, status_trabajador, status_seguridad')
            .order('nome', { ascending: true }),
          supabase.rpc('get_campaign_pedidos_overview'),
        ])

        if (chRes.data) {
          setChannels(chRes.data)
          const firstWorkerCh = chRes.data.find((c: any) => (c.channel_type || 'workers') === 'workers') || chRes.data[0]
          if (firstWorkerCh) setSelectedChannelId(firstWorkerCh.id)
        }

        if (wrkRes.data) {
          setAllWorkers(wrkRes.data)
        }

        if (Array.isArray(pedRes.data)) {
          setPedidosList(pedRes.data)
          if (pedRes.data.length > 0) {
            setSelectedPedidos([pedRes.data[0].cod_pedido])
          }
        }

        await Promise.all([loadTemplates(), loadCampaignsHistory()])

        const { data: authData } = await supabase.auth.getUser()
        if (authData?.user) {
          setCurrentUserName(
            authData.user.user_metadata?.full_name ||
              authData.user.email?.split('@')[0] ||
              'Operador MCS'
          )
        }
      } finally {
        setLoadingInitial(false)
      }
    }
    init()
  }, [loadTemplates, loadCampaignsHistory])

  // Atualização em tempo real do histórico e fila quando na aba de Auditoria ou quando há campanha rodando
  useEffect(() => {
    if (selectedCampaignId) {
      loadCampaignRecipientItems(selectedCampaignId)
    }
  }, [selectedCampaignId, loadCampaignRecipientItems])

  useEffect(() => {
    const hasRunning = campaigns.some((c) => c.status === 'running')
    if (!hasRunning && activeView !== 'history') return

    const poll = setInterval(() => {
      loadCampaignsHistory()
      if (selectedCampaignId) {
        loadCampaignRecipientItems(selectedCampaignId)
      }
    }, 5000)

    return () => clearInterval(poll)
  }, [campaigns, activeView, selectedCampaignId, loadCampaignsHistory, loadCampaignRecipientItems])

  // Listas únicas de Empresas e Clientes com contagem de trabalhadores ativos
  const companiesStats = useMemo(() => {
    const map = new Map<string, { totalActive: number; totalAll: number }>()
    allWorkers.forEach((w) => {
      const emp = (w.contratante || '').trim().toUpperCase()
      if (!emp) return
      const cur = map.get(emp) || { totalActive: 0, totalAll: 0 }
      cur.totalAll++
      if (isWorkerActiveStatus(w.status_trabajador, includePendingIngreso)) {
        cur.totalActive++
      }
      map.set(emp, cur)
    })
    return Array.from(map.entries())
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((a, b) => b.totalActive - a.totalActive || a.name.localeCompare(b.name))
  }, [allWorkers, includePendingIngreso])

  const clientsStats = useMemo(() => {
    const map = new Map<string, { totalActive: number; totalAll: number; companies: Set<string> }>()
    allWorkers.forEach((w) => {
      const cli = (w.cliente || '').trim()
      if (!cli) return
      if (selectedCompanies.length > 0) {
        const emp = (w.contratante || '').trim().toUpperCase()
        if (!selectedCompanies.includes(emp)) return
      }
      const cur = map.get(cli) || { totalActive: 0, totalAll: 0, companies: new Set<string>() }
      cur.totalAll++
      if (w.contratante) cur.companies.add(w.contratante.trim().toUpperCase())
      if (isWorkerActiveStatus(w.status_trabajador, includePendingIngreso)) {
        cur.totalActive++
      }
      map.set(cli, cur)
    })
    return Array.from(map.entries())
      .map(([name, info]) => ({
        name,
        totalActive: info.totalActive,
        totalAll: info.totalAll,
        companies: Array.from(info.companies),
      }))
      .filter((c) => (hideInactiveSafetyLock ? c.totalActive > 0 : true))
      .sort((a, b) => b.totalActive - a.totalActive || a.name.localeCompare(b.name))
  }, [allWorkers, selectedCompanies, includePendingIngreso, hideInactiveSafetyLock])

  const filteredPedidosList = useMemo(() => {
    const q = pedidoSearch.trim().toLowerCase()
    return pedidosList.filter((p) => {
      if (!q) return true
      return (
        p.cod_pedido?.toLowerCase().includes(q) ||
        p.cliente_nome?.toLowerCase().includes(q) ||
        p.obra_nome?.toLowerCase().includes(q)
      )
    })
  }, [pedidosList, pedidoSearch])

  const filteredClientsList = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    return clientsStats.filter((c) => !q || c.name.toLowerCase().includes(q))
  }, [clientsStats, clientSearch])

  // Trabalhadores resultantes da segmentação atual + adições manuais avulsas
  const candidateWorkers = useMemo(() => {
    const manualSet = new Set(extraManualWorkerIds)
    const pedidoWorkerIds = new Set<string>()
    const pedidoWorkerCodes = new Set<string>()
    const workerPedidoMap = new Map<string, { cod_pedido: string; obra_nome: string }>()

    if (segmentMode === 'pedido') {
      pedidosList
        .filter((p) => selectedPedidos.includes(p.cod_pedido))
        .forEach((p) => {
          ;(p.worker_ids || []).forEach((id) => {
            pedidoWorkerIds.add(id)
            workerPedidoMap.set(id, { cod_pedido: p.cod_pedido, obra_nome: p.obra_nome || p.cliente_nome })
          })
          ;(p.worker_codes || []).forEach((code) => {
            const normCode = String(code).trim().toUpperCase()
            pedidoWorkerCodes.add(normCode)
            workerPedidoMap.set(normCode, { cod_pedido: p.cod_pedido, obra_nome: p.obra_nome || p.cliente_nome })
          })
        })
    }

    return allWorkers
      .filter((w) => {
        // Sempre inclui se foi adicionado manualmente pelo operador
        if (manualSet.has(w.id)) return true

        // Trava de segurança anti-inativos
        if (hideInactiveSafetyLock) {
          if (isWorkerInactiveOrBlocked(w.status_trabajador)) return false
          if (!isWorkerActiveStatus(w.status_trabajador, includePendingIngreso)) return false
        }

        if (segmentMode === 'pedido') {
          if (selectedPedidos.length === 0) return false
          const codeKey = (w.cod_colab || '').trim().toUpperCase()
          return pedidoWorkerIds.has(w.id) || (codeKey !== '' && pedidoWorkerCodes.has(codeKey))
        }

        if (segmentMode === 'clients') {
          if (selectedClients.length === 0) return false
          const wCli = (w.cliente || '').trim()
          const matchesClient = selectedClients.includes(wCli)
          if (!matchesClient) return false
          if (selectedCompanies.length > 0) {
            const wEmp = (w.contratante || '').trim().toUpperCase()
            if (!selectedCompanies.includes(wEmp)) return false
          }
          return true
        }

        if (segmentMode === 'companies') {
          if (selectedCompanies.length === 0) return false
          const wEmp = (w.contratante || '').trim().toUpperCase()
          return selectedCompanies.includes(wEmp)
        }

        // Modo 'manual' (Todos os ativos / Busca livre)
        return true
      })
      .map((w) => {
        const codeKey = (w.cod_colab || '').trim().toUpperCase()
        const pedMeta = workerPedidoMap.get(w.id) || (codeKey ? workerPedidoMap.get(codeKey) : undefined)
        return {
          ...w,
          pedido_code: pedMeta?.cod_pedido || null,
          obra_nome: pedMeta?.obra_nome || w.cliente || null,
        }
      })
  }, [
    allWorkers,
    segmentMode,
    pedidosList,
    selectedPedidos,
    selectedClients,
    selectedCompanies,
    hideInactiveSafetyLock,
    includePendingIngreso,
    extraManualWorkerIds,
  ])

  // Sempre que a lista de candidatos mudar por troca de filtro de pedido/cliente/empresa, pré-seleciona todos que estão ativos e têm telefone válido
  useEffect(() => {
    const validIds = new Set<string>()
    candidateWorkers.forEach((w) => {
      const clean = normalizePhoneDigits(w.movil)
      const blocked = isWorkerInactiveOrBlocked(w.status_trabajador)
      if (clean.length >= 8 && !blocked) {
        validIds.add(w.id)
      }
    })
    setSelectedWorkerIds(validIds)
  }, [candidateWorkers])

  const displayedCandidateWorkers = useMemo(() => {
    const q = workerTableSearch.trim().toLowerCase()
    if (!q) return candidateWorkers
    return candidateWorkers.filter(
      (w) =>
        w.nome?.toLowerCase().includes(q) ||
        w.cod_colab?.toLowerCase().includes(q) ||
        w.cliente?.toLowerCase().includes(q) ||
        w.contratante?.toLowerCase().includes(q) ||
        w.funcion?.toLowerCase().includes(q) ||
        w.movil?.toLowerCase().includes(q)
    )
  }, [candidateWorkers, workerTableSearch])

  const manualSearchResults = useMemo(() => {
    const q = manualAddSearch.trim().toLowerCase()
    if (q.length < 2) return []
    const existingIds = new Set(candidateWorkers.map((w) => w.id))
    return allWorkers
      .filter(
        (w) =>
          !existingIds.has(w.id) &&
          (w.nome?.toLowerCase().includes(q) ||
            w.cod_colab?.toLowerCase().includes(q) ||
            w.movil?.toLowerCase().includes(q) ||
            w.cliente?.toLowerCase().includes(q))
      )
      .slice(0, 8)
  }, [allWorkers, manualAddSearch, candidateWorkers])

  const selectedRecipients = useMemo(
    () => candidateWorkers.filter((w) => selectedWorkerIds.has(w.id)),
    [candidateWorkers, selectedWorkerIds]
  )

  const resolveWorkerChannelPreview = useCallback(
    (contratante?: string | null) => {
      if (channelMode === 'manual') {
        return channels.find((c) => c.id === selectedChannelId) || channels[0] || null
      }
      const workerChannels = channels.filter((c) => (c.channel_type || 'workers') === 'workers')
      if (contratante) {
        const norm = contratante.trim().toUpperCase()
        const exact = workerChannels.find((c) => (c.company_name || '').trim().toUpperCase() === norm)
        if (exact) return exact
        const partial = workerChannels.find(
          (c) =>
            (c.company_name || '').toUpperCase().includes(norm) ||
            norm.includes((c.company_name || '').toUpperCase())
        )
        if (partial) return partial
      }
      return channels.find((c) => c.id === selectedChannelId) || workerChannels[0] || channels[0] || null
    },
    [channels, channelMode, selectedChannelId]
  )

  // Preview dinâmico da mensagem com os dados reais do 1º trabalhador selecionado
  const samplePreviewWorker = selectedRecipients[0] || candidateWorkers[0] || {
    nome: 'CARLOS ALBERTO PEREZ',
    contratante: 'LUMINOUS',
    cliente: 'CALDESOL',
    funcion: 'SOLDADOR MIG-MAG',
    pedido_code: selectedPedidos[0] || 'PED-2026-000954',
    obra_nome: 'CALDESOL',
  }

  const renderedPreviewText = useMemo(() => {
    if (!content.trim()) return 'O preview da mensagem personalizada aparecerá aqui...'
    const fullName = (samplePreviewWorker.nome || 'Trabalhador').trim()
    const firstName = fullName.split(/\s+/)[0] || fullName
    let out = content
      .replace(/\{nome\}/gi, fullName)
      .replace(/\{primeiro_nome\}/gi, firstName)
      .replace(/\{empresa\}/gi, samplePreviewWorker.contratante || 'LUMINOUS')
      .replace(/\{contratante\}/gi, samplePreviewWorker.contratante || 'LUMINOUS')
      .replace(/\{cliente\}/gi, samplePreviewWorker.cliente || 'Obra')
      .replace(/\{funcao\}/gi, samplePreviewWorker.funcion || 'Especialista')
      .replace(/\{funcion\}/gi, samplePreviewWorker.funcion || 'Especialista')
      .replace(/\{cod_pedido\}/gi, samplePreviewWorker.pedido_code || selectedPedidos[0] || 'PED-2026')
      .replace(/\{obra\}/gi, samplePreviewWorker.obra_nome || samplePreviewWorker.cliente || 'Obra')

    if (linkUrl.trim() && !out.includes(linkUrl.trim())) {
      out = `${out.trim()}\n\n🔗 ${linkUrl.trim()}`
    }
    return out
  }, [content, linkUrl, samplePreviewWorker, selectedPedidos])

  const handleToggleWorker = (id: string) => {
    setSelectedWorkerIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAllValid = () => {
    const next = new Set<string>()
    displayedCandidateWorkers.forEach((w) => {
      if (normalizePhoneDigits(w.movil).length >= 8 && !isWorkerInactiveOrBlocked(w.status_trabajador)) {
        next.add(w.id)
      }
    })
    setSelectedWorkerIds(next)
  }

  const handleClearSelection = () => {
    setSelectedWorkerIds(new Set())
  }

  const handleUploadAttachment = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'image' | 'document',
    forTemplateForm = false
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingMedia(true)
    try {
      const ext = file.name.split('.').pop() || (type === 'image' ? 'png' : 'pdf')
      const path = `campaign_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error } = await supabase.storage.from('chat_media').upload(path, file)
      if (error) throw error
      const { data: pub } = supabase.storage.from('chat_media').getPublicUrl(path)
      if (forTemplateForm) {
        setTplMediaUrl(pub.publicUrl)
        setTplMediaType(type)
        setTplMediaFilename(file.name)
      } else {
        setMediaUrl(pub.publicUrl)
        setMediaType(type)
        setMediaFilename(file.name)
      }
    } catch (err: any) {
      alert('Erro ao enviar arquivo: ' + (err.message || ''))
    } finally {
      setUploadingMedia(false)
      if (e.target) e.target.value = ''
    }
  }

  const handleApplyTemplate = (tpl: CampaignTemplate) => {
    setCampaignName(tpl.title)
    setCampaignCategory(tpl.category || 'comunicado')
    setContent(tpl.content || '')
    setLinkUrl(tpl.link_url || '')
    setMediaUrl(tpl.media_url || null)
    setMediaType((tpl.media_type as any) || null)
    setMediaFilename(tpl.media_filename || null)
    if (activeView !== 'builder') {
      setActiveView('builder')
    }
  }

  const handleTranslateComposerToSpanish = async (forTemplateForm = false) => {
    const sourceText = forTemplateForm ? tplContent : content
    if (!sourceText.trim() || translatingContent) return
    setTranslatingContent(true)
    try {
      const res = await translateOutboundMessage(sourceText, 'Spanish')
      if (res.success && res.translation) {
        if (forTemplateForm) setTplContent(res.translation)
        else setContent(res.translation)
      }
    } finally {
      setTranslatingContent(false)
    }
  }

  const handleDispatchCampaign = async () => {
    if (!content.trim()) {
      alert('Digite ou selecione um template de mensagem para o comunicado.')
      return
    }
    if (selectedRecipients.length === 0) {
      alert('Selecione pelo menos 1 trabalhador na lista de destinatários.')
      return
    }

    setDispatching(true)
    setFeedbackBanner(null)
    try {
      let summary = ''
      if (segmentMode === 'pedido' && selectedPedidos.length > 0) {
        summary = `Pedido(s): ${selectedPedidos.join(', ')} (${selectedRecipients.length} trab.)`
      } else if (segmentMode === 'clients' && selectedClients.length > 0) {
        summary = `Cliente(s): ${selectedClients.slice(0, 3).join(', ')}${selectedClients.length > 3 ? ` +${selectedClients.length - 3}` : ''} (${selectedRecipients.length} trab.)`
      } else if (segmentMode === 'companies' && selectedCompanies.length > 0) {
        summary = `Empresa(s): ${selectedCompanies.join(', ')} (${selectedRecipients.length} trab.)`
      } else {
        summary = `Seleção Manual (${selectedRecipients.length} trab.)`
      }

      const res = await fetch('/api/chat/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_campaign',
          name:
            campaignName.trim() ||
            `${TEMPLATE_CATEGORIES.find((c) => c.id === campaignCategory)?.label || 'Comunicado'} — ${summary}`,
          category: campaignCategory,
          targetSummary: summary,
          channelMode,
          channelId: selectedChannelId,
          cadenceMode,
          content,
          mediaUrl,
          mediaType,
          mediaFilename,
          linkUrl,
          createdByName: currentUserName,
          recipients: selectedRecipients,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha ao criar campanha')
      }

      setFeedbackBanner({
        type: 'success',
        text: `✅ Campanha iniciada com sucesso para ${data.count} trabalhador(es)! O primeiro envio já foi disparado e os demais seguem na cadência segura Anti-Ban.`,
      })
      await loadCampaignsHistory()
      setSelectedCampaignId(data.campaignId)
      setTimeout(() => {
        setActiveView('history')
      }, 1200)
    } catch (err: any) {
      setFeedbackBanner({
        type: 'error',
        text: err.message || 'Erro ao iniciar disparos da campanha.',
      })
    } finally {
      setDispatching(false)
    }
  }

  // CRUD de Templates Handlers
  const handleOpenEditTemplate = (tpl?: CampaignTemplate) => {
    if (tpl) {
      setEditingTemplate(tpl)
      setTplTitle(tpl.title)
      setTplCategory(tpl.category || 'geral')
      setTplContent(tpl.content)
      setTplLinkUrl(tpl.link_url || '')
      setTplMediaUrl(tpl.media_url || null)
      setTplMediaType((tpl.media_type as any) || null)
      setTplMediaFilename(tpl.media_filename || null)
    } else {
      setEditingTemplate(null)
      setTplTitle('')
      setTplCategory('alojamento')
      setTplContent('')
      setTplLinkUrl('')
      setTplMediaUrl(null)
      setTplMediaType(null)
      setTplMediaFilename(null)
    }
  }

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tplTitle.trim() || !tplContent.trim() || savingTemplate) return
    setSavingTemplate(true)
    try {
      const payload = {
        title: tplTitle.trim(),
        category: tplCategory,
        content: tplContent.trim(),
        link_url: tplLinkUrl.trim() || null,
        media_url: tplMediaUrl || null,
        media_type: tplMediaType || null,
        media_filename: tplMediaFilename || null,
        updated_at: new Date().toISOString(),
      }

      if (editingTemplate?.id) {
        const { error } = await supabase
          .from('chat_campaign_templates')
          .update(payload)
          .eq('id', editingTemplate.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('chat_campaign_templates').insert({
          ...payload,
          created_by: currentUserName,
        })
        if (error) throw error
      }

      await loadTemplates()
      handleOpenEditTemplate(undefined)
    } catch (err: any) {
      alert('Erro ao salvar template: ' + (err.message || ''))
    } finally {
      setSavingTemplate(false)
    }
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Deseja realmente excluir este template de campanha?')) return
    await supabase.from('chat_campaign_templates').delete().eq('id', id)
    await loadTemplates()
  }

  // Controles de Auditoria (Pilar 5)
  const handleForceProcessNext = async () => {
    if (processingQueueNow) return
    setProcessingQueueNow(true)
    try {
      await fetch('/api/chat/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process_next', maxItems: 3 }),
      })
      await loadCampaignsHistory()
      if (selectedCampaignId) await loadCampaignRecipientItems(selectedCampaignId)
    } finally {
      setProcessingQueueNow(false)
    }
  }

  const handleRetryFailed = async (campaignId: string, itemId?: string) => {
    await fetch('/api/chat/campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'retry_failed', campaignId, itemId }),
    })
    await loadCampaignsHistory()
    await loadCampaignRecipientItems(campaignId)
  }

  const handleUpdateCampaignStatus = async (campaignId: string, nextStatus: string) => {
    await fetch('/api/chat/campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_campaign_status', campaignId, nextStatus }),
    })
    await loadCampaignsHistory()
    await loadCampaignRecipientItems(campaignId)
  }

  const selectedCampaignObj = useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId]
  )

  const filteredCampaignItems = useMemo(() => {
    if (itemFilterStatus === 'all') return campaignItems
    if (itemFilterStatus === 'pending') {
      return campaignItems.filter((i) => i.status === 'pending' || i.status === 'sending')
    }
    return campaignItems.filter((i) => i.status === itemFilterStatus)
  }, [campaignItems, itemFilterStatus])

  return (
    <div className="flex-1 flex flex-col w-full h-full min-w-0 bg-slate-100/80 dark:bg-slate-950 overflow-hidden">
      {/* Top Bar Compacta Full-Width */}
      <header className="h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-xs shrink-0">
            <Megaphone className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-extrabold text-slate-900 dark:text-white tracking-tight truncate">
              Central de Campanhas & Comunicados Operacionais
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Disparos segmentados por Pedido, Clientes ou Empresa com roteamento oficial de canal e proteção Anti-Ban
            </p>
          </div>
        </div>

        {/* Navegação de Abas do Módulo */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => setActiveView('builder')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeView === 'builder'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>1. Montar & Disparar Campanha</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('templates')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeView === 'templates'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>2. Templates de Mensagem ({templates.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('history')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeView === 'history'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>3. Controle de Envios & Auditoria ({campaigns.length})</span>
            {campaigns.some((c) => c.status === 'running') && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            )}
          </button>
        </div>
      </header>

      {/* Área Principal Full-Width com Bordas Reduzidas (p-3) */}
      <div className="flex-1 overflow-hidden p-3">
        {activeView === 'builder' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full">
            {/* COLUNA 1 (3 cols): Filtros Online de Segmentação (Pedidos, Clientes, Empresas, Trava Anti-Inativo) */}
            <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col h-full overflow-hidden">
              <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-emerald-600" />
                    1. Segmentação Online
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    Base Viva
                  </span>
                </div>

                {/* Seletor de Modo de Segmentação */}
                <div className="grid grid-cols-2 gap-1.5 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setSegmentMode('pedido')}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                      segmentMode === 'pedido'
                        ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 shadow-2xs'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-extrabold">📋 Por Pedido</div>
                    <div className="text-[9.5px] opacity-75 truncate">Início obra / Alojamento</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSegmentMode('clients')}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                      segmentMode === 'clients'
                        ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 shadow-2xs'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-extrabold">🏗️ Por Cliente(s)</div>
                    <div className="text-[9.5px] opacity-75 truncate">1 ou vários clientes</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSegmentMode('companies')}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                      segmentMode === 'companies'
                        ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 shadow-2xs'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-extrabold">🏢 Por Empresa</div>
                    <div className="text-[9.5px] opacity-75 truncate">Luminous, Wiseowe...</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSegmentMode('manual')}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                      segmentMode === 'manual'
                        ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 shadow-2xs'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-extrabold">👷 Todos Ativos</div>
                    <div className="text-[9.5px] opacity-75 truncate">Seleção livre / geral</div>
                  </button>
                </div>
              </div>

              {/* Trava de Segurança de Status (Evitar enviar para Inativos) */}
              <div className="px-3 py-2 bg-emerald-50/60 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/40 space-y-1.5">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-[11px] font-extrabold text-emerald-900 dark:text-emerald-200 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    Bloquear Inativos / Baixas
                  </span>
                  <input
                    type="checkbox"
                    checked={hideInactiveSafetyLock}
                    onChange={(e) => setHideInactiveSafetyLock(e.target.checked)}
                    className="rounded accent-emerald-600 w-3.5 h-3.5"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-[10.5px] font-semibold text-slate-600 dark:text-slate-300">
                    Incluir "Pendente Ingresso" (Novos)
                  </span>
                  <input
                    type="checkbox"
                    checked={includePendingIngreso}
                    onChange={(e) => setIncludePendingIngreso(e.target.checked)}
                    className="rounded accent-emerald-600 w-3.5 h-3.5"
                  />
                </label>
              </div>

              {/* Conteúdo dinâmico do filtro selecionado */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {segmentMode === 'pedido' && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        Selecionar Pedido(s) ({selectedPedidos.length})
                      </span>
                      {selectedPedidos.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedPedidos([])}
                          className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={pedidoSearch}
                        onChange={(e) => setPedidoSearch(e.target.value)}
                        placeholder="Buscar código PED-2026, cliente ou obra..."
                        className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="space-y-1 pt-1">
                      {filteredPedidosList.map((ped) => {
                        const checked = selectedPedidos.includes(ped.cod_pedido)
                        const totalLinked = (ped.worker_ids?.length || 0) + (ped.worker_codes?.length || 0)
                        return (
                          <label
                            key={ped.cod_pedido}
                            className={`flex items-start gap-2 p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                              checked
                                ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-500'
                                : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setSelectedPedidos((prev) =>
                                  prev.includes(ped.cod_pedido)
                                    ? prev.filter((x) => x !== ped.cod_pedido)
                                    : [...prev, ped.cod_pedido]
                                )
                              }}
                              className="mt-0.5 accent-emerald-600"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-extrabold text-slate-900 dark:text-white truncate">
                                  {ped.cod_pedido}
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 shrink-0">
                                  {totalLinked} alocados
                                </span>
                              </div>
                              <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                                🏗️ {ped.cliente_nome}
                              </p>
                              {ped.obra_nome && ped.obra_nome !== ped.cliente_nome && (
                                <p className="text-[10px] text-slate-500 truncate">📍 {ped.obra_nome}</p>
                              )}
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </>
                )}

                {segmentMode === 'clients' && (
                  <>
                    {/* Filtro opcional de empresa acima dos clientes */}
                    <div>
                      <span className="text-[10.5px] font-bold text-slate-500 block mb-1">
                        Filtrar clientes por Empresa (opcional):
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {companiesStats.map((emp) => {
                          const active = selectedCompanies.includes(emp.name)
                          return (
                            <button
                              key={emp.name}
                              type="button"
                              onClick={() =>
                                setSelectedCompanies((prev) =>
                                  prev.includes(emp.name) ? prev.filter((x) => x !== emp.name) : [...prev, emp.name]
                                )
                              }
                              className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border cursor-pointer ${
                                active
                                  ? 'bg-teal-600 text-white border-teal-700'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {emp.name} ({emp.totalActive})
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        Clientes / Obras ({selectedClients.length} selecionados)
                      </span>
                      {selectedClients.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedClients([])}
                          className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                        >
                          Limpar
                        </button>
                      )}
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        placeholder="Buscar cliente ou obra..."
                        className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="space-y-1 pt-1">
                      {filteredClientsList.map((cli) => {
                        const checked = selectedClients.includes(cli.name)
                        return (
                          <label
                            key={cli.name}
                            className={`flex items-center justify-between gap-2 p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                              checked
                                ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-500'
                                : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setSelectedClients((prev) =>
                                    prev.includes(cli.name)
                                      ? prev.filter((x) => x !== cli.name)
                                      : [...prev, cli.name]
                                  )
                                }
                                className="accent-emerald-600 shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="font-bold text-slate-800 dark:text-slate-100 truncate text-[11.5px]">
                                  {cli.name}
                                </p>
                                <p className="text-[9.5px] text-slate-500 truncate">
                                  📱 {cli.companies.join(' • ') || 'MCS'}
                                </p>
                              </div>
                            </div>
                            <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold shrink-0">
                              {cli.totalActive} ativos
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </>
                )}

                {segmentMode === 'companies' && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                      Selecione 1 ou mais Empresas Contratantes:
                    </span>
                    {companiesStats.map((emp) => {
                      const checked = selectedCompanies.includes(emp.name)
                      return (
                        <label
                          key={emp.name}
                          className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                            checked
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setSelectedCompanies((prev) =>
                                  prev.includes(emp.name)
                                    ? prev.filter((x) => x !== emp.name)
                                    : [...prev, emp.name]
                                )
                              }
                              className="accent-emerald-600"
                            />
                            <span className="text-xs font-extrabold text-slate-800 dark:text-white">
                              🏢 {emp.name}
                            </span>
                          </div>
                          <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            {emp.totalActive} ativos
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}

                {segmentMode === 'manual' && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                    <p className="font-bold text-slate-800 dark:text-white">Modo Base Completa / Seleção Individual</p>
                    <p className="text-[11px]">
                      Use a tabela central ao lado para pesquisar e marcar livremente 1, 2, 3 ou mais trabalhadores de qualquer cliente ou empresa.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* COLUNA 2 (5 cols): Checklist Nominal de Trabalhadores + Adição Avulsa + Validação */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col h-full overflow-hidden">
              <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                      2. Público Destinatário
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[11px] font-extrabold">
                      {selectedRecipients.length} selecionados
                    </span>
                    <span className="text-[11px] text-slate-400">
                      (de {candidateWorkers.length} no filtro)
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleSelectAllValid}
                      className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10.5px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <CheckSquare className="w-3 h-3" />
                      <span>Marcar Todos</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10.5px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Square className="w-3 h-3" />
                      <span>Limpar</span>
                    </button>
                  </div>
                </div>

                {/* Busca dentro da tabela + Busca para adicionar trabalhador avulso */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={workerTableSearch}
                      onChange={(e) => setWorkerTableSearch(e.target.value)}
                      placeholder="Filtrar nesta lista por nome, função, tel..."
                      className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="relative">
                    <UserPlus className="w-3.5 h-3.5 text-indigo-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={manualAddSearch}
                      onChange={(e) => setManualAddSearch(e.target.value)}
                      placeholder="+ Adicionar trabalhador avulso (nome/cód)..."
                      className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg focus:outline-none focus:border-indigo-500"
                    />
                    {manualSearchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-30 max-h-56 overflow-y-auto divide-y divide-slate-100">
                        {manualSearchResults.map((mw) => {
                          const inactive = isWorkerInactiveOrBlocked(mw.status_trabajador)
                          return (
                            <button
                              key={mw.id}
                              type="button"
                              onClick={() => {
                                setExtraManualWorkerIds((prev) => (prev.includes(mw.id) ? prev : [...prev, mw.id]))
                                setSelectedWorkerIds((prev) => new Set(prev).add(mw.id))
                                setManualAddSearch('')
                              }}
                              className="w-full text-left p-2 hover:bg-indigo-50 dark:hover:bg-slate-800 flex items-center justify-between gap-2 text-xs cursor-pointer"
                            >
                              <div className="min-w-0">
                                <p className="font-bold text-slate-800 dark:text-white truncate">
                                  {mw.nome} {mw.cod_colab ? `(${mw.cod_colab})` : ''}
                                </p>
                                <p className="text-[10px] text-slate-500 truncate">
                                  {mw.contratante || 'MCS'} • {mw.cliente || 'Sem obra'}
                                </p>
                              </div>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold shrink-0 ${
                                  inactive ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                + Incluir ({mw.status_trabajador || 'Ativo'})
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Lista Nominal de Trabalhadores com Checkbox */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
                {loadingInitial ? (
                  <div className="p-10 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                    <span>Carregando base de trabalhadores e pedidos online...</span>
                  </div>
                ) : displayedCandidateWorkers.length === 0 ? (
                  <div className="p-10 text-center text-xs text-slate-400 space-y-1">
                    <p className="font-bold text-slate-600 dark:text-slate-300">
                      Nenhum trabalhador encontrado para este filtro
                    </p>
                    <p className="text-[11px]">
                      Selecione um Pedido, Cliente ou Empresa na coluna à esquerda, ou adicione trabalhadores avulsos acima.
                    </p>
                  </div>
                ) : (
                  displayedCandidateWorkers.map((w) => {
                    const cleanPhone = normalizePhoneDigits(w.movil)
                    const hasValidPhone = cleanPhone.length >= 8
                    const isChecked = selectedWorkerIds.has(w.id)
                    const isInactive = isWorkerInactiveOrBlocked(w.status_trabajador)
                    const matchedCh = resolveWorkerChannelPreview(w.contratante)

                    return (
                      <div
                        key={w.id}
                        onClick={() => {
                          if (!hasValidPhone) return
                          handleToggleWorker(w.id)
                        }}
                        className={`px-3 py-2 flex items-center justify-between gap-2.5 text-xs transition-colors cursor-pointer ${
                          isChecked
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        } ${!hasValidPhone ? 'opacity-55 cursor-not-allowed' : ''}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={!hasValidPhone}
                            onChange={() => {}}
                            className="accent-emerald-600 w-3.5 h-3.5 shrink-0 pointer-events-none"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-slate-800 dark:text-slate-100 truncate">
                                {w.nome}
                              </span>
                              {w.cod_colab && (
                                <span className="text-[10px] font-mono text-slate-400">({w.cod_colab})</span>
                              )}
                              <span
                                className={`px-1.5 py-0.2 rounded text-[9.5px] font-extrabold uppercase ${
                                  isInactive
                                    ? 'bg-rose-100 text-rose-700 border border-rose-300'
                                    : (w.status_trabajador || '').toUpperCase().includes('PENDENTE')
                                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                      : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {w.status_trabajador || 'Ativo'}
                              </span>
                              {w.status_seguridad && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                  Seg: {w.status_seguridad}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-[10.5px] text-slate-500 truncate mt-0.5">
                              {w.contratante && (
                                <span className="font-bold text-teal-700 dark:text-teal-400">
                                  🏢 {w.contratante}
                                </span>
                              )}
                              {w.cliente && <span className="truncate">• 🏗️ {w.cliente}</span>}
                              {w.pedido_code && (
                                <span className="px-1.5 py-0.1 rounded bg-indigo-50 text-indigo-700 font-bold text-[9.5px]">
                                  📋 {w.pedido_code}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                          {hasValidPhone ? (
                            <span className="font-mono text-[10.5px] font-bold text-slate-700 dark:text-slate-300">
                              +{cleanPhone}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9.5px] font-bold">
                              ⚠️ Sem Telefone
                            </span>
                          )}
                          {matchedCh && (
                            <span className="text-[9px] font-extrabold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-200/60">
                              📱 Via {matchedCh.company_name || matchedCh.name}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* COLUNA 3 (4 cols): Seletor de Template + Compositor Multimídia + Cadência Anti-Ban + Disparo */}
            <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col h-full overflow-hidden">
              <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  3. Mensagem, Mídia & Disparo Seguro
                </span>
                <button
                  type="button"
                  onClick={() => setActiveView('templates')}
                  className="text-[10.5px] font-extrabold text-emerald-700 hover:underline cursor-pointer"
                >
                  ⚙️ Gerenciar Templates
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {/* Atalho Rápido de Templates Salvos */}
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Carregar Template de Comunicado:
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      const found = templates.find((t) => t.id === e.target.value)
                      if (found) handleApplyTemplate(found)
                    }}
                    className="w-full px-2.5 py-1.5 text-xs font-semibold bg-emerald-50/60 dark:bg-slate-800 border border-emerald-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">✨ Escolher um modelo pronto (Alojamento, Início Obra, Horas...)</option>
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.title}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Nome / Identificação da Campanha */}
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Título Interno da Campanha:
                  </label>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="Ex: Aviso Novo Alojamento - Obra Caldesol"
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Variáveis Dinâmicas + Botão Traduzir PT -> ES */}
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1 flex-wrap">
                    <span className="text-[10.5px] font-bold text-slate-500">Inserir Variável:</span>
                    <button
                      type="button"
                      disabled={translatingContent || !content.trim()}
                      onClick={() => handleTranslateComposerToSpanish(false)}
                      className="px-2 py-0.5 rounded-md bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[10px] font-extrabold flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                      {translatingContent ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
                      <span>🇪🇸 Traduzir p/ Espanhol</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap mb-1.5">
                    {[
                      { tag: '{primeiro_nome}', label: '1º Nome' },
                      { tag: '{nome}', label: 'Nome Completo' },
                      { tag: '{empresa}', label: 'Empresa' },
                      { tag: '{cliente}', label: 'Cliente' },
                      { tag: '{funcao}', label: 'Função' },
                      { tag: '{cod_pedido}', label: 'Cód. Pedido' },
                    ].map((v) => (
                      <button
                        key={v.tag}
                        type="button"
                        onClick={() => setContent((c) => `${c}${c.endsWith(' ') || !c ? '' : ' '}${v.tag}`)}
                        className="px-1.5 py-0.5 bg-slate-100 hover:bg-emerald-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-400 cursor-pointer"
                      >
                        {v.tag}
                      </button>
                    ))}
                  </div>

                  <textarea
                    rows={5}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Escreva a mensagem ou selecione um template acima..."
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-100 leading-relaxed"
                  />
                </div>

                {/* Anexos Multimídia: Imagem, PDF/Documento e Link */}
                <div className="space-y-2 bg-slate-50/80 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10.5px] font-bold text-slate-600 dark:text-slate-300">
                      Anexar Mídia ou Link (Opcional):
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleUploadAttachment(e, 'image', false)}
                      />
                      <input
                        ref={docInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx"
                        className="hidden"
                        onChange={(e) => handleUploadAttachment(e, 'document', false)}
                      />
                      <button
                        type="button"
                        disabled={uploadingMedia}
                        onClick={() => imageInputRef.current?.click()}
                        className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10.5px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
                      >
                        <ImageIcon className="w-3 h-3 text-emerald-600" />
                        <span>+ Imagem</span>
                      </button>
                      <button
                        type="button"
                        disabled={uploadingMedia}
                        onClick={() => docInputRef.current?.click()}
                        className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10.5px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 flex items-center gap-1 cursor-pointer"
                      >
                        <FileText className="w-3 h-3 text-blue-600" />
                        <span>+ PDF/Arq</span>
                      </button>
                    </div>
                  </div>

                  {mediaUrl && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        {mediaType === 'image' ? (
                          <ImageIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                        )}
                        <span className="font-bold text-emerald-900 truncate text-[11px]">
                          {mediaFilename || 'Arquivo anexado'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setMediaUrl(null)
                          setMediaType(null)
                          setMediaFilename(null)
                        }}
                        className="text-rose-600 hover:text-rose-700 p-0.5 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="relative">
                    <LinkIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="url"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="Link opcional (Ex: Google Maps do alojamento ou obra)..."
                      className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Roteamento de Canal WhatsApp + Cadência Anti-Ban */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10.5px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                      Canal WhatsApp de Envio:
                    </label>
                    <select
                      value={channelMode === 'auto_company' ? 'auto_company' : selectedChannelId}
                      onChange={(e) => {
                        if (e.target.value === 'auto_company') {
                          setChannelMode('auto_company')
                        } else {
                          setChannelMode('manual')
                          setSelectedChannelId(e.target.value)
                        }
                      }}
                      className="w-full px-2 py-1.5 text-[11px] font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    >
                      <option value="auto_company">⚡ Automático pela Empresa do Trab.</option>
                      {channels.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          📱 Fixar: {ch.company_name || ch.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10.5px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                      Cadência Anti-Bloqueio:
                    </label>
                    <select
                      value={cadenceMode}
                      onChange={(e) => setCadenceMode(e.target.value as any)}
                      className="w-full px-2 py-1.5 text-[11px] font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    >
                      <option value="safe">🛡️ Seguro (8s a 14s + pausa)</option>
                      <option value="conservative">🐢 Ultra-Seguro (15s a 25s)</option>
                      <option value="fast">⚡ Rápido Pedido (4s a 7s)</option>
                    </select>
                  </div>
                </div>

                {/* Preview Real Estilo WhatsApp */}
                <div className="rounded-xl bg-[#efeae2] dark:bg-slate-800 p-2.5 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mb-1">
                    <span>📱 Preview WhatsApp ({samplePreviewWorker.nome})</span>
                    <span>Canal: {samplePreviewWorker.contratante || 'Oficial'}</span>
                  </div>
                  <div className="bg-[#d9fdd3] dark:bg-emerald-950 text-slate-900 dark:text-slate-100 rounded-xl rounded-tr-xs p-2.5 text-[11.5px] shadow-2xs whitespace-pre-wrap leading-snug">
                    {mediaUrl && (
                      <div className="mb-1.5 px-2 py-1 rounded bg-black/5 text-[10px] font-bold flex items-center gap-1">
                        {mediaType === 'image' ? '📷 [Imagem anexada]' : `📄 [${mediaFilename || 'Documento'}]`}
                      </div>
                    )}
                    {renderedPreviewText}
                  </div>
                </div>

                {feedbackBanner && (
                  <div
                    className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
                      feedbackBanner.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    {feedbackBanner.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span>{feedbackBanner.text}</span>
                  </div>
                )}
              </div>

              {/* Botão de Disparo no Rodapé da Coluna */}
              <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
                <button
                  type="button"
                  onClick={handleDispatchCampaign}
                  disabled={dispatching || selectedRecipients.length === 0 || !content.trim()}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  {dispatching ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Programando Fila Anti-Ban...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>
                        Disparar Comunicado para {selectedRecipients.length} Trabalhador(es)
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ABA 2: CRUD COMPLETO DE TEMPLATES MULTIMÍDIA */}
        {activeView === 'templates' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full">
            {/* Formulário de Criação / Edição de Template */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col h-full overflow-y-auto">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-sm font-extrabold text-slate-800 dark:text-white">
                  {editingTemplate ? `✏️ Editando Template: ${editingTemplate.title}` : '➕ Novo Template de Comunicado'}
                </h2>
                {editingTemplate && (
                  <button
                    type="button"
                    onClick={() => handleOpenEditTemplate(undefined)}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Cancelar Edição
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveTemplate} className="space-y-3 flex-1 flex flex-col">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                      Nome do Template *
                    </label>
                    <input
                      type="text"
                      required
                      value={tplTitle}
                      onChange={(e) => setTplTitle(e.target.value)}
                      placeholder="Ex: Novo Alojamento - Endereço"
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                      Categoria Operacional
                    </label>
                    <select
                      value={tplCategory}
                      onChange={(e) => setTplCategory(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold"
                    >
                      {TEMPLATE_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      Texto do Modelo (com variáveis) *
                    </span>
                    <button
                      type="button"
                      disabled={translatingContent || !tplContent.trim()}
                      onClick={() => handleTranslateComposerToSpanish(true)}
                      className="px-2 py-0.5 rounded bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Languages className="w-3 h-3" />
                      <span>Traduzir p/ Espanhol</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {['{primeiro_nome}', '{nome}', '{empresa}', '{cliente}', '{funcao}', '{cod_pedido}', '{obra}'].map(
                      (tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setTplContent((c) => `${c} ${tag}`)}
                          className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-bold text-emerald-700 cursor-pointer"
                        >
                          {tag}
                        </button>
                      )
                    )}
                  </div>
                  <textarea
                    rows={7}
                    required
                    value={tplContent}
                    onChange={(e) => setTplContent(e.target.value)}
                    placeholder="Digite o texto base do template..."
                    className="w-full p-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl leading-relaxed"
                  />
                </div>

                {/* Upload de imagem/PDF padrão para o template */}
                <div className="space-y-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      Mídia Padrão do Template (Imagem ou PDF):
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        ref={tplImageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleUploadAttachment(e, 'image', true)}
                      />
                      <input
                        ref={tplDocInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx"
                        className="hidden"
                        onChange={(e) => handleUploadAttachment(e, 'document', true)}
                      />
                      <button
                        type="button"
                        onClick={() => tplImageInputRef.current?.click()}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Imagem</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => tplDocInputRef.current?.click()}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                        <span>PDF / Doc</span>
                      </button>
                    </div>
                  </div>

                  {tplMediaUrl && (
                    <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs">
                      <span className="font-bold text-emerald-900 truncate">
                        📎 {tplMediaFilename || 'Mídia anexada ao template'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setTplMediaUrl(null)
                          setTplMediaType(null)
                          setTplMediaFilename(null)
                        }}
                        className="text-rose-600 font-bold"
                      >
                        Remover
                      </button>
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">
                      Link complementar (Google Maps, Portal, etc.):
                    </label>
                    <input
                      type="url"
                      value={tplLinkUrl}
                      onChange={(e) => setTplLinkUrl(e.target.value)}
                      placeholder="https://maps.google.com/..."
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingTemplate}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-sm flex items-center gap-2 cursor-pointer"
                  >
                    {savingTemplate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>{editingTemplate ? 'Salvar Alterações no Template' : 'Criar Template'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Lista de Templates Cadastrados */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col h-full overflow-y-auto">
              <h2 className="text-sm font-extrabold text-slate-800 dark:text-white mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                📚 Templates Disponíveis ({templates.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {templates.map((tpl) => {
                  const catObj = TEMPLATE_CATEGORIES.find((c) => c.id === tpl.category) || TEMPLATE_CATEGORIES[4]
                  return (
                    <div
                      key={tpl.id}
                      className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-emerald-400 transition-all flex flex-col justify-between gap-3 bg-slate-50/40 dark:bg-slate-950/40"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${catObj.badgeClass}`}>
                            {catObj.label}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditTemplate(tpl)}
                              className="p-1 text-slate-400 hover:text-blue-600 cursor-pointer"
                              title="Editar Template"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTemplate(tpl.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                              title="Excluir Template"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <h3 className="text-xs font-extrabold text-slate-900 dark:text-white">{tpl.title}</h3>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 whitespace-pre-wrap line-clamp-5 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                          {tpl.content}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          {tpl.media_url && <span className="font-bold text-emerald-700">📎 Com Mídia</span>}
                          {tpl.link_url && <span className="font-bold text-blue-600">🔗 Com Link</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleApplyTemplate(tpl)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold cursor-pointer"
                        >
                          Usar na Campanha →
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ABA 3: CONTROLE DE ENVIOS & AUDITORIA (ENVIADOS X FALHAS X FILA) */}
        {activeView === 'history' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full">
            {/* Lista de Campanhas Disparadas */}
            <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col h-full overflow-hidden">
              <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-white">
                  Histórico de Campanhas ({campaigns.length})
                </span>
                <button
                  type="button"
                  onClick={handleForceProcessNext}
                  disabled={processingQueueNow}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10.5px] font-extrabold flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${processingQueueNow ? 'animate-spin' : ''}`} />
                  <span>Processar Fila Agora</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {campaigns.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    Nenhuma campanha disparada ainda.
                  </div>
                ) : (
                  campaigns.map((camp) => {
                    const total = Number(camp.total_recipients || 0)
                    const sent = Number(camp.sent_count || 0)
                    const failed = Number(camp.failed_count || 0)
                    const pending = Math.max(0, total - sent - failed)
                    const pct = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0
                    const isSelected = selectedCampaignId === camp.id

                    return (
                      <div
                        key={camp.id}
                        onClick={() => setSelectedCampaignId(camp.id)}
                        className={`p-3 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-l-4 border-emerald-600'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                            {camp.name}
                          </h4>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9.5px] font-extrabold uppercase shrink-0 ${
                              camp.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : camp.status === 'running'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {camp.status === 'completed'
                              ? 'Concluída'
                              : camp.status === 'running'
                                ? 'Em Disparo'
                                : camp.status === 'paused'
                                  ? 'Pausada'
                                  : 'Cancelada'}
                          </span>
                        </div>

                        <p className="text-[10.5px] text-slate-500 truncate mb-2">{camp.target_summary}</p>

                        {/* Barra de progresso */}
                        <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-1.5">
                          <div
                            className="h-full bg-emerald-500 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span className="text-emerald-700">✅ {sent} enviados</span>
                          <span className="text-amber-600">⏳ {pending} na fila</span>
                          <span className="text-rose-600">❌ {failed} erros</span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Detalhamento Nominal de Cada Trabalhador da Campanha Selecionada */}
            <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col h-full overflow-hidden">
              {selectedCampaignObj ? (
                <>
                  <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <h3 className="text-xs font-extrabold text-slate-900 dark:text-white">
                        {selectedCampaignObj.name}
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        {selectedCampaignObj.target_summary} • Criada por {selectedCampaignObj.created_by_name || 'RH'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {selectedCampaignObj.status === 'running' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateCampaignStatus(selectedCampaignObj.id, 'paused')}
                          className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Pause className="w-3 h-3" />
                          <span>Pausar Fila</span>
                        </button>
                      )}
                      {selectedCampaignObj.status === 'paused' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateCampaignStatus(selectedCampaignObj.id, 'running')}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Play className="w-3 h-3" />
                          <span>Retomar Fila</span>
                        </button>
                      )}
                      {Number(selectedCampaignObj.failed_count || 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => handleRetryFailed(selectedCampaignObj.id)}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Reenviar {selectedCampaignObj.failed_count} Falha(s)</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Filtros rápidos de status dos destinatários */}
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs font-bold">
                    {[
                      { id: 'all', label: `Todos (${campaignItems.length})` },
                      {
                        id: 'sent',
                        label: `✅ Enviados (${campaignItems.filter((i) => i.status === 'sent').length})`,
                      },
                      {
                        id: 'pending',
                        label: `⏳ Na Fila (${campaignItems.filter((i) => i.status === 'pending' || i.status === 'sending').length})`,
                      },
                      {
                        id: 'failed',
                        label: `❌ Com Erro (${campaignItems.filter((i) => i.status === 'failed').length})`,
                      },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setItemFilterStatus(tab.id as any)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] cursor-pointer ${
                          itemFilterStatus === tab.id
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {loadingItems ? (
                      <div className="p-8 text-center text-xs text-slate-400">Carregando destinatários...</div>
                    ) : (
                      filteredCampaignItems.map((item) => (
                        <div
                          key={item.id}
                          className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-extrabold text-slate-900 dark:text-white">
                                {item.worker_name || 'Trabalhador'}
                              </span>
                              {item.worker_code && (
                                <span className="text-[10px] font-mono text-slate-400">({item.worker_code})</span>
                              )}
                              <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                                +{item.worker_phone}
                              </span>
                              {item.worker_company && (
                                <span className="px-1.5 py-0.2 rounded bg-teal-50 text-teal-800 border border-teal-200 text-[9.5px] font-extrabold">
                                  🏢 {item.worker_company}
                                </span>
                              )}
                              {item.worker_client && (
                                <span className="text-[10.5px] text-slate-500 truncate">
                                  • 🏗️ {item.worker_client}
                                </span>
                              )}
                            </div>

                            {item.error_message && (
                              <p className="text-[11px] font-semibold text-rose-600 mt-0.5">
                                ⚠️ Motivo da falha: {item.error_message}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {item.status === 'sent' && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10.5px] font-extrabold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Enviado{' '}
                                {item.sent_at
                                  ? new Date(item.sent_at).toLocaleTimeString('pt-BR', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      second: '2-digit',
                                    })
                                  : ''}
                              </span>
                            )}

                            {(item.status === 'pending' || item.status === 'sending') && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10.5px] font-extrabold flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Agendado{' '}
                                {item.scheduled_for
                                  ? new Date(item.scheduled_for).toLocaleTimeString('pt-BR', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      second: '2-digit',
                                    })
                                  : ''}
                              </span>
                            )}

                            {item.status === 'failed' && (
                              <button
                                type="button"
                                onClick={() => handleRetryFailed(selectedCampaignObj.id, item.id)}
                                className="px-2.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 text-[10.5px] font-extrabold flex items-center gap-1 cursor-pointer"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Tentar Novamente</span>
                              </button>
                            )}

                            {item.conversation_id && (
                              <Link
                                href={`/inbox/${item.conversation_id}`}
                                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[10.5px] font-bold flex items-center gap-1"
                                title="Abrir conversa com o trabalhador no Inbox"
                              >
                                <span>Ver Chat</span>
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="p-10 text-center text-xs text-slate-400">
                  Selecione uma campanha à esquerda para auditar os envios individuais.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
