"use client"
import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Calendar,
  BrainCircuit,
  AlertTriangle,
  MessageSquare,
  Loader2,
  CheckCircle2,
  Siren,
  Clock,
  Settings,
  Send,
  Users,
  Sparkles,
  Award,
  TrendingUp,
  Layers,
  ExternalLink,
  Save,
  X
} from "lucide-react"
import { supabase } from "@/lib/supabase/client"

const PROFILE_LABELS: Record<string, { label: string; badgeClass: string }> = {
  workers: {
    label: "👷 Operacional RH & Atenção ao Trabalhador",
    badgeClass: "bg-teal-50 text-teal-800 border-teal-200",
  },
  hiring: {
    label: "🤝 Contratação & Entrada de Trabalhadores",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  clients: {
    label: "🏢 Comercial & Manutenção de Clientes",
    badgeClass: "bg-purple-50 text-purple-800 border-purple-200",
  },
  general: {
    label: "🚗 Frota, EPI & Operações Gerais",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
  },
}

export default function AuditAIPage() {
  const todayIso = new Date().toISOString().split("T")[0]
  const yesterdayIso = new Date(Date.now() - 86400000).toISOString().split("T")[0]
  const [selectedDate, setSelectedDate] = useState(() => yesterdayIso)
  const [summary, setSummary] = useState<any>(null)
  const [dayChannelSummaries, setDayChannelSummaries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [runningAll, setRunningAll] = useState(false)
  const [creatingTaskNow, setCreatingTaskNow] = useState(false)

  const [channels, setChannels] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [selectedChannel, setSelectedChannel] = useState<string>("all")
  const [customPrompt, setCustomPrompt] = useState<string>("")
  const [sendTaskOnGenerate, setSendTaskOnGenerate] = useState<boolean>(true)

  // Modal de Configuração da Auditoria Automática da Meia-Noite
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [cfgEnabled, setCfgEnabled] = useState(true)
  const [cfgProfile, setCfgProfile] = useState("workers")
  const [cfgScheduleTime, setCfgScheduleTime] = useState("00:00")
  const [cfgAutoCreateTasks, setCfgAutoCreateTasks] = useState(true)
  const [cfgRecipientIds, setCfgRecipientIds] = useState<string[]>([])
  const [cfgDeptCode, setCfgDeptCode] = useState("OPERACOES")
  const [cfgInstructions, setCfgInstructions] = useState("")
  const [savingConfig, setSavingConfig] = useState(false)

  const fetchDaySummaries = useCallback(async (date: string, channelId: string) => {
    setLoading(true)
    try {
      const { data: allForDate } = await supabase
        .from("chat_daily_summaries")
        .select("*")
        .eq("summary_date", date)
        .order("updated_at", { ascending: false })

      const list = allForDate || []
      setDayChannelSummaries(list.filter((s: any) => s.channel_id !== null))

      const target =
        channelId !== "all"
          ? list.find((s: any) => s.channel_id === channelId)
          : list.find((s: any) => s.channel_id === null) || list[0] || null

      setSummary(target || null)
    } catch {
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadConfigForChannel = useCallback(async (channelId: string) => {
    const { data: cfgs } = await supabase.from("chat_audit_configs").select("*")
    const list = cfgs || []
    const specific = channelId !== "all" ? list.find((c: any) => c.channel_id === channelId) : null
    const globalCfg = list.find((c: any) => c.channel_id === null)
    const active = specific || globalCfg

    if (active) {
      setCfgEnabled(active.enabled ?? true)
      setCfgProfile(active.audit_profile || "workers")
      setCfgScheduleTime(active.schedule_time || "00:00")
      setCfgAutoCreateTasks(active.auto_create_tasks ?? true)
      setCfgRecipientIds(Array.isArray(active.recipient_user_ids) ? active.recipient_user_ids : [])
      setCfgDeptCode(active.target_department_code || "OPERACOES")
      setCfgInstructions(active.custom_instructions || "")
    }
  }, [])

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      const qDate = params.get("date")
      const qCh = params.get("channelId")
      if (qDate) setSelectedDate(qDate)
      if (qCh) setSelectedChannel(qCh)
    }
    Promise.all([
      supabase
        .from("chat_channels")
        .select("id, name, display_label, company_name, channel_type, phone_number")
        .eq("is_active", true)
        .order("company_name"),
      supabase
        .from("mcs_users")
        .select("id, email, display_name, name, role")
        .eq("active", true)
        .order("display_name"),
    ]).then(([chRes, uRes]) => {
      if (chRes.data) setChannels(chRes.data)
      if (uRes.data) setUsers(uRes.data.filter((u: any) => u.email !== "demo@mastercorp.local"))
    })
  }, [])

  useEffect(() => {
    fetchDaySummaries(selectedDate, selectedChannel)
    loadConfigForChannel(selectedChannel)
  }, [selectedDate, selectedChannel, fetchDaySummaries, loadConfigForChannel])

  const handleGenerate = async (forceCreateTask?: boolean) => {
    setGenerating(true)
    try {
      const res = await fetch("/api/chat/daily-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "single",
          date: selectedDate,
          channelId: selectedChannel !== "all" ? selectedChannel : undefined,
          customPrompt: customPrompt.trim() || undefined,
          force: true,
          createTask: forceCreateTask !== undefined ? forceCreateTask : sendTaskOnGenerate,
          recipientUserIds: cfgRecipientIds.length > 0 ? cfgRecipientIds : undefined,
          targetDepartmentCode: cfgDeptCode,
          auditProfile: cfgProfile,
        }),
      })
      const result = await res.json()
      if (result.success) {
        await fetchDaySummaries(selectedDate, selectedChannel)
      } else {
        alert("Erro ao gerar auditoria: " + (result.error || "Falha desconhecida"))
      }
    } catch {
      alert("Erro ao conectar na API de auditoria.")
    } finally {
      setGenerating(false)
    }
  }

  const handleRunAllChannelsAudit = async () => {
    setRunningAll(true)
    try {
      const res = await fetch("/api/chat/daily-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "run_all_channels",
          date: selectedDate,
          customPrompt: customPrompt.trim() || undefined,
          force: true,
          createTask: sendTaskOnGenerate,
          recipientUserIds: cfgRecipientIds.length > 0 ? cfgRecipientIds : undefined,
          targetDepartmentCode: cfgDeptCode,
        }),
      })
      const result = await res.json()
      if (result.success) {
        await fetchDaySummaries(selectedDate, selectedChannel)
        alert(
          `✅ Auditoria concluída em ${result.auditedChannelsCount || 0} canal(is) ativo(s)!${
            sendTaskOnGenerate ? " As tarefas gerenciais foram enviadas para a Super Gaveta Operacional." : ""
          }`
        )
      } else {
        alert("Erro: " + (result.error || "Falha ao auditar todos os canais"))
      }
    } catch {
      alert("Erro ao processar auditoria em lote.")
    } finally {
      setRunningAll(false)
    }
  }

  const handleDispatchTaskFromExisting = async () => {
    setCreatingTaskNow(true)
    try {
      await handleGenerate(true)
      alert("✅ Tarefa enviada com sucesso para a Super Gaveta Operacional!")
    } finally {
      setCreatingTaskNow(false)
    }
  }

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    try {
      const res = await fetch("/api/chat/daily-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "save_config",
          channelId: selectedChannel !== "all" ? selectedChannel : null,
          enabled: cfgEnabled,
          auditProfile: cfgProfile,
          scheduleTime: cfgScheduleTime,
          autoCreateTasks: cfgAutoCreateTasks,
          recipientUserIds: cfgRecipientIds,
          targetDepartmentCode: cfgDeptCode,
          customInstructions: cfgInstructions,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setShowConfigModal(false)
      } else {
        alert("Erro ao salvar configuração: " + (data.error || ""))
      }
    } finally {
      setSavingConfig(false)
    }
  }

  const toggleRecipient = (uid: string) => {
    setCfgRecipientIds(prev => (prev.includes(uid) ? prev.filter(i => i !== uid) : [...prev, uid]))
  }

  const activeProfileInfo = PROFILE_LABELS[summary?.audit_profile || cfgProfile] || PROFILE_LABELS.workers
  const recipientNames = cfgRecipientIds
    .map(id => {
      const u = users.find(x => x.id === id)
      return u?.display_name || u?.name || u?.email
    })
    .filter(Boolean)

  return (
    <div className="space-y-6 p-6 md:p-8 flex-1 overflow-y-auto">
      {/* Cabeçalho & Controles Principais */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <BrainCircuit className="w-7 h-7 text-emerald-600" />
                Auditoria & Resumo Diário por Canal (I.A.)
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Rotina Automática 00:00 (Meia-Noite)
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-1">
              Auditoria de qualidade ao trabalhador, contratação (3 números), manutenção de clientes e negociações comerciais, com envio automático de tarefas para a <strong>Super Gaveta Operacional</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Seletor de Canal */}
            <select
              value={selectedChannel}
              onChange={e => setSelectedChannel(e.target.value)}
              className="bg-white dark:bg-slate-900 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs text-xs font-bold text-slate-800 dark:text-slate-100 outline-none cursor-pointer"
            >
              <option value="all">🌐 Todos os Canais (Consolidado Geral)</option>
              {channels.map(ch => (
                <option key={ch.id} value={ch.id}>
                  📱 {ch.display_label || ch.name} {ch.phone_number ? `(+${ch.phone_number.slice(-4)})` : ""}
                </option>
              ))}
            </select>

            {/* Seletor de Data + Atalhos Rápidos Ontem / Hoje (Meio-dia ou 18h) */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <button
                type="button"
                onClick={() => setSelectedDate(yesterdayIso)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                  selectedDate === yesterdayIso
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
                title="Visualizar ou regerar o fechamento completo de ontem"
              >
                📅 Ontem
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(todayIso)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                  selectedDate === todayIso
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
                title="Auditar as conversas de hoje até este momento (Ex: Meio-dia, 18h, etc.) sem esperar meia-noite"
              >
                ⚡ Hoje (Parcial Agora)
              </button>
              <Calendar className="w-4 h-4 text-slate-400 ml-1" />
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="border-none bg-transparent outline-none text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
              />
            </div>

            {/* Botão Configurar Automação & Destinatários */}
            <button
              type="button"
              onClick={() => setShowConfigModal(true)}
              className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            >
              <Users className="w-4 h-4 text-emerald-400" />
              <span>Configurar Quem Recebe & Rotina 00:00</span>
            </button>
          </div>
        </div>

        {/* Faixa de Status da Automação e Atalhos de Canais Auditados no Dia */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className={`px-2.5 py-1 rounded-lg font-bold border ${activeProfileInfo.badgeClass}`}>
                {activeProfileInfo.label}
              </span>
              <span className="text-slate-500 flex items-center gap-1.5 flex-wrap">
                • Quem recebe as tarefas:{" "}
                <strong className="text-slate-800 dark:text-slate-200">
                  {recipientNames.length > 0 ? recipientNames.join(", ") : "Kawan Kotrik, Walter"}
                </strong>
                <button
                  type="button"
                  onClick={() => setShowConfigModal(true)}
                  className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-[11px] cursor-pointer transition-colors"
                >
                  + Agregar / Editar Pessoas
                </button>
              </span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-500">
                Setor Destino: <strong className="text-indigo-600">{cfgDeptCode}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer mr-2">
                <input
                  type="checkbox"
                  checked={sendTaskOnGenerate}
                  onChange={e => setSendTaskOnGenerate(e.target.checked)}
                  className="rounded text-emerald-600"
                />
                <span>Gerar Tarefa na Gaveta Operacional</span>
              </label>

              <button
                type="button"
                onClick={() => handleGenerate()}
                disabled={generating || runningAll}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Auditando Canal...</span>
                  </>
                ) : (
                  <>
                    <BrainCircuit className="w-3.5 h-3.5" />
                    <span>Auditar Canal Selecionado</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleRunAllChannelsAudit}
                disabled={generating || runningAll}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                title="Audita separadamente cada canal ativo no dia e envia um resumo por canal para a Super Gaveta Operacional"
              >
                {runningAll ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Auditando Todos os Canais...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auditar Todos os Canais Separadamente</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Foco / Instrução pontual */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-center">
            <div className="lg:col-span-2">
              <input
                type="text"
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                placeholder="Foco opcional para hoje (Ex: Verificar reclamações de descontos do pagamento dia 15 / Conferir atendimento de contratação / Clientes reclamando...)"
                className="w-full text-xs px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-emerald-500"
              />
            </div>

            {/* Pílulas rápidas dos canais que já possuem auditoria nesta data */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
              <span className="text-[10px] font-bold uppercase text-slate-400 shrink-0">Relatórios do dia:</span>
              <button
                type="button"
                onClick={() => setSelectedChannel("all")}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer border ${
                  selectedChannel === "all"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                Consolidado
              </button>
              {dayChannelSummaries.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedChannel(s.channel_id)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer border ${
                    selectedChannel === s.channel_id
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                  }`}
                >
                  {s.channel_name?.split("•")[0]?.trim() || "Canal"} ({s.total_conversations})
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Configuração da Rotina da Meia-Noite e Gestores Destinatários */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/50">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-emerald-600" />
                  Configurar Auditoria Automática (00:00) & Destinatários
                </h3>
                <p className="text-xs text-slate-500">
                  Escopo:{" "}
                  <strong>
                    {selectedChannel === "all"
                      ? "Padrão Global (Todos os Canais)"
                      : channels.find(c => c.id === selectedChannel)?.display_label || "Canal Selecionado"}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-emerald-200 bg-emerald-50/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfgEnabled}
                    onChange={e => setCfgEnabled(e.target.checked)}
                    className="mt-0.5 rounded text-emerald-600"
                  />
                  <div>
                    <span className="font-bold text-slate-900 block">
                      ✅ Executar Auditoria Todo Dia à Meia-Noite (00:00)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Varre automaticamente todas as conversas do dia em cada canal ativo.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-indigo-200 bg-indigo-50/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfgAutoCreateTasks}
                    onChange={e => setCfgAutoCreateTasks(e.target.checked)}
                    className="mt-0.5 rounded text-indigo-600"
                  />
                  <div>
                    <span className="font-bold text-slate-900 block">
                      📋 Gerar Tarefa na Super Gaveta Operacional
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Envia o resumo estruturado por canal como tarefa para os gestores selecionados.
                    </span>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    🎯 Perfil de Auditoria deste Canal
                  </label>
                  <select
                    value={cfgProfile}
                    onChange={e => setCfgProfile(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                  >
                    <option value="workers">👷 Operacional RH & Atenção ao Trabalhador (Holerite/Horas)</option>
                    <option value="hiring">🤝 Contratação & Entrada de Trabalhadores (3 Números)</option>
                    <option value="clients">🏢 Comercial & Manutenção de Clientes (Obras/Negociações)</option>
                    <option value="general">🚗 Frota, EPI & Operações Gerais</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    🏢 Setor da Tarefa na Gaveta Operacional
                  </label>
                  <select
                    value={cfgDeptCode}
                    onChange={e => setCfgDeptCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                  >
                    <option value="OPERACOES">Operações / Gerência Geral (OPERACOES)</option>
                    <option value="RH">Recursos Humanos (RH)</option>
                    <option value="CONTRATACAO">Contratação / Recrutamento (CONTRATACAO)</option>
                    <option value="COMERCIAL">Comercial / Clientes (COMERCIAL)</option>
                    <option value="LOGISTICA">Logística / Alojamento (LOGISTICA)</option>
                    <option value="FINANCEIRO">Financeiro (FINANCEIRO)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                  👥 Quais Gestores / Pessoas Receberão a Tarefa com o Resumo Diário? ({cfgRecipientIds.length} selecionados)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  {users.map(u => {
                    const checked = cfgRecipientIds.includes(u.id)
                    const label = u.display_name || u.name || u.email
                    return (
                      <label
                        key={u.id}
                        className={`flex items-center justify-between p-2 rounded-xl border cursor-pointer transition-colors ${
                          checked
                            ? "bg-indigo-50 border-indigo-300 text-indigo-950 font-bold"
                            : "bg-white dark:bg-slate-900 border-slate-200/70 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleRecipient(u.id)}
                            className="rounded text-indigo-600"
                          />
                          <div className="truncate">
                            <span className="block truncate">{label}</span>
                            <span className="text-[10px] text-slate-400 block truncate">{u.email}</span>
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                  📝 Diretrizes Permanentes da Auditoria I.A.
                </label>
                <textarea
                  rows={3}
                  value={cfgInstructions}
                  onChange={e => setCfgInstructions(e.target.value)}
                  placeholder="Ex: Avaliar rigorosamente conversas sem resposta, trabalhadores reclamando de descontos no holerite após o dia 15, trabalhadores nervosos, qualidade do atendimento de RH/Contratação e reclamações de clientes..."
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 bg-slate-50/60">
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={savingConfig}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{savingConfig ? "Salvando..." : "Salvar Configuração"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Corpo do Relatório */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mb-4 text-emerald-600" />
          <p className="text-sm font-medium">Carregando auditoria das conversas...</p>
        </div>
      ) : summary?.status === "completed" ? (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* 5 KPIs Executivos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-slate-500 text-[11px] font-bold uppercase tracking-wider block">
                Conversas Auditadas
              </span>
              <div className="mt-2 text-3xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                <MessageSquare className="w-6 h-6 text-blue-500" />
                {summary.total_conversations || 0}
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block truncate">
                {summary.channel_name || "Consolidado Geral"}
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-slate-500 text-[11px] font-bold uppercase tracking-wider block">
                Total de Mensagens
              </span>
              <div className="mt-2 text-3xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                {summary.total_messages || 0}
              </div>
              <span className="text-[11px] text-slate-400 mt-1 block">
                📥 {summary.inbound_messages || 0} recebidas • 📤 {summary.outbound_messages || 0} enviadas
              </span>
            </div>

            <div
              className={`p-4 rounded-2xl border shadow-xs ${
                (summary.unanswered_count || 0) > 0
                  ? "bg-amber-50/70 border-amber-300 dark:bg-amber-950/30 dark:border-amber-800"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
              }`}
            >
              <span className="text-amber-800 dark:text-amber-300 text-[11px] font-extrabold uppercase tracking-wider block">
                Ficaram Sem Resposta
              </span>
              <div className="mt-2 text-3xl font-black text-amber-700 dark:text-amber-400 flex items-center gap-2">
                <Clock className="w-6 h-6 text-amber-600" />
                {summary.unanswered_count || 0}
              </div>
              <span className="text-[11px] text-amber-700/80 font-medium mt-1 block">
                {(summary.unanswered_count || 0) > 0
                  ? "Aguardando retorno da equipe"
                  : "100% respondidas no dia"}
              </span>
            </div>

            <div
              className={`p-4 rounded-2xl border shadow-xs ${
                (summary.risks_detected?.length || 0) > 0
                  ? "bg-rose-50/70 border-rose-300 dark:bg-rose-950/30 dark:border-rose-800"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
              }`}
            >
              <span className="text-rose-800 dark:text-rose-300 text-[11px] font-extrabold uppercase tracking-wider block">
                Pontos Críticos / Nervosos
              </span>
              <div className="mt-2 text-3xl font-black text-rose-600 flex items-center gap-2">
                <Siren
                  className={`w-6 h-6 ${
                    (summary.risks_detected?.length || 0) > 0 ? "text-rose-600 animate-pulse" : "text-slate-300"
                  }`}
                />
                <span>{summary.risks_detected?.length || 0}</span>
              </div>
              <span className="text-[11px] text-rose-700/80 font-medium mt-1 block">
                Reclamações, holerites ou clientes
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-slate-500 text-[11px] font-bold uppercase tracking-wider block">
                Qualidade de Atenção
              </span>
              <div className="mt-2 text-3xl font-black text-emerald-600 flex items-center gap-2">
                <Award className="w-6 h-6 text-emerald-500" />
                <span>{summary.quality_score ?? 85}/100</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Nota da Equipe</span>
                <button
                  type="button"
                  onClick={handleDispatchTaskFromExisting}
                  disabled={creatingTaskNow}
                  className="text-[10.5px] font-extrabold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                  title="Enviar este relatório como Tarefa para a Super Gaveta Operacional"
                >
                  <Send className="w-3 h-3" />
                  <span>{creatingTaskNow ? "Enviando..." : "Enviar p/ Gaveta"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* BLOCO DE DESTAQUE: CONVERSAS QUE FICARAM SEM RESPOSTA */}
          {Array.isArray(summary.unanswered_conversations) && summary.unanswered_conversations.length > 0 && (
            <div className="bg-amber-50/80 dark:bg-amber-950/30 border-2 border-amber-300 dark:border-amber-800 rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-xs font-extrabold uppercase">
                    ⚠️ {summary.unanswered_conversations.length} Conversa(s) Sem Resposta
                  </span>
                  <h3 className="text-sm font-extrabold text-amber-950 dark:text-amber-100">
                    Trabalhadores ou Clientes que mandaram mensagem e ficaram aguardando retorno da equipe
                  </h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {summary.unanswered_conversations.map((un: any, idx: number) => (
                  <Link
                    key={idx}
                    href={`/inbox/${un.conversation_id}`}
                    className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-amber-200 dark:border-amber-800/80 hover:border-amber-500 shadow-2xs transition-all flex flex-col justify-between gap-2 group"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-xs text-slate-900 dark:text-white truncate">
                          {un.contact_name}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 shrink-0">
                          ⏳ {un.waiting_minutes} min
                        </span>
                      </div>
                      <div className="text-[10.5px] text-slate-400 font-mono mt-0.5">
                        +{un.contact_phone} • {un.channel_name}
                      </div>
                      <p className="mt-2 text-xs text-slate-700 dark:text-slate-300 italic bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700 line-clamp-2">
                        "{un.last_message}"
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[10.5px]">
                      <span className="text-slate-500 truncate">
                        👤 {un.assigned_to_name || "Fila Aberta"}
                      </span>
                      <span className="font-extrabold text-emerald-600 group-hover:underline flex items-center gap-1 shrink-0">
                        Responder Agora →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Grid Principal: Visão Geral + Assuntos + Radar de Riscos + Plano de Melhoria */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Coluna Esquerda (2/3): Resumo Executivo, Resumo por Assunto e Plano de Melhoria */}
            <div className="lg:col-span-2 space-y-6">
              {/* Visão Geral */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
                  <h3 className="text-base font-extrabold text-slate-800 dark:text-white">
                    📝 Resumo Executivo das Conversas ({summary.channel_name || "Consolidado"})
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">{summary.summary_date}</span>
                </div>
                <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {summary.summary}
                </div>
              </div>

              {/* Resumo Estruturado por Assunto (Pagamento/Holerite dia 15, Horas, Contratação, Clientes...) */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <h3 className="text-base font-extrabold text-slate-800 dark:text-white mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                  📌 Resumo por Assunto (O que foi falado e como o setor atendeu)
                </h3>
                <div className="space-y-4">
                  {summary.topic_stats?.map((topic: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {topic.topic}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {topic.sentiment && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white dark:bg-slate-900 border border-slate-200 text-slate-600">
                              {topic.sentiment}
                            </span>
                          )}
                          <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            {topic.count ? `${topic.count} conv • ` : ""}
                            {topic.percentage}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-200/70 dark:bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-emerald-500 h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(100, topic.percentage || 0)}%` }}
                        />
                      </div>
                      {topic.summary && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 pt-1 leading-relaxed">
                          {topic.summary}
                        </p>
                      )}
                    </div>
                  ))}
                  {(!summary.topic_stats || summary.topic_stats.length === 0) && (
                    <p className="text-sm text-slate-500">Nenhum assunto em destaque.</p>
                  )}
                </div>
              </div>

              {/* Recomendações Práticas de Melhoria de Setor & Performance dos Atendentes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                  <h3 className="text-sm font-extrabold text-slate-800 dark:text-white mb-3 pb-2 border-b border-slate-100 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-indigo-600" />
                    Plano de Melhoria para o Setor
                  </h3>
                  <div className="space-y-2.5">
                    {(summary.action_recommendations || []).map((rec: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/60 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold uppercase">
                            Setor: {rec.sector || "GERAL"}
                          </span>
                          <span className="text-[10px] font-bold uppercase text-indigo-700">
                            Prioridade: {rec.priority || "normal"}
                          </span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-200 font-medium leading-snug pt-0.5">
                          {rec.recommendation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                  <h3 className="text-sm font-extrabold text-slate-800 dark:text-white mb-3 pb-2 border-b border-slate-100 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-emerald-600" />
                    Atuação da Equipe no Canal
                  </h3>
                  <div className="space-y-2">
                    {(summary.agent_performance || []).length > 0 ? (
                      summary.agent_performance.map((ag: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-800 dark:text-white block">
                              👤 {ag.agent_name}
                            </span>
                            <span className="text-[11px] text-slate-500">{ag.evaluation}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-extrabold border border-emerald-200 text-[11px]">
                            {ag.conversations_handled} conv.
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400">Sem envios de atendentes registrados no período.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Coluna Direita (1/3): Pontos-Chave, Trabalhadores Nervosos, Reclamações de Holerite & Clientes */}
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <h3 className="text-base font-extrabold text-rose-600 mb-4 border-b border-rose-100 pb-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Pontos-Chave & Radar de Risco
                </h3>
                <div className="space-y-3.5">
                  {summary.risks_detected?.length > 0 ? (
                    summary.risks_detected.map((risk: any, idx: number) => (
                      <Link
                        href={`/inbox/${risk.conversation_id}`}
                        key={idx}
                        className="bg-rose-50/50 dark:bg-rose-950/25 p-4 rounded-xl border border-rose-200/80 dark:border-rose-900 relative overflow-hidden group hover:bg-rose-50 hover:shadow-md transition-all block cursor-pointer"
                      >
                        <div className="absolute top-0 left-0 w-1 h-full bg-rose-500" />
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="inline-block px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-extrabold uppercase rounded">
                            {risk.type}
                          </span>
                          {risk.agent_name && (
                            <span className="text-[10px] text-slate-500 font-semibold truncate">
                              👤 {risk.agent_name}
                            </span>
                          )}
                        </div>
                        {risk.contact_name && (
                          <div className="text-xs font-extrabold text-slate-900 dark:text-white mb-1">
                            {risk.contact_name} {risk.contact_phone ? `(+${risk.contact_phone})` : ""}
                          </div>
                        )}
                        <p className="text-xs text-slate-700 dark:text-slate-200 font-semibold mb-2 group-hover:text-rose-700 transition-colors">
                          {risk.reason}
                        </p>
                        {risk.excerpt && (
                          <div className="bg-white/90 dark:bg-slate-900 p-2.5 rounded-lg text-[11px] text-slate-600 dark:text-slate-300 italic border border-rose-100 dark:border-rose-900/50 font-mono line-clamp-3">
                            "{risk.excerpt}"
                          </div>
                        )}
                        <div className="mt-2.5 text-[11px] font-extrabold text-rose-600 group-hover:underline flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5" /> Abrir Conversa Completa →
                        </div>
                      </Link>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-3">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <p className="text-slate-700 font-bold text-sm">Nenhuma ocorrência crítica!</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Nenhum trabalhador exaltado ou reclamação grave detectada neste canal.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Histórico de Tarefas Geradas na Super Gaveta Operacional */}
              {Array.isArray(summary.tasks_generated) && summary.tasks_generated.length > 0 && (
                <div className="bg-indigo-50/70 dark:bg-indigo-950/30 p-5 rounded-2xl border border-indigo-200 dark:border-indigo-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-indigo-600" />
                      Tarefas Enviadas p/ Super Gaveta ({summary.tasks_generated.length})
                    </h4>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    {summary.tasks_generated.map((t: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 flex items-center justify-between"
                      >
                        <div>
                          <span className="font-bold text-slate-800 dark:text-white block">
                            👤 {t.recipient_name}
                          </span>
                          <span className="text-[10px] text-slate-400">{t.recipient_email}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[10px] border border-emerald-200">
                          Enviada ✓
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs text-center">
          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <BrainCircuit className="w-10 h-10 text-emerald-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
            Gerar Auditoria e Resumo Estruturado ({selectedDate})
          </h3>
          <p className="text-slate-500 max-w-lg mx-auto mb-6 text-sm">
            A varredura automática roda todo dia à meia-noite (00:00) e envia a tarefa de resumo para o gestor na Super Gaveta Operacional. Você também pode gerar agora para um canal específico ou para todos os canais.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => handleGenerate()}
              disabled={generating || runningAll}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-md disabled:opacity-50 flex items-center gap-2 cursor-pointer text-xs"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Analisando Conversas...
                </>
              ) : (
                <>
                  <BrainCircuit className="w-4 h-4" /> Auditar Canal Selecionado Agora
                </>
              )}
            </button>

            <button
              onClick={handleRunAllChannelsAudit}
              disabled={generating || runningAll}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-md disabled:opacity-50 flex items-center gap-2 cursor-pointer text-xs"
            >
              {runningAll ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Auditando Todos os Canais...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Auditar Todos os Canais Separadamente + Gerar Tarefas
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
