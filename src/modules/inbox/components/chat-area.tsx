"use client"
import { useState, useRef, useEffect } from 'react'
import {
  Send,
  Paperclip,
  MoreVertical,
  Clock,
  CheckCircle2,
  Check,
  CheckCheck,
  PanelRightClose,
  PanelRightOpen,
  LockOpen,
  LockKeyhole,
  Lock,
  Smile,
  Zap,
  Loader2,
  Image as ImageIcon,
  FileText,
  X,
  Languages,
  Star,
  Tag,
  CornerUpLeft,
  Trash2,
  Pencil,
  Globe,
  Bot,
  Building2,
  Briefcase,
  ArrowRightLeft,
  UserCheck
} from 'lucide-react'
import { useChat } from '../hooks/use-chat'
import { useConversationContext } from '../hooks/use-context'
import { format, isToday, isYesterday, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { AudioRecorder } from './audio-recorder'
import { CustomAudioPlayer } from './custom-audio-player'
import { supabase } from '@/lib/supabase/client'
import EmojiPicker, { Theme, EmojiClickData } from 'emoji-picker-react'
import { useI18n } from '@/contexts/i18n-context'
import { translateOutboundMessage } from '@/app/actions/translation-actions'
import { BilingualMessage } from './bilingual-message'
import { useRouter } from 'next/navigation'
import {
  MCS_QUICK_TAGS,
  CRM_MAIN_COLORS,
  CRM_MORE_COLORS,
  isLightTagColor,
  MCS_TRANSFER_SPECIALTIES,
  executeConversationTransfer,
} from '../constants/mcs-tags-and-transfers'

function FlagSpain({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`${className} shrink-0 rounded-full shadow-xs`} fill="none">
      <clipPath id="flag-es-clip"><circle cx="16" cy="16" r="16" /></clipPath>
      <g clipPath="url(#flag-es-clip)">
        <rect width="32" height="32" fill="#c60b1e" />
        <rect y="8" width="32" height="16" fill="#ffc400" />
        <circle cx="10" cy="16" r="3" fill="#c60b1e" opacity="0.9" />
      </g>
    </svg>
  )
}

function FlagUSA({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`${className} shrink-0 rounded-full shadow-xs`} fill="none">
      <clipPath id="flag-us-clip"><circle cx="16" cy="16" r="16" /></clipPath>
      <g clipPath="url(#flag-us-clip)">
        <rect width="32" height="32" fill="#ffffff" />
        <rect y="0" width="32" height="5" fill="#b22234" />
        <rect y="9" width="32" height="5" fill="#b22234" />
        <rect y="18" width="32" height="5" fill="#b22234" />
        <rect y="27" width="32" height="5" fill="#b22234" />
        <rect width="14" height="16" fill="#3c3b6e" />
        <circle cx="4" cy="5" r="1" fill="#ffffff" />
        <circle cx="10" cy="5" r="1" fill="#ffffff" />
        <circle cx="7" cy="9" r="1" fill="#ffffff" />
        <circle cx="4" cy="13" r="1" fill="#ffffff" />
        <circle cx="10" cy="13" r="1" fill="#ffffff" />
      </g>
    </svg>
  )
}

function FlagBrazil({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`${className} shrink-0 rounded-full shadow-xs`} fill="none">
      <clipPath id="flag-br-clip"><circle cx="16" cy="16" r="16" /></clipPath>
      <g clipPath="url(#flag-br-clip)">
        <rect width="32" height="32" fill="#009b3a" />
        <polygon points="16,5 28,16 16,27 4,16" fill="#fedf00" />
        <circle cx="16" cy="16" r="5.5" fill="#002776" />
        <path d="M 11 16 Q 16 13 21 17" stroke="#ffffff" strokeWidth="1.2" fill="none" />
      </g>
    </svg>
  )
}

function FlagItaly({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`${className} shrink-0 rounded-full shadow-xs`} fill="none">
      <clipPath id="flag-it-clip"><circle cx="16" cy="16" r="16" /></clipPath>
      <g clipPath="url(#flag-it-clip)">
        <rect width="10.66" height="32" fill="#009246" />
        <rect x="10.66" width="10.66" height="32" fill="#ffffff" />
        <rect x="21.33" width="10.67" height="32" fill="#ce2b37" />
      </g>
    </svg>
  )
}

function FlagFrance({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`${className} shrink-0 rounded-full shadow-xs`} fill="none">
      <clipPath id="flag-fr-clip"><circle cx="16" cy="16" r="16" /></clipPath>
      <g clipPath="url(#flag-fr-clip)">
        <rect width="10.66" height="32" fill="#0055a4" />
        <rect x="10.66" width="10.66" height="32" fill="#ffffff" />
        <rect x="21.33" width="10.67" height="32" fill="#ef4135" />
      </g>
    </svg>
  )
}

function FlagGermany({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`${className} shrink-0 rounded-full shadow-xs`} fill="none">
      <clipPath id="flag-de-clip"><circle cx="16" cy="16" r="16" /></clipPath>
      <g clipPath="url(#flag-de-clip)">
        <rect width="32" height="10.66" fill="#000000" />
        <rect y="10.66" width="32" height="10.66" fill="#dd0000" />
        <rect y="21.33" width="32" height="10.67" fill="#ffce00" />
      </g>
    </svg>
  )
}

function renderFlagIcon(key: string, className = "w-5 h-5") {
  switch (key) {
    case 'Spanish': return <FlagSpain className={className} />
    case 'English': return <FlagUSA className={className} />
    case 'Portuguese': return <FlagBrazil className={className} />
    case 'Italian': return <FlagItaly className={className} />
    case 'French': return <FlagFrance className={className} />
    case 'German': return <FlagGermany className={className} />
    default: return <span>🌐</span>
  }
}

const TARGET_LANG_MAP: Record<string, {
  label: string
  nativeName: string
  flag: string
  short: string
  shortcut: string
  containerClass: string
  topTabsClass: string
  bannerClass: string
  bannerBorder: string
  buttonClass: string
  activeBtnClass: string
}> = {
  Spanish: {
    label: 'Espanhol',
    nativeName: 'Español',
    flag: '🇪🇸',
    short: 'ES',
    shortcut: '1',
    containerClass: 'bg-orange-50/50 dark:bg-orange-950/20 border-orange-300 dark:border-orange-600/70 ring-1 ring-orange-400/40 shadow-sm shadow-orange-500/10',
    topTabsClass: 'bg-orange-500/10 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/60',
    bannerClass: 'bg-orange-100/80 dark:bg-orange-950/50 text-orange-950 dark:text-orange-100',
    bannerBorder: 'border-orange-300 dark:border-orange-800',
    buttonClass: 'bg-[#ea580c] hover:bg-[#c2410c] text-white shadow-xs',
    activeBtnClass: 'bg-[#ea580c] border-[#c2410c] text-white font-bold shadow-md ring-2 ring-orange-500/20',
  },
  English: {
    label: 'Inglês',
    nativeName: 'English',
    flag: '🇺🇸',
    short: 'US',
    shortcut: '2',
    containerClass: 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-600/70 ring-1 ring-blue-400/40 shadow-sm shadow-blue-500/10',
    topTabsClass: 'bg-blue-500/10 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/60',
    bannerClass: 'bg-blue-100/80 dark:bg-blue-950/50 text-blue-950 dark:text-blue-100',
    bannerBorder: 'border-blue-300 dark:border-blue-800',
    buttonClass: 'bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-xs',
    activeBtnClass: 'bg-[#2563eb] border-[#1d4ed8] text-white font-bold shadow-md ring-2 ring-blue-500/20',
  },
  Portuguese: {
    label: 'Português',
    nativeName: 'Português',
    flag: '🇧🇷',
    short: 'BR',
    shortcut: '3',
    containerClass: 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-600/70 ring-1 ring-emerald-400/40 shadow-sm shadow-emerald-500/10',
    topTabsClass: 'bg-emerald-500/10 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60',
    bannerClass: 'bg-emerald-100/80 dark:bg-emerald-950/50 text-emerald-950 dark:text-emerald-100',
    bannerBorder: 'border-emerald-300 dark:border-emerald-800',
    buttonClass: 'bg-[#16a34a] hover:bg-[#15803d] text-white shadow-xs',
    activeBtnClass: 'bg-[#16a34a] border-[#15803d] text-white font-bold shadow-md ring-2 ring-emerald-500/20',
  },
  Italian: {
    label: 'Italiano',
    nativeName: 'Italiano',
    flag: '🇮🇹',
    short: 'IT',
    shortcut: '4',
    containerClass: 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-400 dark:border-emerald-600/70 ring-1 ring-emerald-400/40 shadow-sm shadow-emerald-500/10',
    topTabsClass: 'bg-emerald-500/10 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60',
    bannerClass: 'bg-emerald-100/80 dark:bg-emerald-950/50 text-emerald-950 dark:text-emerald-100',
    bannerBorder: 'border-emerald-300 dark:border-emerald-800',
    buttonClass: 'bg-[#059669] hover:bg-[#047857] text-white shadow-xs',
    activeBtnClass: 'bg-[#059669] border-[#047857] text-white font-bold shadow-md ring-2 ring-emerald-500/20',
  },
  French: {
    label: 'Francês',
    nativeName: 'Français',
    flag: '🇫🇷',
    short: 'FR',
    shortcut: '5',
    containerClass: 'bg-sky-50/50 dark:bg-sky-950/20 border-sky-300 dark:border-sky-600/70 ring-1 ring-sky-400/40 shadow-sm shadow-sky-500/10',
    topTabsClass: 'bg-sky-500/10 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800/60',
    bannerClass: 'bg-sky-100/80 dark:bg-sky-950/50 text-sky-950 dark:text-sky-100',
    bannerBorder: 'border-sky-300 dark:border-sky-800',
    buttonClass: 'bg-[#0284c7] hover:bg-[#0369a1] text-white shadow-xs',
    activeBtnClass: 'bg-[#0284c7] border-[#0369a1] text-white font-bold shadow-md ring-2 ring-sky-500/20',
  },
  German: {
    label: 'Alemão',
    nativeName: 'Deutsch',
    flag: '🇩🇪',
    short: 'DE',
    shortcut: '6',
    containerClass: 'bg-amber-100/30 dark:bg-yellow-950/20 border-yellow-400 dark:border-yellow-700/60 ring-1 ring-yellow-400/40 shadow-sm shadow-yellow-500/10',
    topTabsClass: 'bg-yellow-500/10 dark:bg-yellow-950/30 border-yellow-300 dark:border-yellow-800/60',
    bannerClass: 'bg-yellow-100/80 dark:bg-yellow-950/50 text-yellow-950 dark:text-yellow-100',
    bannerBorder: 'border-yellow-300 dark:border-yellow-800',
    buttonClass: 'bg-[#b45309] hover:bg-[#92400e] text-white shadow-xs',
    activeBtnClass: 'bg-[#b45309] border-[#92400e] text-white font-bold shadow-md ring-2 ring-amber-600/20',
  },
}

function getTargetLangDisplay(lang: string) {
  const info = TARGET_LANG_MAP[lang]
  if (info) return `${info.flag} ${info.label}`
  return lang
}

interface ChatAreaProps {
  conversationId: string
  togglePanel?: () => void
  isPanelOpen?: boolean
}

interface QuickReply {
  id: string
  title: string
  shortcut: string | null
  content: string
}

export default function ChatArea({ conversationId, togglePanel, isPanelOpen }: ChatAreaProps) {
  const { t } = useI18n()
  const router = useRouter()
  const { messages, loading, sendMessage, editMessage, refetchMessages } = useChat(conversationId)
  const { context, setContext } = useConversationContext(conversationId)
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isAssigning, setIsAssigning] = useState(false)
  const [activeTab, setActiveTab] = useState<'reply' | 'note'>('reply')
  const [showAiMenu, setShowAiMenu] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserName, setCurrentUserName] = useState<string>('Atendente MCS')
  const [currentUserDept, setCurrentUserDept] = useState<string>('Operações')

  const [replyingTo, setReplyingTo] = useState<any | null>(null)
  const [translatorActive, setTranslatorActive] = useState(false)
  const [myLang, setMyLang] = useState("Portuguese")
  const [targetLang, setTargetLang] = useState("Spanish") // Padrão Espanha / Trabalhadores
  const [isTranslatingOutbound, setIsTranslatingOutbound] = useState(false)

  // Tags States
  const [showTagsMenu, setShowTagsMenu] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#4b5563')

  // Header Quick Transfer Modal States
  const [showHeaderTransfer, setShowHeaderTransfer] = useState(false)
  const [headerTransferSpecialty, setHeaderTransferSpecialty] = useState('')
  const [headerTransferDeptId, setHeaderTransferDeptId] = useState('')
  const [headerTransferUserId, setHeaderTransferUserId] = useState('')
  const [headerTransferReason, setHeaderTransferReason] = useState('')
  const [isSubmittingHeaderTransfer, setIsSubmittingHeaderTransfer] = useState(false)

  const [showEmoji, setShowEmoji] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([])
  const [selectedQuickReplyIdx, setSelectedQuickReplyIdx] = useState(0)
  const [quickReplySearch, setQuickReplySearch] = useState('')
  const [showInlineNewReply, setShowInlineNewReply] = useState(false)
  const [newReplyTitle, setNewReplyTitle] = useState('')
  const [newReplyShortcut, setNewReplyShortcut] = useState('')
  const [newReplyContent, setNewReplyContent] = useState('')
  const [savingInlineReply, setSavingInlineReply] = useState(false)
  const [availableChannels, setAvailableChannels] = useState<any[]>([])
  const [isSwitchingChannel, setIsSwitchingChannel] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [attachment, setAttachment] = useState<{ file: File; type: 'image' | 'document'; previewUrl?: string } | null>(null)

  const docInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load saved translator config + current user info
  useEffect(() => {
    try {
      const saved = localStorage.getItem('mcs_chat_translator_config')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (typeof parsed.active === 'boolean') setTranslatorActive(parsed.active)
        if (parsed.myLang) setMyLang(parsed.myLang)
        if (parsed.targetLang && TARGET_LANG_MAP[parsed.targetLang]) setTargetLang(parsed.targetLang)
      }
    } catch {}

    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user
      if (!user) return
      setCurrentUserId(user.id)

      const { data: mcsUser } = await supabase
        .from('mcs_users')
        .select('id, name, display_name, full_name, email, department_id')
        .eq('id', user.id)
        .maybeSingle()

      const resolvedName =
        mcsUser?.display_name ||
        mcsUser?.name ||
        mcsUser?.full_name ||
        user.user_metadata?.full_name ||
        user.email?.split('@')[0] ||
        'Atendente MCS'
      setCurrentUserName(resolvedName)

      if (mcsUser?.department_id) {
        const { data: dept } = await supabase
          .from('mcs_departments')
          .select('name')
          .eq('id', mcsUser.department_id)
          .maybeSingle()
        if (dept?.name) setCurrentUserDept(dept.name)
      }
    })

    fetchQuickReplies()
    supabase
      .from('chat_channels')
      .select('id, name, company_name, channel_type, display_label, phone_number')
      .eq('is_active', true)
      .order('company_name', { ascending: true })
      .then(({ data }) => {
        if (data) setAvailableChannels(data)
      })
  }, [])

  const updateTranslator = (updates: { active?: boolean; myLang?: string; targetLang?: string }) => {
    const nextActive = updates.active !== undefined ? updates.active : translatorActive
    const nextMyLang = updates.myLang !== undefined ? updates.myLang : myLang
    const nextTargetLang = updates.targetLang !== undefined ? updates.targetLang : targetLang

    setTranslatorActive(nextActive)
    setMyLang(nextMyLang)
    setTargetLang(nextTargetLang)
    try {
      localStorage.setItem(
        'mcs_chat_translator_config',
        JSON.stringify({ active: nextActive, myLang: nextMyLang, targetLang: nextTargetLang })
      )
    } catch {}
  }

  // Keyboard shortcuts Alt+Shift+1..6 and Alt+Shift+T (CRM Standard)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey) {
        const code = e.code
        const keyMap: Record<string, string> = {
          Digit1: 'Spanish', Numpad1: 'Spanish',
          Digit2: 'English', Numpad2: 'English',
          Digit3: 'Portuguese', Numpad3: 'Portuguese',
          Digit4: 'Italian', Numpad4: 'Italian',
          Digit5: 'French', Numpad5: 'French',
          Digit6: 'German', Numpad6: 'German',
        }
        if (keyMap[code]) {
          e.preventDefault()
          updateTranslator({ active: true, targetLang: keyMap[code] })
        } else if (code === 'KeyT' || code === 'Digit0' || code === 'Numpad0') {
          e.preventDefault()
          updateTranslator({ active: !translatorActive })
        }
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [translatorActive, myLang, targetLang])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchQuickReplies = async () => {
    const { data } = await supabase.from('chat_quick_replies').select('*').order('created_at', { ascending: false })
    if (data) setQuickReplies(data)
  }

  const handleAddTag = async (customName?: string, customColor?: string) => {
    const tagToAddName = (customName ?? newTagName).trim()
    const tagToAddColor = customColor ?? newTagColor
    if (!tagToAddName || !context?.conversation) return

    const currentTags = Array.isArray(context.conversation.tags) ? context.conversation.tags : []
    const existingIdx = currentTags.findIndex(
      (t: any) => (t?.name || '').toLowerCase() === tagToAddName.toLowerCase()
    )

    let updatedTags: any[]
    if (existingIdx >= 0) {
      if (customName) {
        // Clicking an already active quick suggestion toggles it off
        updatedTags = currentTags.filter((_: any, i: number) => i !== existingIdx)
      } else {
        return
      }
    } else {
      updatedTags = [
        ...currentTags,
        { id: Date.now().toString(), name: tagToAddName, color: tagToAddColor },
      ]
    }

    setContext((prev: any) =>
      prev ? { ...prev, conversation: { ...prev.conversation, tags: updatedTags } } : null
    )

    const { error } = await supabase
      .from('chat_conversations')
      .update({ tags: updatedTags })
      .eq('id', conversationId)

    if (error) {
      setContext((prev: any) =>
        prev ? { ...prev, conversation: { ...prev.conversation, tags: currentTags } } : null
      )
    } else {
      if (!customName) setNewTagName('')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mcs-chat-updated', { detail: { conversationId } }))
      }
    }
  }

  const handleRemoveTag = async (tagName: string) => {
    if (!context?.conversation) return
    const currentTags = Array.isArray(context.conversation.tags) ? context.conversation.tags : []
    const updatedTags = currentTags.filter((t: any) => t.name !== tagName)
    setContext((prev: any) =>
      prev ? { ...prev, conversation: { ...prev.conversation, tags: updatedTags } } : null
    )

    const { error } = await supabase
      .from('chat_conversations')
      .update({ tags: updatedTags })
      .eq('id', conversationId)
    if (error) {
      setContext((prev: any) =>
        prev ? { ...prev, conversation: { ...prev.conversation, tags: currentTags } } : null
      )
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mcs-chat-updated', { detail: { conversationId } }))
    }
  }

  const handleOpenHeaderTransfer = () => {
    setHeaderTransferDeptId(context?.conversation?.department_id || '')
    setHeaderTransferUserId(context?.conversation?.assigned_to || '')
    setHeaderTransferSpecialty('')
    setHeaderTransferReason('')
    setShowHeaderTransfer(true)
    setShowTagsMenu(false)
  }

  const handleConfirmHeaderTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmittingHeaderTransfer) return
    setIsSubmittingHeaderTransfer(true)
    try {
      const allUsers = context?.users || []
      const allDepts = context?.departments || []
      const selectedUser = allUsers.find((u: any) => u.id === headerTransferUserId)
      const effectiveDeptId = headerTransferDeptId || selectedUser?.department_id || ''
      const selectedDept = allDepts.find((d: any) => d.id === effectiveDeptId)
      const assignedName = selectedUser
        ? selectedUser.display_name || selectedUser.name || selectedUser.email
        : null

      const { nextTags } = await executeConversationTransfer({
        conversationId,
        currentTags: context?.conversation?.tags || [],
        targetDeptId: effectiveDeptId || null,
        targetDeptName: selectedDept?.name || null,
        targetUserId: headerTransferUserId || null,
        targetUserName: assignedName,
        senderUserId: currentUserId,
        senderUserName: currentUserName,
        specialtyId: headerTransferSpecialty || null,
        reason: headerTransferReason,
        contactName:
          context?.worker?.nome ||
          context?.conversation?.contact_name ||
          context?.conversation?.contact_phone ||
          'Trabalhador',
        contactPhone: context?.conversation?.contact_phone || null,
      })

      const specObj = MCS_TRANSFER_SPECIALTIES.find((s) => s.id === headerTransferSpecialty)
      setContext((prev: any) =>
        prev
          ? {
              ...prev,
              conversation: {
                ...prev.conversation,
                department_id: effectiveDeptId || null,
                department: selectedDept || null,
                assigned_to: headerTransferUserId || null,
                assigned_to_name: assignedName,
                transferred_by_name: currentUserName,
                transfer_category: specObj?.shortLabel || null,
                transfer_note: headerTransferReason.trim() || null,
                tags: nextTags,
              },
            }
          : null
      )

      await refetchMessages()
      setShowHeaderTransfer(false)
      setHeaderTransferReason('')
    } catch (err: any) {
      alert('Erro ao transferir conversa: ' + (err.message || ''))
    } finally {
      setIsSubmittingHeaderTransfer(false)
    }
  }

  const togglePin = async () => {
    if (!context?.conversation) return
    const newStatus = !context.conversation.is_pinned
    setContext((prev: any) => prev ? { ...prev, conversation: { ...prev.conversation, is_pinned: newStatus } } : null)
    await supabase.from('chat_conversations').update({ is_pinned: newStatus }).eq('id', conversationId)
    window.dispatchEvent(new CustomEvent('mcs-chat-updated'))
  }

  const resolvedSenderDept = context?.conversation?.department?.name || currentUserDept || 'Operações'

  const handleTranslateAndSend = async () => {
    if (!text.trim() || isSending || isTranslatingOutbound) return
    setIsTranslatingOutbound(true)
    const rawContent = text
    setText('')
    try {
      const res = await translateOutboundMessage(rawContent, targetLang)
      if (res.success && res.translation) {
        await sendMessage(res.translation, activeTab === 'note' ? 'internal_note' : 'text', {
          quoted: replyingTo?.id,
          senderName: currentUserName,
          senderDepartment: resolvedSenderDept,
          senderUserId: currentUserId || undefined
        })
      } else {
        setText(rawContent)
      }
    } finally {
      setIsTranslatingOutbound(false)
      setReplyingTo(null)
    }
  }

  const handleEditMessage = async (msg: any) => {
    const newText = prompt('Editar mensagem enviada:', msg.content || '')
    if (newText === null || newText.trim() === '' || newText.trim() === msg.content) return
    await editMessage(msg.id, newText.trim())
  }

  const handleDeleteMessage = async (msg: any) => {
    if (!confirm(t('chatArea', 'confirmDelete') || 'Deseja realmente apagar esta mensagem para todos?')) return

    try {
      const res = await fetch('/api/chat/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: msg.id,
          externalId: msg.external_id || msg.id
        })
      })

      if (!res.ok) {
        await supabase.from('chat_messages').update({ content: '🚫 Mensagem apagada', status: 'deleted' }).eq('id', msg.id)
      }
      await refetchMessages()
      window.dispatchEvent(new CustomEvent('mcs-chat-updated'))
    } catch (err) {
      console.error('Falha ao apagar msg', err)
    }
  }

  const handleSend = async () => {
    if ((!text.trim() && !attachment) || isSending || isUploading) return
    setIsSending(true)

    try {
      if (attachment) {
        setIsUploading(true)
        const fileExt = attachment.file.name.split('.').pop() || 'png'
        const fileName = `chat_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`

        const { error: uploadError } = await supabase.storage.from('chat_media').upload(fileName, attachment.file)
        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage.from('chat_media').getPublicUrl(fileName)

        await sendMessage(text.trim() || '', attachment.type, {
          mediaUrl: publicUrl,
          fileName: attachment.file.name,
          quoted: replyingTo?.id,
          senderName: currentUserName,
          senderDepartment: resolvedSenderDept,
          senderUserId: currentUserId || undefined
        })

        setAttachment(null)
        setText('')
        setReplyingTo(null)
        setShowQuickReplies(false)
        setShowEmoji(false)
        setIsUploading(false)
        return
      }

      await sendMessage(text, activeTab === 'note' ? 'internal_note' : 'text', {
        quoted: replyingTo?.id,
        senderName: currentUserName,
        senderDepartment: resolvedSenderDept,
        senderUserId: currentUserId || undefined
      })
      setText('')
      setShowQuickReplies(false)
      setShowEmoji(false)
      setReplyingTo(null)
    } catch (err) {
      console.error('Erro ao enviar anexo:', err)
      alert(t('chatArea', 'error'))
    } finally {
      setIsSending(false)
      setIsUploading(false)
    }
  }

  const handleSendAudio = async (base64Audio: string) => {
    if (isSending) return
    setIsSending(true)
    try {
      await sendMessage(base64Audio, 'audio', {
        senderName: currentUserName,
        senderDepartment: resolvedSenderDept,
        senderUserId: currentUserId || undefined
      })
    } finally {
      setIsSending(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'document') => {
    const file = e.target.files?.[0]
    if (!file) return

    const maxSize = type === 'image' ? 16 * 1024 * 1024 : 100 * 1024 * 1024
    if (file.size > maxSize) {
      alert(type === 'image' ? t('chatArea', 'maxImageLimit') : t('chatArea', 'maxDocLimit'))
      return
    }

    setShowAttach(false)
    let previewUrl
    if (type === 'image') {
      previewUrl = URL.createObjectURL(file)
    }
    setAttachment({ file, type, previewUrl })
    if (e.target) e.target.value = ''
  }

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault()
        const file = items[i].getAsFile()
        if (!file) continue

        const maxSize = 16 * 1024 * 1024
        if (file.size > maxSize) {
          alert(t('chatArea', 'maxImageLimit'))
          return
        }

        const previewUrl = URL.createObjectURL(file)
        setAttachment({ file, type: 'image', previewUrl })
        break
      }
    }
  }

  const handleAssign = async () => {
    if (!currentUserId || isAssigning) return
    setIsAssigning(true)
    try {
      await supabase
        .from('chat_conversations')
        .update({
          assigned_to: currentUserId,
          assigned_to_name: currentUserName,
          status: 'open'
        })
        .eq('id', conversationId)

      setContext((prev: any) =>
        prev
          ? {
              ...prev,
              conversation: {
                ...prev.conversation,
                assigned_to: currentUserId,
                assigned_to_name: currentUserName,
                status: 'open'
              }
            }
          : null
      )

      // Registra o Bloco de Atendimento no histórico do Chat
      await sendMessage(
        `🔄 BLOCO DE ATENDIMENTO INICIADO — ${currentUserName} (${resolvedSenderDept}) assumiu a conversa`,
        'system_block',
        {
          senderName: currentUserName,
          senderDepartment: resolvedSenderDept,
          senderUserId: currentUserId
        }
      )

      router.refresh()
    } finally {
      setIsAssigning(false)
    }
  }

  const handleClose = async () => {
    if (isAssigning) return
    setIsAssigning(true)
    try {
      await sendMessage(
        `✅ BLOCO DE ATENDIMENTO ENCERRADO por ${currentUserName} (${resolvedSenderDept})`,
        'system_block',
        {
          senderName: currentUserName,
          senderDepartment: resolvedSenderDept,
          senderUserId: currentUserId || undefined
        }
      )
      await supabase
        .from('chat_conversations')
        .update({ status: 'closed', assigned_to: null, assigned_to_name: null })
        .eq('id', conversationId)
      router.replace('/inbox')
    } catch (error) {
      console.error('Erro ao encerrar:', error)
    } finally {
      setIsAssigning(false)
    }
  }

  const onEmojiClick = (emojiData: EmojiClickData) => {
    setText((prev) => prev + emojiData.emoji)
  }

  const handleSelectQuickReply = (content: string) => {
    setText((prev) => {
      const replaced = prev.replace(/(^|\s)\/[^\s]*$/i, '$1')
      return replaced + content
    })
    setShowQuickReplies(false)
    setQuickReplySearch('')
    setSelectedQuickReplyIdx(0)
    setTimeout(() => textareaRef.current?.focus(), 20)
  }

  const handleSaveInlineQuickReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newReplyTitle.trim() || !newReplyContent.trim() || savingInlineReply) return
    setSavingInlineReply(true)
    try {
      const slug = newReplyTitle
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 28)
      let cleanShortcut = newReplyShortcut.trim()
      if (!cleanShortcut) {
        cleanShortcut = slug ? `/${slug}` : '/atalho'
      } else if (!cleanShortcut.startsWith('/')) {
        cleanShortcut = '/' + cleanShortcut.replace(/\s+/g, '-')
      }

      const { data, error } = await supabase
        .from('chat_quick_replies')
        .insert({
          title: newReplyTitle.trim(),
          shortcut: cleanShortcut,
          content: newReplyContent.trim()
        })
        .select()
        .single()

      if (error) {
        alert('Erro ao salvar mensagem rápida: ' + error.message)
        return
      }
      if (data) {
        setQuickReplies((prev) => [data, ...prev])
        setNewReplyTitle('')
        setNewReplyShortcut('')
        setNewReplyContent('')
        setShowInlineNewReply(false)
      }
    } finally {
      setSavingInlineReply(false)
    }
  }

  const handleAiQuickDraft = (draftText: string) => {
    setText(draftText)
    setShowAiMenu(false)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setText(val)

    const latestWordMatch = val.match(/(^|\s)(\/[^\s]*)$/i)
    if (latestWordMatch) {
      if (!showQuickReplies) {
        fetchQuickReplies()
      }
      setShowQuickReplies(true)
      setSelectedQuickReplyIdx(0)
    } else if (showQuickReplies) {
      setShowQuickReplies(false)
    }
  }

  const currentMatch = text.match(/(^|\s)(\/[^\s]*)$/i)
  const currentShortcutStr = currentMatch ? currentMatch[2].toLowerCase() : ''
  const slashSearchTerm = currentShortcutStr.startsWith('/')
    ? currentShortcutStr.slice(1).trim().toLowerCase()
    : ''
  const effectiveQuickSearch = (slashSearchTerm || quickReplySearch.trim().toLowerCase())

  const filteredReplies = effectiveQuickSearch
    ? quickReplies.filter((r) => {
        const sc = (r.shortcut || '').toLowerCase()
        const tl = (r.title || '').toLowerCase()
        const ct = (r.content || '').toLowerCase()
        return (
          sc.includes(effectiveQuickSearch) ||
          tl.includes(effectiveQuickSearch) ||
          ct.includes(effectiveQuickSearch)
        )
      })
    : quickReplies

  const conversation = context?.conversation
  const isMine = conversation?.assigned_to === currentUserId
  const isClosed = conversation?.status === 'closed'
  const isPrivateNote = activeTab === 'note'
  const activeLangTheme = TARGET_LANG_MAP[targetLang] || TARGET_LANG_MAP.Spanish

  const workerCompany =
    context?.worker?.contratante ||
    context?.company?.trade_name ||
    context?.company?.nome ||
    conversation?.worker_company_name ||
    conversation?.channel?.company_name ||
    null

  const workerRegisteredCompany = (
    context?.worker?.contratante ||
    conversation?.worker_company_name ||
    ''
  ).trim().toUpperCase()

  const activeChannelCompany = (conversation?.channel?.company_name || '').trim().toUpperCase()
  const isChannelMismatch = Boolean(
    workerRegisteredCompany &&
      activeChannelCompany &&
      workerRegisteredCompany !== activeChannelCompany
  )

  const officialWorkerChannel = availableChannels.find(
    ch =>
      (ch.channel_type || 'workers') === 'workers' &&
      workerRegisteredCompany &&
      (ch.company_name || '').trim().toUpperCase() === workerRegisteredCompany
  )

  const handleSwitchToChannel = async (targetChannelId: string) => {
    if (!targetChannelId || targetChannelId === conversation?.channel_id || isSwitchingChannel) return
    const phone = (conversation?.contact_phone || context?.worker?.movil || '').replace(/\D/g, '')
    if (!phone) {
      alert('Telefone do contato não encontrado para abrir conversa no outro canal.')
      return
    }
    setIsSwitchingChannel(true)
    try {
      const { data: existing } = await supabase
        .from('chat_conversations')
        .select('id')
        .eq('channel_id', targetChannelId)
        .ilike('contact_phone', `%${phone.slice(-8)}%`)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existing?.id) {
        await supabase
          .from('chat_conversations')
          .update({
            status: 'open',
            worker_id: conversation?.worker_id || context?.worker?.id || null,
            worker_company_name: context?.worker?.contratante || conversation?.worker_company_name || null,
            worker_client_name: context?.worker?.cliente || conversation?.worker_client_name || null,
            worker_function_name: context?.worker?.funcion || conversation?.worker_function_name || null
          })
          .eq('id', existing.id)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('mcs-chat-updated', { detail: { conversationId: existing.id } }))
        }
        router.push(`/inbox/${existing.id}`)
        return
      }

      const { data: created, error } = await supabase
        .from('chat_conversations')
        .insert({
          channel_id: targetChannelId,
          contact_phone: phone,
          contact_name: context?.worker?.nome || conversation?.contact_name || phone,
          worker_id: conversation?.worker_id || context?.worker?.id || null,
          worker_company_name: context?.worker?.contratante || conversation?.worker_company_name || null,
          worker_client_name: context?.worker?.cliente || conversation?.worker_client_name || null,
          worker_function_name: context?.worker?.funcion || conversation?.worker_function_name || null,
          status: 'open',
          unread_count: 0,
          last_message_at: new Date().toISOString()
        })
        .select('id')
        .single()

      if (!error && created?.id) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('mcs-chat-updated', { detail: { conversationId: created.id } }))
        }
        router.push(`/inbox/${created.id}`)
      }
    } finally {
      setIsSwitchingChannel(false)
    }
  }

  const workerClient =
    context?.worker?.cliente ||
    conversation?.worker_client_name ||
    null

  const channelType = conversation?.channel?.channel_type || (
    (conversation?.channel?.name || '').toLowerCase().includes('cliente')
      ? 'clients'
      : ['centralcars', 'safetyprevi'].includes((conversation?.channel?.name || '').toLowerCase())
        ? 'general'
        : 'workers'
  )
  const channelDisplayLabel = conversation?.channel?.display_label || conversation?.channel?.name || null

  return (
    <div className="flex flex-col h-full bg-[var(--chat-area-bg)] relative transition-colors duration-300">
      {/* Top Conversation Header (Compacto para mais área de chat) */}
      <div className="h-16 flex-shrink-0 bg-chat-surface-bg/90 backdrop-blur-md border-b border-chat-inbound-border px-4 flex items-center justify-between shadow-[0_4px_24px_-12px_rgba(0,0,0,0.05)] z-20 sticky top-0 transition-colors duration-300">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm overflow-hidden relative ${
              channelType === 'clients'
                ? 'bg-gradient-to-br from-purple-600 to-indigo-600'
                : channelType === 'general'
                  ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                  : 'bg-gradient-to-br from-emerald-500 to-teal-600'
            }`}>
              <span>
                {(context?.worker?.nome || context?.conversation?.contact_name || 'RH').substring(0, 2).toUpperCase()}
              </span>
              {(context?.worker?.foto || context?.conversation?.contact_avatar_url) && (
                <img
                  src={context?.worker?.foto || context?.conversation?.contact_avatar_url}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              )}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white"></div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm tracking-tight leading-tight truncate">
                {context?.worker?.nome || context?.conversation?.contact_name || context?.conversation?.contact_phone || 'Painel de Atendimento'}
              </h2>
              {workerCompany && (
                <span
                  className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 shrink-0"
                  title="Empresa contratante na ficha do trabalhador"
                >
                  <Building2 className="w-2.5 h-2.5" />
                  Ficha: {workerCompany}
                </span>
              )}
              {availableChannels.length > 0 ? (
                <div className="relative inline-flex items-center shrink-0">
                  <select
                    value={conversation?.channel_id || ''}
                    disabled={isSwitchingChannel}
                    onChange={e => handleSwitchToChannel(e.target.value)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border cursor-pointer outline-none transition-colors ${
                      isChannelMismatch
                        ? 'bg-rose-100 text-rose-800 border-rose-300 ring-2 ring-rose-400/40'
                        : 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100'
                    }`}
                    title="Canal de WhatsApp ativo desta conversa (clique para alternar de número)"
                  >
                    {availableChannels.map(ch => (
                      <option key={ch.id} value={ch.id}>
                        📱 WhatsApp: {ch.company_name || ch.name} {ch.phone_number ? `(+${ch.phone_number.slice(-4)})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span
                  className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200 flex items-center gap-1 shrink-0"
                  title={`Canal de WhatsApp: ${channelDisplayLabel || ''}`}
                >
                  📱 WhatsApp: {activeChannelCompany || 'Trabalhadores'} {conversation?.channel?.phone_number ? `(+${conversation.channel.phone_number.slice(-4)})` : ''}
                </span>
              )}
              {workerClient && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 max-w-[200px] truncate shrink-0">
                  <Briefcase className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{workerClient}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {context?.conversation?.contact_phone && (
                <span className="text-[11px] font-mono font-medium text-slate-500">
                  +{context.conversation.contact_phone.replace(/\D/g, '')}
                </span>
              )}
              {conversation?.department?.name && (
                <span
                  className="px-1.5 py-0.2 rounded text-[9.5px] font-bold uppercase tracking-wider border"
                  style={{
                    backgroundColor: `${conversation.department.color || '#6366f1'}15`,
                    color: conversation.department.color || '#6366f1',
                    borderColor: `${conversation.department.color || '#6366f1'}40`
                  }}
                >
                  📂 {conversation.department.name}
                </span>
              )}
              {conversation?.assigned_to_name && (
                <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                  <UserCheck className="w-2.5 h-2.5" />
                  {conversation.assigned_to_name}
                </span>
              )}

              {/* Etiquetas Ativas no Cabeçalho (Padrão CRM IPTV) */}
              {Array.isArray(context?.conversation?.tags) &&
                context.conversation.tags.map((tag: any, idx: number) => {
                  const darkTxt = isLightTagColor(tag.color)
                  return (
                    <span
                      key={idx}
                      onClick={() => setShowTagsMenu(true)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 shadow-2xs cursor-pointer transition-transform hover:scale-105 ${
                        darkTxt ? 'text-slate-900 border border-black/10' : 'text-white'
                      }`}
                      style={{ backgroundColor: tag.color || '#16a34a' }}
                      title="Clique para gerenciar etiquetas"
                    >
                      <span>{tag.name}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveTag(tag.name)
                        }}
                        className="hover:bg-black/20 rounded-full p-0.5 transition-colors"
                        title={`Remover etiqueta ${tag.name}`}
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  )
                })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isClosed ? (
            <span className="px-3 py-1.5 bg-slate-100 text-slate-500 text-xs font-bold rounded-lg border border-slate-200 flex items-center gap-1.5">
              <LockKeyhole className="w-3.5 h-3.5" />
              {t('chatArea', 'closedTicket')}
            </span>
          ) : isMine ? (
            <button
              onClick={handleClose}
              disabled={isAssigning}
              className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t('chatArea', 'endChat')}
            </button>
          ) : (
            <button
              onClick={handleAssign}
              disabled={isAssigning}
              className="px-3 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <LockOpen className="w-3.5 h-3.5" />
              {t('chatArea', 'takeChat')}
            </button>
          )}

          {/* Botão Transferir Direto no Cabeçalho (Para outro colega do mesmo setor ou outro setor) */}
          <div className="relative">
            <button
              type="button"
              onClick={handleOpenHeaderTransfer}
              className={`px-2.5 py-1.5 border rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                showHeaderTransfer
                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                  : 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100'
              }`}
              title="Transferir conversa para outro atendente (Horário, Seguridade, Nómina, Adiantamento, etc.)"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Transferir</span>
            </button>

            {showHeaderTransfer && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowHeaderTransfer(false)} />
                <div className="absolute top-full right-0 mt-2 w-[380px] max-w-[94vw] bg-white dark:bg-slate-900 shadow-2xl rounded-2xl border border-slate-200 dark:border-slate-800 p-4 z-50 animate-in fade-in zoom-in-95 origin-top-right">
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                        <ArrowRightLeft className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 leading-tight">
                          Transferir Atendimento
                        </h4>
                        <p className="text-[10.5px] text-slate-500">
                          Direcione para o colega responsável e notifique na tela dele
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowHeaderTransfer(false)}
                      className="text-slate-400 hover:text-slate-600 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <form onSubmit={handleConfirmHeaderTransfer} className="space-y-3">
                    {/* 1. Assunto / Especialidade (Etiqueta Automática) */}
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">
                        1. Assunto / Especialidade (Aplica Etiqueta)
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {MCS_TRANSFER_SPECIALTIES.map((spec) => {
                          const isSelected = headerTransferSpecialty === spec.id
                          return (
                            <button
                              key={spec.id}
                              type="button"
                              onClick={() =>
                                setHeaderTransferSpecialty(isSelected ? '' : spec.id)
                              }
                              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-left border transition-all flex items-center gap-1.5 cursor-pointer truncate ${
                                isSelected
                                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs ring-2 ring-indigo-500/20'
                                  : 'bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800'
                              }`}
                              title={spec.description}
                            >
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: isSelected ? '#ffffff' : spec.tagColor }}
                              />
                              <span className="truncate">{spec.shortLabel}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* 2. Setor de Destino */}
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                        2. Setor de Destino
                      </label>
                      <select
                        value={headerTransferDeptId}
                        onChange={(e) => {
                          const nextDept = e.target.value
                          setHeaderTransferDeptId(nextDept)
                          if (nextDept && headerTransferUserId) {
                            const curr = (context?.users || []).find(
                              (u: any) => u.id === headerTransferUserId
                            )
                            if (curr && curr.department_id !== nextDept) {
                              setHeaderTransferUserId('')
                            }
                          }
                        }}
                        className="w-full text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100"
                      >
                        <option value="">📂 Todos os Setores / Fila Geral</option>
                        {(context?.departments || []).map((dept: any) => {
                          const cnt = (context?.users || []).filter(
                            (u: any) => u.department_id === dept.id
                          ).length
                          return (
                            <option key={dept.id} value={dept.id}>
                              📂 {dept.name} ({cnt} atendentes)
                            </option>
                          )
                        })}
                      </select>
                    </div>

                    {/* 3. Escolher o Atendente / Colega */}
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                        3. Para qual Atendente vai a conversa? (Receberá Alerta 🔔)
                      </label>
                      <div className="max-h-36 overflow-y-auto space-y-1 p-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => setHeaderTransferUserId('')}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                            !headerTransferUserId
                              ? 'bg-indigo-600 text-white'
                              : 'hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <span>👥 Qualquer colega do setor (Fila Aberta)</span>
                          {!headerTransferUserId && <Check className="w-3.5 h-3.5" />}
                        </button>
                        {(headerTransferDeptId
                          ? (context?.users || []).filter(
                              (u: any) => u.department_id === headerTransferDeptId
                            )
                          : context?.users || []
                        ).map((u: any) => {
                          const isSelected = headerTransferUserId === u.id
                          const uName = u.display_name || u.name || u.email
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => {
                                setHeaderTransferUserId(u.id)
                                if (!headerTransferDeptId && u.department_id) {
                                  setHeaderTransferDeptId(u.department_id)
                                }
                              }}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-indigo-600 text-white shadow-xs'
                                  : 'hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 text-[10px] font-extrabold flex items-center justify-center shrink-0">
                                  {String(uName).substring(0, 2).toUpperCase()}
                                </span>
                                <span className="truncate">{uName}</span>
                                {!headerTransferDeptId && u.department_name && (
                                  <span
                                    className={`text-[10px] px-1.5 py-0.2 rounded ${
                                      isSelected
                                        ? 'bg-white/20 text-white'
                                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                    }`}
                                  >
                                    {u.department_name}
                                  </span>
                                )}
                              </div>
                              {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* 4. Motivo / Instrução para o Colega */}
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                        4. Resumo / Orientação para o Colega
                      </label>
                      <input
                        type="text"
                        value={headerTransferReason}
                        onChange={(e) => setHeaderTransferReason(e.target.value)}
                        placeholder="Ex: Precisa de Alta na Seguridade / Pede adiantamento..."
                        className="w-full text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmittingHeaderTransfer}
                      className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>
                        {isSubmittingHeaderTransfer
                          ? 'Transferindo e Notificando...'
                          : 'Confirmar Transferência e Notificar 🔔'}
                      </span>
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>

          {/* Botão Tags (Modal Evoluído Estilo CRM IPTV adaptado p/ MCS) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowTagsMenu(!showTagsMenu)
                setShowHeaderTransfer(false)
              }}
              className={`px-2.5 py-1.5 border rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                showTagsMenu
                  ? 'bg-slate-200/80 dark:bg-slate-800 border-slate-300 text-slate-900 dark:text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Tags</span>
              {(context?.conversation?.tags || []).length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                  {context?.conversation?.tags?.length}
                </span>
              )}
            </button>

            {showTagsMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowTagsMenu(false)}></div>
                <div className="absolute top-full right-0 mt-2 w-[385px] max-w-[94vw] bg-white dark:bg-slate-900 shadow-2xl rounded-2xl border border-slate-200 dark:border-slate-800 p-5 z-50 animate-in fade-in zoom-in-95 origin-top-right">
                  {/* Título */}
                  <div className="flex items-center gap-2 mb-4">
                    <Tag className="w-4 h-4 text-slate-800 dark:text-slate-100" />
                    <h3 className="font-extrabold text-slate-800 dark:text-slate-100 text-base tracking-tight">
                      Etiquetas do Contato
                    </h3>
                  </div>

                  {/* Etiquetas atuais */}
                  <div className="mb-4">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2">
                      Etiquetas atuais
                    </span>
                    <div className="flex flex-wrap gap-2 min-h-[34px]">
                      {(context?.conversation?.tags || []).length === 0 && (
                        <p className="text-xs text-slate-400 italic py-1">
                          Nenhuma etiqueta atribuída a esta conversa.
                        </p>
                      )}
                      {(context?.conversation?.tags || []).map((tag: any, idx: number) => {
                        const darkTxt = isLightTagColor(tag.color)
                        return (
                          <span
                            key={idx}
                            className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-xs ${
                              darkTxt ? 'text-slate-900 border border-black/10' : 'text-white'
                            }`}
                            style={{ backgroundColor: tag.color || '#16a34a' }}
                          >
                            <span>{tag.name}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveTag(tag.name)}
                              className="w-4 h-4 rounded-full bg-black/20 hover:bg-black/35 flex items-center justify-center transition-colors cursor-pointer"
                              title="Remover etiqueta"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  </div>

                  {/* Nova Etiqueta + Sugestões Rápidas MCS */}
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3.5 mb-4">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2">
                      Nova Etiqueta
                    </span>
                    <div className="flex gap-2 mb-3 w-full">
                      <input
                        type="text"
                        placeholder="Ex: Horário / Ponto, Seguridade..."
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                        className="flex-1 min-w-0 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddTag()}
                        disabled={!newTagName.trim()}
                        className="bg-[#f97316] hover:bg-[#ea580c] disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-extrabold transition-colors shrink-0 shadow-xs cursor-pointer"
                      >
                        Adicionar
                      </button>
                    </div>

                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-2">
                      SUGESTÕES RÁPIDAS (RH • TRABALHADORES • OPERAÇÕES)
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {MCS_QUICK_TAGS.map((sug) => {
                        const isAssigned = (context?.conversation?.tags || []).some(
                          (t: any) => (t?.name || '').toLowerCase() === sug.name.toLowerCase()
                        )
                        return (
                          <button
                            key={sug.name}
                            type="button"
                            onClick={() => handleAddTag(sug.name, sug.color)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold text-white transition-all cursor-pointer flex items-center gap-1 ${
                              isAssigned
                                ? 'ring-2 ring-offset-1 ring-slate-900 dark:ring-white opacity-100 scale-[1.03]'
                                : 'opacity-90 hover:opacity-100 hover:scale-[1.03]'
                            }`}
                            style={{ backgroundColor: sug.color }}
                            title={
                              isAssigned
                                ? 'Clique para remover esta etiqueta'
                                : 'Clique para aplicar esta etiqueta imediatamente'
                            }
                          >
                            <span>{sug.name}</span>
                            {isAssigned && <Check className="w-3 h-3 stroke-[3]" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Cores principais (8 cores estilo CRM IPTV) */}
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3.5 mb-3.5">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2.5">
                      Cores principais
                    </span>
                    <div className="grid grid-cols-8 gap-1.5">
                      {CRM_MAIN_COLORS.map((c) => {
                        const selected = newTagColor.toLowerCase() === c.hex.toLowerCase()
                        return (
                          <button
                            key={c.hex}
                            type="button"
                            onClick={() => setNewTagColor(c.hex)}
                            className="flex flex-col items-center gap-1 group cursor-pointer"
                          >
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                                selected ? 'ring-2 ring-blue-600 ring-offset-2 scale-105' : 'hover:scale-105'
                              }`}
                              style={{ backgroundColor: c.hex }}
                            >
                              {selected && <Check className="w-4 h-4 text-white stroke-[3]" />}
                            </div>
                            <span className="text-[9.5px] text-slate-500 dark:text-slate-400 truncate w-full text-center">
                              {c.name}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Mais cores (16 cores em 2 linhas de 8 estilo CRM IPTV) */}
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3.5 mb-4">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2.5">
                      Mais cores
                    </span>
                    <div className="grid grid-cols-8 gap-x-1.5 gap-y-2.5">
                      {CRM_MORE_COLORS.map((c) => {
                        const selected = newTagColor.toLowerCase() === c.hex.toLowerCase()
                        return (
                          <button
                            key={c.hex}
                            type="button"
                            onClick={() => setNewTagColor(c.hex)}
                            className="flex flex-col items-center gap-1 group cursor-pointer"
                          >
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all border border-black/5 ${
                                selected ? 'ring-2 ring-blue-600 ring-offset-2 scale-105' : 'hover:scale-105'
                              }`}
                              style={{ backgroundColor: c.hex }}
                            >
                              {selected && (
                                <Check
                                  className={`w-4 h-4 stroke-[3] ${
                                    c.darkText ? 'text-slate-900' : 'text-white'
                                  }`}
                                />
                              )}
                            </div>
                            <span className="text-[9px] text-slate-500 dark:text-slate-400 truncate w-full text-center">
                              {c.name}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Rodapé Concluir */}
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowTagsMenu(false)}
                      className="px-4 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                    >
                      Concluir
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            onClick={togglePin}
            className={`px-2.5 py-1.5 border rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              context?.conversation?.is_pinned
                ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 border-yellow-200 dark:border-yellow-900/50'
                : 'bg-white dark:bg-slate-900 border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${context?.conversation?.is_pinned ? 'fill-yellow-400' : ''}`} />
            <span className="hidden sm:inline">{t('chatArea', 'favorite') || 'Fixar'}</span>
          </button>

          <div className="w-px h-6 bg-slate-200 mx-0.5"></div>
          <button
            onClick={togglePanel}
            className={`p-2 rounded-xl transition-all cursor-pointer ${
              isPanelOpen ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
            }`}
            title="Detalhes do Trabalhador"
          >
            {isPanelOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Faixa de Contexto de Transferência (Quando a conversa foi direcionada por outro colega) */}
      {(conversation?.transferred_by_name || conversation?.transfer_note || conversation?.transfer_category) && (
        <div className="bg-indigo-50/90 dark:bg-indigo-950/60 border-b border-indigo-200 dark:border-indigo-800/80 px-4 py-1.5 flex items-center justify-between gap-3 shrink-0 z-10">
          <div className="flex items-center gap-2 text-xs text-indigo-900 dark:text-indigo-200 min-w-0 flex-wrap">
            <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-extrabold uppercase shrink-0 flex items-center gap-1">
              <ArrowRightLeft className="w-3 h-3" />
              Transferida por {conversation?.transferred_by_name || 'Colega'}
            </span>
            {conversation?.transfer_category && (
              <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 text-[10.5px] font-bold shrink-0">
                📌 Assunto: {conversation.transfer_category}
              </span>
            )}
            {conversation?.assigned_to_name && (
              <span className="text-[11px] font-semibold text-indigo-800 dark:text-indigo-300">
                → Responsável: <strong>{conversation.assigned_to_name}</strong>
              </span>
            )}
            {conversation?.transfer_note && (
              <span className="text-[11px] italic text-indigo-950 dark:text-indigo-100 bg-indigo-100/70 dark:bg-indigo-900/50 px-2 py-0.5 rounded">
                "{conversation.transfer_note}"
              </span>
            )}
          </div>
        </div>
      )}

      {/* Alerta de Divergência entre Empresa do Trabalhador e Canal WhatsApp Ativo */}
      {isChannelMismatch && (
        <div className="bg-rose-50 dark:bg-rose-950/70 border-b border-rose-200 dark:border-rose-800 px-4 py-2 flex items-center justify-between gap-3 shrink-0 z-10">
          <div className="flex items-center gap-2 text-xs text-rose-800 dark:text-rose-200 font-medium min-w-0">
            <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-extrabold uppercase shrink-0">
              ⚠️ Canal Divergente
            </span>
            <span className="truncate">
              Este trabalhador pertence à <strong>{workerRegisteredCompany}</strong> na ficha cadastral, mas esta janela está no WhatsApp da{' '}
              <strong>
                {activeChannelCompany}
                {conversation?.channel?.phone_number ? ` (+${conversation.channel.phone_number})` : ''}
              </strong>
              .
            </span>
          </div>
          {officialWorkerChannel && (
            <button
              type="button"
              disabled={isSwitchingChannel}
              onClick={() => handleSwitchToChannel(officialWorkerChannel.id)}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-xs font-extrabold shrink-0 shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>
                Mudar para WhatsApp {workerRegisteredCompany}
                {officialWorkerChannel.phone_number ? ` (+${officialWorkerChannel.phone_number.slice(-4)})` : ''}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Chat Messages Timeline */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        onClick={() => {
          setShowEmoji(false)
          setShowAttach(false)
          setShowQuickReplies(false)
          setShowAiMenu(false)
        }}
      >
        {loading && <p className="text-center text-slate-400 text-sm mt-10">{t('chatArea', 'loadingMessages')}</p>}
        {messages.length === 0 && !loading && (
          <div className="text-center text-slate-400 text-sm mt-10">{t('chatArea', 'noMessages')}</div>
        )}

        {messages.map((msg, index) => {
          const isOutbound = msg.direction === 'outbound' || msg.direction === 'internal'
          const isNote = msg.message_type === 'internal_note'
          const isSystemBlock = msg.message_type === 'system_block'
          const messageDate = msg.created_at ? new Date(msg.created_at) : null
          const time = messageDate ? format(messageDate, 'HH:mm') : ''

          let showDateSeparator = false
          let dateLabel = ''

          if (messageDate) {
            if (index === 0) {
              showDateSeparator = true
            } else {
              const prevDate = messages[index - 1].created_at ? new Date(messages[index - 1].created_at!) : null
              if (prevDate && !isSameDay(messageDate, prevDate)) {
                showDateSeparator = true
              }
            }

            if (showDateSeparator) {
              if (isToday(messageDate)) {
                dateLabel = 'Hoje'
              } else if (isYesterday(messageDate)) {
                dateLabel = 'Ontem'
              } else {
                dateLabel = format(messageDate, "EEE, d 'DE' MMM.", { locale: ptBR }).toUpperCase()
              }
            }
          }

          // Detect automatic visual block separator when a different internal agent/sector speaks
          const prevOutbound = [...messages.slice(0, index)]
            .reverse()
            .find((m) => m.direction === 'outbound' && m.message_type !== 'system_block')
          const currentSenderKey = `${msg.sender_name || ''}|${(msg as any).sender_department || ''}`
          const prevSenderKey = prevOutbound ? `${prevOutbound.sender_name || ''}|${(prevOutbound as any).sender_department || ''}` : ''
          const showAgentSwitchBanner =
            isOutbound &&
            !isSystemBlock &&
            !isNote &&
            prevOutbound &&
            prevSenderKey !== currentSenderKey &&
            msg.sender_name &&
            prevOutbound.sender_name !== msg.sender_name &&
            messages[index - 1]?.message_type !== 'system_block'

          if (isSystemBlock) {
            return (
              <div key={msg.id} className="my-3">
                {showDateSeparator && (
                  <div className="flex justify-center my-3">
                    <span className="px-4 py-1 bg-slate-200/60 text-slate-500 font-bold text-[10px] tracking-widest rounded-full">
                      {dateLabel}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-center my-2">
                  <div className="flex items-center gap-2.5 px-4 py-1.5 rounded-xl bg-indigo-50/90 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/80 shadow-xs max-w-xl text-center">
                    <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <span className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200 tracking-wide">
                      {msg.content}
                    </span>
                    <span className="text-[10px] font-mono text-indigo-500 dark:text-indigo-400 shrink-0">{time}</span>
                  </div>
                </div>
              </div>
            )
          }

          const senderDisplayName = msg.sender_name || (isOutbound ? currentUserName : (context?.worker?.nome || conversation?.contact_name || 'Trabalhador'))
          const senderDeptBadge = (msg as any).sender_department || (isOutbound ? resolvedSenderDept : null)

          return (
            <div key={msg.id} className={`mb-2.5 animate-in fade-in slide-in-from-bottom-2 ${isOutbound ? 'pr-1' : 'pl-1'}`}>
              {showDateSeparator && (
                <div className="flex justify-center my-3">
                  <span className="px-4 py-1 bg-slate-200/60 text-slate-500 font-bold text-[10px] tracking-widest rounded-full">
                    {dateLabel}
                  </span>
                </div>
              )}

              {showAgentSwitchBanner && (
                <div className="flex items-center justify-center my-2">
                  <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wider">
                    <span>👤 Bloco de Atendimento: {senderDisplayName}</span>
                    {senderDeptBadge && <span>• Setor {senderDeptBadge}</span>}
                  </div>
                </div>
              )}

              <div className={`flex ${isOutbound ? 'justify-end flex-row-reverse' : 'justify-start'} items-end gap-2 max-w-[85%] ${isOutbound ? 'ml-auto' : ''}`}>
                <div
                  className={`w-7 h-7 rounded-full shrink-0 mb-1 flex items-center justify-center text-[10px] font-bold border border-white shadow-2xs ${
                    isOutbound
                      ? isNote
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                  title={senderDisplayName}
                >
                  {senderDisplayName.substring(0, 2).toUpperCase()}
                </div>

                <div className="relative group max-w-full flex items-center">
                  <div
                    className={`absolute top-0 ${
                      isOutbound ? 'right-full mr-2' : 'left-full ml-2'
                    } opacity-0 group-hover:opacity-100 flex items-center transition-opacity z-10 whitespace-nowrap`}
                  >
                    <button
                      onClick={() => setReplyingTo(msg)}
                      className="p-1.5 bg-white shadow-sm border border-slate-200 rounded-full text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
                      title="Responder Mensagem"
                    >
                      <CornerUpLeft className="w-3 h-3" />
                    </button>
                    {isOutbound && msg.message_type === 'text' && msg.status !== 'deleted' && (
                      <button
                        onClick={() => handleEditMessage(msg)}
                        className="p-1.5 bg-white shadow-sm border border-slate-200 rounded-full text-slate-400 hover:text-blue-600 transition-colors ml-1 cursor-pointer"
                        title="Editar Mensagem (WhatsApp)"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                    {isOutbound && msg.status !== 'deleted' && (
                      <button
                        onClick={() => handleDeleteMessage(msg)}
                        className="p-1.5 bg-white shadow-sm border border-slate-200 rounded-full text-slate-400 hover:text-red-500 transition-colors ml-1 cursor-pointer"
                        title="Apagar Mensagem"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div
                    className={`pointer-events-auto px-3.5 py-2 shadow-sm ${
                      isOutbound
                        ? isNote
                          ? 'bg-amber-100 text-amber-900 border border-amber-200 rounded-2xl rounded-br-xs shadow-amber-200/50'
                          : 'bg-[var(--chat-outbound-bg-start)] text-[var(--chat-outbound-fg)] border border-[var(--chat-outbound-border)] rounded-2xl rounded-br-xs shadow-sm'
                        : 'bg-[var(--chat-inbound-bg)] border border-[var(--chat-inbound-border)] rounded-2xl rounded-bl-xs text-[var(--chat-inbound-fg)] shadow-sm'
                    }`}
                  >
                    {/* Header de Identificação de Quem Está Falando e Qual Setor */}
                    {isOutbound && (
                      <div className="flex items-center gap-1.5 mb-1 pb-0.5 border-b border-black/5 dark:border-white/10 text-[10px] font-bold">
                        <span className={isNote ? 'text-amber-800' : 'text-emerald-800 dark:text-emerald-300'}>
                          👤 {senderDisplayName}
                        </span>
                        {senderDeptBadge && (
                          <span className="px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/10 text-[9px] uppercase tracking-wider opacity-85">
                            {senderDeptBadge}
                          </span>
                        )}
                      </div>
                    )}

                    {(msg as any).quoted &&
                      (() => {
                        const qMsg = messages.find(
                          (m: any) => m.id === (msg as any).quoted || m.external_id === (msg as any).quoted
                        )
                        return (
                          <div className="w-full mb-1 p-1.5 bg-black/5 dark:bg-white/10 rounded border-l-4 border-emerald-500/60 text-xs cursor-pointer hover:bg-black/10 transition-colors">
                            <span className="font-bold text-emerald-700 block mb-0.5">
                              {qMsg ? (qMsg.direction === 'outbound' ? qMsg.sender_name || 'Você' : 'Trabalhador') : 'Mensagem'}
                            </span>
                            <span className="text-slate-600 dark:text-slate-300 line-clamp-1 truncate">
                              {qMsg?.content || '...'}
                            </span>
                          </div>
                        )
                      })()}

                    {msg.media_url && msg.message_type === 'image' && (
                      <div className="mb-1 max-w-sm rounded-2xl overflow-hidden mt-1 mx-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={msg.media_url} alt="Media" className="max-w-full h-auto rounded-lg" />
                      </div>
                    )}

                    {msg.media_url && msg.message_type === 'document' && (
                      <a
                        href={msg.media_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 p-3 bg-white/20 rounded-xl mb-1 mt-1 mx-1 hover:bg-white/30 transition"
                      >
                        <div className="p-2 bg-white/50 rounded-lg shrink-0">
                          <FileText className="w-6 h-6" />
                        </div>
                        <span className="text-sm font-medium underline underline-offset-2">{t('chatArea', 'downloadDoc')}</span>
                      </a>
                    )}

                    {msg.media_url && msg.message_type === 'audio' && (
                      <CustomAudioPlayer
                        src={msg.media_url}
                        isOutbound={isOutbound && !isNote}
                        senderInitials={senderDisplayName.substring(0, 2).toUpperCase()}
                      />
                    )}

                    {msg.content &&
                      msg.content !== '[Mídia UAZ]' &&
                      msg.content !== '[Mensagem de Voz]' &&
                      (translatorActive && !isNote && !['audio', 'video', 'image', 'document'].includes(msg.message_type) ? (
                        <BilingualMessage msg={msg} translationActive={translatorActive} myLang={myLang} />
                      ) : (
                        <p className="text-[14.5px] leading-relaxed break-words whitespace-pre-wrap px-0.5">{msg.content}</p>
                      ))}

                    <div
                      className={`flex justify-end gap-1 mt-0.5 opacity-60 group-hover:opacity-100 transition-opacity ${
                        isOutbound
                          ? isNote
                            ? 'text-amber-700'
                            : 'text-chat-outbound-fg opacity-80'
                          : 'text-chat-inbound-fg opacity-60'
                      }`}
                    >
                      <span className="text-[10px] font-medium">
                        {time} {isNote && '• 🔒 Nota Interna'}
                      </span>
                      {isOutbound && !isNote && (
                        msg.status === 'error' ? (
                          <span className="text-[10px] text-red-400">{t('chatArea', 'error')}</span>
                        ) : msg.status === 'read' ? (
                          <CheckCheck className="w-4 h-4 text-sky-500" />
                        ) : msg.status === 'delivered' ? (
                          <CheckCheck className="w-4 h-4" />
                        ) : msg.status === 'sending' ? (
                          <Clock className="w-3.5 h-3.5" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* CRM-Style Footer Composer (Full Width, Compact Border) */}
      <div className="px-2 py-1.5 bg-chat-surface-bg/95 backdrop-blur-xl border-t border-chat-inbound-border sticky bottom-0 transition-colors duration-300 relative z-40">
        {/* Quick Replies Popup (Atalho "/" estilo CRM IPTV) */}
        {showQuickReplies && (
          <div className="absolute bottom-full left-4 mb-2 w-96 bg-white dark:bg-slate-900 shadow-2xl rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all pb-1 max-h-96 flex flex-col z-50">
            <div className="p-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950 sticky top-0 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                    Mensagens Rápidas ({filteredReplies.length})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowInlineNewReply(!showInlineNewReply)}
                    className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold transition-colors cursor-pointer"
                  >
                    {showInlineNewReply ? 'Cancelar' : '+ Nova Frase'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuickReplies(false)
                      setShowInlineNewReply(false)
                    }}
                    className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {!currentShortcutStr && !showInlineNewReply && (
                <input
                  type="text"
                  value={quickReplySearch}
                  onChange={(e) => {
                    setQuickReplySearch(e.target.value)
                    setSelectedQuickReplyIdx(0)
                  }}
                  placeholder="Buscar frase por título, atalho ou texto..."
                  className="w-full px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:border-emerald-500"
                />
              )}
            </div>

            {showInlineNewReply ? (
              <form onSubmit={handleSaveInlineQuickReply} className="p-3 space-y-2 bg-emerald-50/40 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                <input
                  type="text"
                  required
                  value={newReplyTitle}
                  onChange={(e) => setNewReplyTitle(e.target.value)}
                  placeholder="Título (ex: Solicitação de documento)"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
                <input
                  type="text"
                  value={newReplyShortcut}
                  onChange={(e) => setNewReplyShortcut(e.target.value)}
                  placeholder="Atalho opcional (ex: /documento)"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
                <textarea
                  rows={3}
                  required
                  value={newReplyContent}
                  onChange={(e) => setNewReplyContent(e.target.value)}
                  placeholder="Texto da mensagem rápida..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 resize-none"
                />
                <button
                  type="submit"
                  disabled={savingInlineReply}
                  className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {savingInlineReply ? 'Salvando...' : 'Salvar Mensagem Rápida'}
                </button>
              </form>
            ) : (
              <div className="p-1.5 overflow-y-auto max-h-64 space-y-1">
                {filteredReplies.length === 0 ? (
                  <div className="p-4 text-xs text-center text-slate-400 space-y-2">
                    <p>{t('quickReplies', 'noShortcutFound') || 'Nenhuma frase encontrada.'}</p>
                    <button
                      type="button"
                      onClick={() => setShowInlineNewReply(true)}
                      className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-xs border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                    >
                      + Cadastrar primeira frase rápida
                    </button>
                  </div>
                ) : (
                  filteredReplies.map((reply, rIdx) => {
                    const isHighlighted = rIdx === selectedQuickReplyIdx
                    return (
                      <button
                        key={reply.id}
                        type="button"
                        onMouseEnter={() => setSelectedQuickReplyIdx(rIdx)}
                        onClick={() => handleSelectQuickReply(reply.content)}
                        className={`w-full text-left p-2.5 rounded-xl transition-colors flex flex-col gap-1 border cursor-pointer ${
                          isHighlighted
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 truncate">
                            {reply.title}
                          </span>
                          {reply.shortcut && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800 rounded shrink-0">
                              {reply.shortcut}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-snug">
                          {reply.content}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* Emoji Picker Popup */}
        {showEmoji && (
          <div className="absolute bottom-full left-4 mb-2 shadow-2xl rounded-2xl overflow-hidden border border-slate-200 z-50">
            <EmojiPicker onEmojiClick={onEmojiClick} theme={Theme.AUTO} searchPlaceholder="Buscar emoji..." />
          </div>
        )}

        {/* Attachment Options Popup */}
        {showAttach && (
          <div className="absolute bottom-full left-20 mb-2 w-56 bg-white shadow-2xl rounded-2xl border border-slate-200 overflow-hidden p-1.5 animate-in fade-in slide-in-from-bottom-2 z-50">
            <button
              onClick={() => photoInputRef.current?.click()}
              className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors text-slate-700"
            >
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div className="text-left">
                <span className="block text-sm font-semibold">{t('chatArea', 'photos')}</span>
                <span className="block text-xs text-slate-500">{t('chatArea', 'maxImageLimit')}</span>
              </div>
            </button>
            <button
              onClick={() => docInputRef.current?.click()}
              className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors text-slate-700 mt-1"
            >
              <div className="w-10 h-10 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="text-left">
                <span className="block text-sm font-semibold">{t('chatArea', 'documents')}</span>
                <span className="block text-xs text-slate-500">{t('chatArea', 'maxDocLimit')}</span>
              </div>
            </button>
          </div>
        )}

        {/* File Inputs (Hidden) */}
        <input type="file" ref={photoInputRef} className="hidden" accept="image/*,video/*" onChange={(e) => handleFileUpload(e, 'image')} />
        <input type="file" ref={docInputRef} className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={(e) => handleFileUpload(e, 'document')} />

        <div className="w-full flex flex-col gap-1 relative">
          {isUploading && (
            <div className="absolute -top-10 left-0 bg-emerald-50 text-emerald-700 text-xs px-4 py-2 font-bold rounded-full border border-emerald-200 flex items-center gap-2 animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t('chatArea', 'uploading')}
            </div>
          )}

          {replyingTo && (
            <div className="flex flex-col bg-slate-50 border-l-4 border-emerald-500 rounded-lg p-2 mx-1 text-sm relative shadow-sm">
              <button onClick={() => setReplyingTo(null)} className="absolute top-1.5 right-2 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
              <span className="font-bold text-emerald-600 text-xs mb-0.5">
                {replyingTo.direction === 'outbound' ? replyingTo.sender_name || 'Você' : context?.conversation?.contact_name || 'Trabalhador'}
              </span>
              <span className="text-slate-500 text-xs truncate max-w-[85%]">{replyingTo.content || 'Mídia'}</span>
            </div>
          )}

          {attachment && (
            <div className="relative mx-1 mb-1 p-2 bg-slate-100/50 rounded-xl border border-slate-200 w-max max-w-[300px] shadow-sm">
              <button
                onClick={() => setAttachment(null)}
                className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-md border hover:bg-red-50 text-slate-500 hover:text-red-500 transition-colors z-10"
              >
                <X className="w-4 h-4" />
              </button>
              {attachment.type === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={attachment.previewUrl} className="max-h-28 object-contain rounded-lg" alt="Preview" />
              ) : (
                <div className="flex items-center gap-3 p-2.5 bg-white rounded-lg border border-slate-200">
                  <FileText className="w-5 h-5 text-emerald-500" />
                  <span className="text-xs font-medium text-slate-700 max-w-[150px] truncate">{attachment.file.name}</span>
                </div>
              )}
            </div>
          )}

          {/* Main Input Container (Full Width, Compact) */}
          <div
            className={`relative flex flex-col border rounded-xl shadow-xs transition-all duration-300 overflow-hidden ${
              isPrivateNote
                ? 'bg-amber-50/60 border-amber-300'
                : translatorActive && activeLangTheme
                ? activeLangTheme.containerClass
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
          >
            {/* Top Bar: Responder | Mensagem Privada | Instruir IA + Barra de Bandeiras Circulares */}
            <div
              className={`flex items-center justify-between px-2 py-1 border-b transition-colors duration-300 ${
                isPrivateNote
                  ? 'border-amber-200 bg-amber-100/40'
                  : translatorActive && activeLangTheme
                  ? activeLangTheme.topTabsClass
                  : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50'
              } overflow-x-auto gap-2`}
            >
              <div className="flex items-center gap-1 shrink-0 relative">
                <button
                  type="button"
                  onClick={() => setActiveTab('reply')}
                  className={`px-2.5 py-1 text-[12px] rounded-[7px] transition-colors whitespace-nowrap cursor-pointer ${
                    !isPrivateNote
                      ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-2xs font-bold'
                      : 'text-slate-500 font-medium hover:text-slate-800 hover:bg-black/5'
                  }`}
                >
                  Responder
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('note')}
                  className={`px-2.5 py-1 text-[12px] rounded-[7px] transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    isPrivateNote
                      ? 'bg-amber-500 text-white shadow-2xs font-bold'
                      : 'text-slate-500 font-medium hover:text-slate-800 hover:bg-black/5'
                  }`}
                >
                  <Lock className="w-3 h-3" />
                  <span>Mensagem Privada</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAiMenu(!showAiMenu)}
                  className="px-2.5 py-1 text-[12px] rounded-[7px] transition-colors flex items-center gap-1.5 whitespace-nowrap text-purple-600 dark:text-purple-400 font-bold hover:bg-purple-50 dark:hover:bg-purple-950/40 cursor-pointer"
                >
                  <Bot className="w-3.5 h-3.5" />
                  <span>Instruir IA</span>
                </button>

                {showAiMenu && (
                  <div className="absolute top-full left-0 mt-1.5 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-2 z-50">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                      Templates Operacionais MCS
                    </p>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          handleAiQuickDraft(
                            'Hola! Para avanzar con tu alta y contrato en la obra, por favor envíanos foto de tu DNI/NIE, número de Seguridad Social y certificado bancario (IBAN).'
                          )
                        }
                        className="text-left text-xs p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-slate-700 dark:text-slate-200"
                      >
                        📄 Solicitar Documentação de Contratação (ES)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAiQuickDraft(
                            'Hola! Te confirmamos los datos de incorporación en la obra y ubicación del alojamiento. Confírmanos por favor tu talla de EPI y calzado de seguridad.'
                          )
                        }
                        className="text-left text-xs p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-slate-700 dark:text-slate-200"
                      >
                        🦺 Confirmar Incorporação, Alojamento e EPI (ES)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAiQuickDraft(
                            'Hola! Te recordamos que según contrato el preaviso de baja voluntaria es de 15 días. ¿Confirmas que cumplirás los 15 días de preaviso?'
                          )
                        }
                        className="text-left text-xs p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-slate-700 dark:text-slate-200"
                      >
                        🚪 Confirmar Regra de 15 Dias (Aviso Prévio)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAiQuickDraft(
                            'Hola! Por favor envíanos el parte de horas firmado de esta semana para procesarlo en el cierre de facturación y nómina.'
                          )
                        }
                        className="text-left text-xs p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 font-medium text-slate-700 dark:text-slate-200"
                      >
                        ⏱️ Solicitar Parte de Horas Semanal (ES)
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Seletores Rápidos de Idioma e Tradutor com Bandeiras Circulares (Padrão CRM) */}
              {!isPrivateNote && (
                <div className="flex items-center gap-1 ml-auto shrink-0 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => updateTranslator({ active: !translatorActive })}
                    className={`h-7 px-2.5 text-[11px] font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-2xs shrink-0 cursor-pointer ${
                      translatorActive
                        ? 'bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-blue-500/20'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                    }`}
                    title="Ligar/Desligar Tradutor (Atalho: Alt+Shift+T)"
                  >
                    <Globe className="w-3.5 h-3.5 shrink-0" />
                    <span className="whitespace-nowrap">{translatorActive ? 'Tradutor ON' : 'Tradutor OFF'}</span>
                  </button>

                  {Object.entries(TARGET_LANG_MAP).map(([key, item]) => {
                    const isSelected = translatorActive && targetLang === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => updateTranslator({ active: true, targetLang: key })}
                        className={`h-7 px-2 rounded-lg transition-all flex items-center gap-1.5 border shadow-2xs shrink-0 select-none cursor-pointer ${
                          isSelected
                            ? item.activeBtnClass
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 hover:border-slate-300'
                        }`}
                        title={`Traduzir para ${item.nativeName} (Atalho: Alt+Shift+${item.shortcut})`}
                      >
                        <div className="shrink-0 drop-shadow-2xs">
                          {renderFlagIcon(key, "w-4 h-4")}
                        </div>
                        <div className="flex flex-col text-left leading-none justify-center">
                          <span
                            className={`text-[10px] font-bold tracking-tight leading-none ${
                              isSelected ? 'text-white' : 'text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {item.short}
                          </span>
                          <span
                            className={`text-[8px] font-medium leading-none mt-0.5 whitespace-nowrap ${
                              isSelected ? 'text-white/90' : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {item.nativeName}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Banner de Tradução Ativa em 1 Única Linha */}
            {translatorActive && !isPrivateNote && (
              <div
                className={`${activeLangTheme.bannerClass} ${activeLangTheme.bannerBorder} border-b px-3 py-1 flex items-center justify-between gap-3 text-[11px] transition-colors duration-300 whitespace-nowrap overflow-x-auto`}
              >
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0 animate-pulse"></span>
                  <span className="font-medium opacity-90">Traduzindo envio p/:</span>
                  <span className="inline-flex items-center gap-1 font-bold tracking-wide underline underline-offset-2">
                    {renderFlagIcon(targetLang, "w-3.5 h-3.5")}
                    <span>{activeLangTheme.nativeName}</span>
                  </span>
                  <span className="opacity-50 mx-0.5">•</span>
                  <span className="text-[10.5px] opacity-85">Leitura:</span>
                  <select
                    value={myLang}
                    onChange={(e) => updateTranslator({ myLang: e.target.value })}
                    className="text-[10.5px] font-bold bg-white/80 dark:bg-black/30 rounded px-1.5 py-0.2 border border-black/10 outline-none cursor-pointer"
                  >
                    <option value="Portuguese">🇧🇷 Português</option>
                    <option value="Spanish">🇪🇸 Español</option>
                    <option value="English">🇺🇸 English</option>
                    <option value="Italian">🇮🇹 Italiano</option>
                    <option value="French">🇫🇷 Français</option>
                    <option value="German">🇩🇪 Deutsch</option>
                  </select>
                </div>
                <span className="text-[10px] opacity-75 font-mono shrink-0">
                  Alt+Shift+1 (ES) | Alt+Shift+2 (EN) | Alt+Shift+3 (PT) | Alt+Shift+4 (IT) | Alt+Shift+5 (FR) | Alt+Shift+6 (DE) | Alt+Shift+T (OFF)
                </span>
              </div>
            )}

            {/* Textarea Input */}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={(e) => {
                if (showQuickReplies && !showInlineNewReply) {
                  if (e.key === 'ArrowDown' && filteredReplies.length > 0) {
                    e.preventDefault()
                    setSelectedQuickReplyIdx((prev) => (prev + 1) % filteredReplies.length)
                    return
                  }
                  if (e.key === 'ArrowUp' && filteredReplies.length > 0) {
                    e.preventDefault()
                    setSelectedQuickReplyIdx((prev) => (prev - 1 + filteredReplies.length) % filteredReplies.length)
                    return
                  }
                  if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && !e.ctrlKey && !e.metaKey && filteredReplies.length > 0) {
                    e.preventDefault()
                    const chosen = filteredReplies[selectedQuickReplyIdx] || filteredReplies[0]
                    if (chosen) {
                      handleSelectQuickReply(chosen.content)
                    }
                    return
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setShowQuickReplies(false)
                    return
                  }
                }

                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (translatorActive && !isPrivateNote && text.trim() && !attachment) {
                    handleTranslateAndSend()
                    return
                  }
                  if (text.trim() || attachment) {
                    handleSend()
                  }
                }
              }}
              onPaste={handlePaste}
              className={`w-full bg-transparent px-3 py-1.5 max-h-28 min-h-[40px] resize-none focus:outline-none text-[14px] font-medium ${
                isPrivateNote
                  ? 'placeholder:text-amber-700/60 text-amber-950'
                  : 'text-slate-800 dark:text-slate-100 placeholder-slate-400'
              }`}
              placeholder={
                isPrivateNote
                  ? '🔒 Escreva uma nota privada visível apenas para a equipe interna MCS...'
                  : translatorActive
                  ? `Digite "/" para Mensagens Rápidas ou escreva em seu idioma e clique em "Traduzir p/ ${getTargetLangDisplay(targetLang)}" (Ctrl+Enter)...`
                  : `${t('chatArea', 'typeMessage')} (Digite "/" para Mensagens Rápidas)`
              }
              rows={1}
            />

            {/* Bottom Toolbar */}
            <div className="flex items-center justify-between px-2.5 pb-1.5 pt-0.5">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    const next = !showQuickReplies
                    if (next) fetchQuickReplies()
                    setShowQuickReplies(next)
                    setShowInlineNewReply(false)
                  }}
                  className={`p-1.5 hover:bg-black/5 rounded-lg transition-colors shrink-0 cursor-pointer ${
                    showQuickReplies ? 'text-emerald-600 bg-emerald-50' : 'text-slate-500 hover:text-emerald-600'
                  }`}
                  title="Mensagens Rápidas (Atalho: digite / no chat)"
                >
                  <Zap className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowEmoji(!showEmoji)}
                  className={`p-1.5 hover:bg-black/5 rounded-lg transition-colors shrink-0 cursor-pointer ${
                    showEmoji ? 'text-emerald-600 bg-emerald-50' : 'text-slate-500 hover:text-emerald-600'
                  }`}
                  title={t('chatArea', 'emoji')}
                >
                  <Smile className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowAttach(!showAttach)}
                  className={`p-1.5 hover:bg-black/5 rounded-lg transition-colors shrink-0 cursor-pointer ${
                    showAttach ? 'text-emerald-600 bg-emerald-50' : 'text-slate-500 hover:text-emerald-600'
                  }`}
                  title={t('chatArea', 'attach')}
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <div className="flex items-center justify-center -ml-0.5">
                  <AudioRecorder onSend={handleSendAudio} disabled={isSending || isUploading} />
                </div>
                <span className="hidden md:inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 ml-2">
                  <span>
                    Respondendo como <strong className="text-slate-600 dark:text-slate-300">{currentUserName}</strong> ({resolvedSenderDept})
                  </span>
                  {activeChannelCompany && !isPrivateNote && (
                    <span
                      className={`px-2 py-0.5 rounded-md font-extrabold text-[10px] border ${
                        isChannelMismatch
                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                      }`}
                      title={`Esta mensagem será disparada pelo WhatsApp da ${activeChannelCompany}${conversation?.channel?.phone_number ? ` (+${conversation.channel.phone_number})` : ''}`}
                    >
                      {isChannelMismatch ? '⚠️ ' : '📱 '}
                      Canal de Envio: {activeChannelCompany}
                      {conversation?.channel?.phone_number ? ` (+${conversation.channel.phone_number.slice(-4)})` : ''}
                    </span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {translatorActive && !isPrivateNote && (
                  <button
                    type="button"
                    onClick={handleTranslateAndSend}
                    disabled={isSending || text.trim() === '' || isUploading || isTranslatingOutbound}
                    className={`${activeLangTheme.buttonClass} font-bold shadow-xs h-7 text-[12px] px-2.5 rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer`}
                    title="Traduzir e Enviar (Atalho: Ctrl+Enter)"
                  >
                    {isTranslatingOutbound ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Traduzindo...</span>
                      </>
                    ) : (
                      <>
                        <Languages className="w-3.5 h-3.5" />
                        <span>Traduzir p/ {getTargetLangDisplay(targetLang)}</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isSending || (text.trim() === '' && !attachment) || isUploading || isTranslatingOutbound}
                  className={`h-7 px-3 text-white shadow-xs rounded-lg transition-all shrink-0 disabled:opacity-40 flex items-center gap-1.5 text-[12px] font-bold cursor-pointer ${
                    isPrivateNote ? 'bg-amber-500 hover:bg-amber-600' : 'bg-[#00A884] hover:bg-[#008f6f]'
                  }`}
                  title={isPrivateNote ? 'Salvar Nota Privada' : 'Enviar direto sem traduzir (Atalho: Enter)'}
                >
                  <span>{isPrivateNote ? 'Salvar Nota' : 'Enviar'}</span>
                  <Send className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
