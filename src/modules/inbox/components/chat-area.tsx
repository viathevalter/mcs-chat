"use client"
import { useState, useRef, useEffect } from 'react'
import { Send, Paperclip, MoreVertical, Phone, Clock, CheckCircle2, Check, CheckCheck, PanelRightClose, PanelRightOpen, LockOpen, LockKeyhole, Smile, Zap, Loader2, Image as ImageIcon, FileText, X, Languages, Star, Tag, CornerUpLeft, Trash2 } from 'lucide-react'
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
  const { messages, loading, sendMessage } = useChat(conversationId)
  const { context, setContext } = useConversationContext(conversationId)
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isAssigning, setIsAssigning] = useState(false)
  const [activeTab, setActiveTab] = useState<'reply' | 'note'>('reply')
  const bottomRef = useRef<HTMLDivElement>(null)
  
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  
  const [replyingTo, setReplyingTo] = useState<any | null>(null)
  const [translatorActive, setTranslatorActive] = useState(false)
  const [showTranslationMenu, setShowTranslationMenu] = useState(false)
  const [myLang, setMyLang] = useState("Português (Brasil)")
  const [targetLang, setTargetLang] = useState("English") // Config padrão
  const [isTranslatingOutbound, setIsTranslatingOutbound] = useState(false)

  // Tags States
  const [showTagsMenu, setShowTagsMenu] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#ef4444')

  const tagColors = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', 
    '#0ea5e9', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e'
  ]

  const handleAddTag = async () => {
    if (!newTagName.trim() || !context?.conversation) return;
    const newTag = { id: Date.now().toString(), name: newTagName.trim(), color: newTagColor };
    const currentTags = context.conversation.tags || [];
    
    if(currentTags.find((t:any) => t.name.toLowerCase() === newTag.name.toLowerCase())) {
        return; // Tag already exists
    }
    
    const updatedTags = [...currentTags, newTag];
    setContext((prev: any) => prev ? { ...prev, conversation: { ...prev.conversation, tags: updatedTags } } : null);

    const { error } = await supabase.from('chat_conversations').update({ tags: updatedTags }).eq('id', conversationId);
    if(error){
        setContext((prev: any) => prev ? { ...prev, conversation: { ...prev.conversation, tags: currentTags } } : null);
    } else {
        setNewTagName('');
    }
  };

  const handleRemoveTag = async (tagName: string) => {
    if (!context?.conversation) return;
    const currentTags = context.conversation.tags || [];
    const updatedTags = currentTags.filter((t:any) => t.name !== tagName);
    setContext((prev: any) => prev ? { ...prev, conversation: { ...prev.conversation, tags: updatedTags } } : null);

    const { error } = await supabase.from('chat_conversations').update({ tags: updatedTags }).eq('id', conversationId);
    if(error){
        setContext((prev: any) => prev ? { ...prev, conversation: { ...prev.conversation, tags: currentTags } } : null);
    }
  };

  

  // Novas states para Ferramentas
  const togglePin = async () => {
     if (!context?.conversation) return;
     const newStatus = !context.conversation.is_pinned;
     await supabase.from('chat_conversations').update({ is_pinned: newStatus }).eq('id', conversationId);
  }

  const [showEmoji, setShowEmoji] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [attachment, setAttachment] = useState<{file: File, type: 'image' | 'document', previewUrl?: string} | null>(null)

  const docInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null))
    fetchQuickReplies()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchQuickReplies = async () => {
    const { data } = await supabase.from('chat_quick_replies').select('*').order('created_at', { ascending: false })
    if (data) setQuickReplies(data)
  }

  const handleTranslateAndSend = async () => {
    if (!text.trim() || isSending || isTranslatingOutbound) return
    setIsTranslatingOutbound(true)
    const rawContent = text
    setText('')
    try {
       const res = await translateOutboundMessage(rawContent, targetLang)
       if (res.success && res.translation) {
           await sendMessage(res.translation, activeTab === 'note' ? 'internal_note' : 'text', { quoted: replyingTo?.id })
       } else {
           setText(rawContent)
       }
    } finally {
       setIsTranslatingOutbound(false)
       setReplyingTo(null)
    }
  }

  const handleDeleteMessage = async (msg: any) => {
    if (!confirm(t('chatArea', 'confirmDelete') || 'Deseja realmente apagar esta mensagem para todos?')) return;
    
    // Optimistic UI
    const originalContent = msg.content;
    const originalStatus = msg.status;
    
    try {
        // Usa a Rota Nativa do Kotrik (que busca url e api_token do chat_channels)
        const res = await fetch('/api/chat/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messageId: msg.id,
                externalId: msg.external_id || msg.id
            })
        });
        
        // Se a API externa falhar, garantiremos que, usando o fallback, vamos no mínimo remover da UI
        if (!res.ok) {
           console.warn('API de delete externa falhou. Removendo apenas local.');
           await supabase.from('chat_messages').update({ content: '🚫 Mensagem apagada', status: 'deleted' }).eq('id', msg.id);
        }
    } catch(err) {
        console.error('Falha ao apagar msg', err);
    }
  }

  const handleSend = async () => {
    if ((!text.trim() && !attachment) || isSending || isUploading) return
    setIsSending(true)
    
    try {
        if (attachment) {
            setIsUploading(true)
            const fileExt = attachment.file.name.split('.').pop() || 'png';
            const fileName = `chat_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            
            const { error: uploadError } = await supabase.storage.from('chat_media').upload(fileName, attachment.file);
            if (uploadError) throw uploadError;
            
            const { data: { publicUrl } } = supabase.storage.from('chat_media').getPublicUrl(fileName);
            
            await sendMessage(text.trim() || '', attachment.type, { mediaUrl: publicUrl, fileName: attachment.file.name, quoted: replyingTo?.id })
            
            setAttachment(null)
            setText('')
            setReplyingTo(null)
            setShowQuickReplies(false)
            setShowEmoji(false)
            setIsUploading(false)
            return;
        }

        await sendMessage(text, activeTab === 'note' ? 'internal_note' : 'text', { quoted: replyingTo?.id })
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
      await sendMessage(base64Audio, 'audio')
    } finally {
      setIsSending(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'document') => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // Limites (16MB fotos/videos | 100MB Documentação)
    const maxSize = type === 'image' ? 16 * 1024 * 1024 : 100 * 1024 * 1024
    if (file.size > maxSize) {
      alert(type === 'image' ? t('chatArea', 'maxImageLimit') : t('chatArea', 'maxDocLimit'))
      return
    }

    setShowAttach(false)
    let previewUrl;
    if (type === 'image') {
       previewUrl = URL.createObjectURL(file);
    }
    setAttachment({ file, type, previewUrl });
    if (e.target) e.target.value = ''
  }

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            e.preventDefault();
            const file = items[i].getAsFile();
            if (!file) continue;
            
            const maxSize = 16 * 1024 * 1024;
            if (file.size > maxSize) {
              alert(t('chatArea', 'maxImageLimit'));
              return;
            }

            const previewUrl = URL.createObjectURL(file);
            setAttachment({ file, type: 'image', previewUrl });
            break; // Handle only the first image
        }
    }
  };

  const handleAssign = async () => {
    if (!currentUserId || isAssigning) return
    setIsAssigning(true)
    try {
      await supabase.from('chat_conversations').update({ assigned_to: currentUserId, status: 'open' }).eq('id', conversationId)
      router.refresh()
    } finally {
      setIsAssigning(false)
    }
  }

  const handleClose = async () => {
    if (isAssigning) return
    setIsAssigning(true)
    try {
      await supabase.from('chat_conversations').update({ status: 'closed', assigned_to: null }).eq('id', conversationId)
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
      // Remove o atalho digitado (ex: /bomdia) se houver
      const replaced = prev.replace(/\/[a-z0-9_-]*$/i, '')
      return replaced + content
    })
    setShowQuickReplies(false)
    textareaRef.current?.focus()
  }

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setText(val)
    
    // Trigger para mostrar quick replies
    const latestWordMatch = val.match(/(^|\s)(\/[a-z0-9_-]*)$/i)
    if (latestWordMatch) {
      setShowQuickReplies(true)
    } else if (showQuickReplies && !val.includes('/')) {
      setShowQuickReplies(false)
    }
  }

  const currentMatch = text.match(/(^|\s)(\/[a-z0-9_-]*)$/i)
  const currentShortcutStr = currentMatch ? currentMatch[2].toLowerCase() : ''
  const filteredReplies = currentShortcutStr 
    ? quickReplies.filter(r => r.shortcut && r.shortcut.toLowerCase().startsWith(currentShortcutStr))
    : quickReplies

  const conversation = context?.conversation
  const isMine = conversation?.assigned_to === currentUserId
  const isClosed = conversation?.status === 'closed'

  return (
    <div className="flex flex-col h-full bg-chat-area-bg relative transition-colors duration-300">
      <div className="h-20 flex-shrink-0 bg-chat-surface-bg/80 backdrop-blur-md border-b border-chat-inbound-border px-6 flex items-center justify-between shadow-[0_4px_24px_-12px_rgba(0,0,0,0.05)] z-20 sticky top-0 transition-colors duration-300">
        <div className="flex items-center gap-4">
          <div className="relative">
             <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-emerald-200 rotate-3 hover:rotate-0 transition-all duration-300 overflow-hidden">
               {context?.conversation?.contact_avatar_url ? (
                  <img src={context.conversation.contact_avatar_url} alt="Avatar" className="w-full h-full object-cover" />
               ) : (
                  (context?.worker?.nome || context?.conversation?.contact_name || 'RH').substring(0, 2).toUpperCase()
               )}
             </div>
             <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white"></div>
          </div>
          <div>
            <h2 className="font-bold text-slate-800 text-lg tracking-tight leading-tight">
              {context?.worker?.nome || context?.conversation?.contact_name || context?.conversation?.contact_phone || 'Painel de Atendimento'}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
               <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 tracking-wider uppercase border border-slate-200">WhatsApp</span>
               {context?.conversation?.contact_phone && (
                 <span className="text-xs font-medium text-slate-500">{context.conversation.contact_phone}</span>
               )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isClosed ? (
            <span className="px-4 py-2 bg-slate-100 text-slate-500 text-xs font-bold rounded-lg border border-slate-200 flex items-center gap-2">
               <LockKeyhole className="w-3.5 h-3.5" />
               {t('chatArea', 'closedTicket')}
            </span>
          ) : isMine ? (
            <button onClick={handleClose} disabled={isAssigning} className="px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-2">
               <CheckCircle2 className="w-3.5 h-3.5" />
               {t('chatArea', 'endChat')}
            </button>
          ) : (
            <button onClick={handleAssign} disabled={isAssigning} className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-2">
               <LockOpen className="w-3.5 h-3.5" />
               {t('chatArea', 'takeChat')}
            </button>
          )}

          
    {/* BOTOES TAG, FAVORITO E AUTO IA */}
    <div className="relative">
      <button onClick={() => setShowTagsMenu(!showTagsMenu)} className="px-3 py-1.5 ml-2 border rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hidden md:flex">
         <Tag className="w-3.5 h-3.5" /> Tags
      </button>
      
      {showTagsMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowTagsMenu(false)}></div>
          <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-slate-900 shadow-2xl rounded-xl border border-slate-200 dark:border-slate-800 p-4 z-50 animate-in fade-in zoom-in-95 origin-top-right">
            <div className="mb-4">
              <span className="font-bold text-slate-700 dark:text-slate-200 block text-sm mb-2 flex items-center gap-2">
                <Tag className="w-4 h-4" /> Etiquetas do Contato
              </span>
              
              <div className="flex flex-wrap gap-2 min-h-[30px] p-2 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-800">
                {(context?.conversation?.tags || []).length === 0 && <p className="text-xs text-slate-400 w-full italic">Nenhuma etiqueta atribuída.</p>}
                {(context?.conversation?.tags || []).map((tag:any, idx:number) => (
                  <span key={idx} className="px-2 py-1 rounded text-[11px] font-bold text-white flex items-center gap-1 shadow-sm" style={{ backgroundColor: tag.color }}>
                    {tag.name}
                    <button onClick={() => handleRemoveTag(tag.name)} className="hover:bg-black/20 rounded-full p-0.5 ml-1 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
            
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-2">Nova Etiqueta</span>
              <div className="flex gap-2 mb-3 w-full">
                <input 
                  type="text" 
                  placeholder="Ex: Lead Novo" 
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  className="flex-1 min-w-0 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                <button 
                  onClick={handleAddTag} 
                  disabled={!newTagName.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0"
                >
                  Add
                </button>
              </div>
              <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                {tagColors.map(color => (
                  <button 
                    key={color}
                    onClick={() => setNewTagColor(color)}
                    className="w-5 h-5 rounded-full transition-all flex items-center justify-center shrink-0"
                    style={{ 
                      backgroundColor: color, 
                      scale: newTagColor === color ? '1.2' : '1',
                      boxShadow: newTagColor === color ? `0 0 0 2px white, 0 0 0 3px ${color}` : 'none'
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
    
    <button onClick={togglePin} className={`px-3 py-1.5 ml-1 border rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${context?.conversation?.is_pinned ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 border-yellow-200 dark:border-yellow-900/50' : 'bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
       <Star className={`w-3.5 h-3.5 ${context?.conversation?.is_pinned ? 'fill-yellow-400' : ''}`} /> {t('chatArea', 'favorite') || 'Fixar'}
    </button>
    <div className="relative">
      <button onClick={() => setShowTranslationMenu(!showTranslationMenu)} className={`px-3 py-1.5 ml-1 border rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${translatorActive ? 'bg-orange-500 text-white border-orange-600 shadow-sm shadow-orange-200' : 'bg-white text-orange-500 border-orange-200 hover:bg-orange-50'}`}>
         <Languages className="w-3.5 h-3.5" /> Auto-A.I 
      </button>
      {showTranslationMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowTranslationMenu(false)}></div>
          <div className="absolute top-full right-0 mt-2 w-[290px] bg-white shadow-2xl rounded-xl border border-slate-200 p-4 z-50 animate-in fade-in zoom-in-95 origin-top-right">
            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-3">
              <div>
                <span className="font-bold text-slate-700 block text-[13px]">Auto Translation</span>
                <span className="text-[11px] text-slate-500">Tradução simultânea via OpenAI.</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer group">
                <input type="checkbox" className="sr-only peer" checked={translatorActive} onChange={() => setTranslatorActive(!translatorActive)} />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500 group-hover:after:scale-95"></div>
              </label>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Meu Idioma (Leitura)</label>
                <select 
                   value={myLang} 
                   onChange={e => setMyLang(e.target.value)} 
                   className="w-full text-sm border border-slate-200 rounded-lg p-2.5 text-slate-700 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 shadow-sm bg-white"
                >
                    <option value="Português (Brasil)">Português (Brasil)</option>
                    <option value="English">English</option>
                    <option value="Spanish">Español</option>
                    <option value="French">Français</option>
                    <option value="German">Deutsch</option>
                    <option value="Italian">Italiano</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Idioma do Cliente (Envio)</label>
                <select 
                   value={targetLang} 
                   onChange={e => setTargetLang(e.target.value)} 
                   className="w-full text-sm border border-slate-200 rounded-lg p-2.5 text-slate-700 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 shadow-sm bg-white"
                >
                    <option value="English">English</option>
                    <option value="Spanish">Español</option>
                    <option value="French">Français</option>
                    <option value="German">Deutsch</option>
                    <option value="Italian">Italiano</option>
                    <option value="Português (Brasil)">Português (Brasil)</option>
                </select>
              </div>
            </div>
            <div className="mt-4 p-2.5 bg-blue-50/80 border border-blue-100 text-blue-800 text-[11px] rounded-lg flex gap-2.5 items-start leading-relaxed shadow-sm">
               <span className="mt-0.5 text-lg">💡</span> <span>A IA detectará automaticamente o idioma que escreverem para você. Você só precisa dizer o idioma deles para que o botão de <strong>"Traduzir"</strong> mande corretamente.</span>
            </div>
          </div>
        </>
      )}
    </div>
  {togglePanel && (
            <button 
              onClick={togglePanel}
              className="hidden" 
              title={isPanelOpen ? t('chatArea', 'hideDetails') : t('chatArea', 'showDetails')}
            >
               {isPanelOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
            </button>
          )}

          <div className="w-px h-6 bg-slate-200 mx-1"></div>
          <button onClick={togglePanel} className={`p-2.5 rounded-xl transition-all ${isPanelOpen ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`} title="Detalhes do Contato">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6" onClick={() => {setShowEmoji(false); setShowAttach(false); setShowQuickReplies(false);}}>
        {loading && <p className="text-center text-slate-400 text-sm mt-10">{t('chatArea', 'loadingMessages')}</p>}
        {messages.length === 0 && !loading && (
          <div className="text-center text-slate-400 text-sm mt-10">{t('chatArea', 'noMessages')}</div>
        )}
        
        {messages.map((msg, index) => {
          const isOutbound = msg.direction === 'outbound' || msg.direction === 'internal'
          const isNote = msg.message_type === 'internal_note'
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
          
          return (
            <div key={msg.id} className={`mb-4 animate-in fade-in slide-in-from-bottom-2 ${isOutbound ? 'pr-2' : 'pl-2'}`}>
              {showDateSeparator && (
                <div className="flex justify-center my-4">
                  <span className="px-4 py-1.5 bg-slate-200/60 text-slate-500 font-bold text-[10px] tracking-widest rounded-full">{dateLabel}</span>
                </div>
              )}
              <div className={`flex ${isOutbound ? 'justify-end flex-row-reverse' : 'justify-start'} items-end gap-2 max-w-[85%] ${isOutbound ? 'ml-auto' : ''}`}>
                <div className={`w-8 h-8 rounded-full shrink-0 mb-1 flex items-center justify-center text-[10px] font-bold border border-white ${isOutbound ? (isNote ? 'bg-amber-100 text-amber-600' : 'bg-chat-icon-bg text-chat-icon-text') : 'bg-chat-icon-bg text-chat-icon-text opacity-80'}`} title={msg.sender_name || 'Desconhecido'}>
                  {isOutbound ? (msg.sender_name?.substring(0, 2).toUpperCase() || 'RH') : (msg.sender_name?.substring(0, 2).toUpperCase() || 'TR')}
                </div>
                
                <div className="relative group max-w-full flex items-center">
                  <div className={`absolute top-0 ${isOutbound ? 'right-full mr-2' : 'left-full ml-2'} opacity-0 group-hover:opacity-100 flex items-center transition-opacity z-10 whitespace-nowrap`}>
                    <button onClick={() => setReplyingTo(msg)} className="p-1.5 bg-white shadow-sm border border-slate-200 rounded-full text-slate-400 hover:text-emerald-600 transition-colors">
                        <CornerUpLeft className="w-3 h-3" />
                    </button>
                    {isOutbound && (
                        <button onClick={() => handleDeleteMessage(msg)} className="p-1.5 bg-white shadow-sm border border-slate-200 rounded-full text-slate-400 hover:text-red-500 transition-colors ml-1" title="Apagar Mensagem">
                            <Trash2 className="w-3 h-3" />
                        </button>
                    )}
                  </div>

                  <div className={`pointer-events-auto px-3 py-2 shadow-sm ${isOutbound ? (isNote ? 'bg-amber-100 text-amber-900 border border-amber-200 rounded-3xl rounded-br-sm shadow-amber-200/50' : 'bg-gradient-to-br from-chat-outbound-bg-start to-chat-outbound-bg-end text-chat-outbound-fg rounded-3xl rounded-br-sm shadow-chat-outbound-shadow backdrop-blur-sm') : 'bg-chat-inbound-bg border border-chat-inbound-border rounded-3xl rounded-bl-sm text-chat-inbound-fg backdrop-blur-sm'}`}>
                    
                    {(msg as any).quoted && (() => {
           const qMsg = messages.find((m: any) => m.id === (msg as any).quoted || m.external_id === (msg as any).quoted);
           return (
             <div className="w-full mb-1 p-1.5 bg-black/5 dark:bg-white/10 rounded border-l-4 border-emerald-500/60 text-xs cursor-pointer hover:bg-black/10 transition-colors">
                <span className="font-bold text-emerald-700 block mb-0.5">{qMsg ? (qMsg.direction === 'outbound' ? 'Você' : 'Contato') : 'Mensagem'}</span>
                <span className="text-slate-600 dark:text-slate-300 line-clamp-1 truncate">{qMsg?.content || '...'}</span>
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
                  <a href={msg.media_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 bg-white/20 rounded-xl mb-1 mt-1 mx-1 hover:bg-white/30 transition">
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
                     senderInitials={isOutbound ? 'RH' : (msg.sender_name?.substring(0, 2).toUpperCase() || 'TR')}
                  />
                )}

                {msg.content && msg.content !== '[Mídia UAZ]' && msg.content !== '[Mensagem de Voz]' && (
    translatorActive && !isNote && (!['audio', 'video', 'image', 'document'].includes(msg.message_type)) ? (
        <BilingualMessage msg={msg} translationActive={translatorActive} myLang={myLang} />
    ) : (
        <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap px-1">{msg.content}</p>
    )
)}
                <div className={`flex justify-end gap-1 mt-0.5 opacity-60 grouphover:opacity-100 transition-opacity ${isOutbound ? (isNote ? 'text-amber-700' : 'text-chat-outbound-fg opacity-80') : 'text-chat-inbound-fg opacity-60'}`}>
                   <span className="text-[10px] font-medium">{time} {isNote && t('chatArea', 'internalNoteTag')}</span>
                   {isOutbound && !isNote && (
                      msg.status === 'error' ? <span className="text-[10px] text-red-400">{t('chatArea', 'error')}</span> :
                      msg.status === 'read' ? <CheckCheck className="w-4 h-4 text-blue-300" /> :
                      msg.status === 'delivered' ? <CheckCheck className="w-4 h-4" /> :
                      msg.status === 'sending' ? <Clock className="w-3.5 h-3.5" /> :
                      <Check className="w-4 h-4" />
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

      <div className="p-4 bg-chat-surface-bg/80 backdrop-blur-xl border-t border-chat-inbound-border sticky bottom-0 transition-colors duration-300 relative z-40">
        
        {/* Quick Replies Popup */}
        {showQuickReplies && quickReplies.length > 0 && (
          <div className="absolute bottom-full left-4 mb-2 w-80 bg-white shadow-2xl rounded-2xl border border-slate-200 overflow-hidden transform transition-all pb-1 max-h-72 overflow-y-auto">
            <div className="p-3 border-b border-slate-100 bg-slate-50/80 sticky top-0 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{t('quickReplies', 'title')}</span>
              <button onClick={() => setShowQuickReplies(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-1">
              {filteredReplies.length === 0 && <div className="p-4 text-xs text-center text-slate-400">{t('quickReplies', 'noShortcutFound')}</div>}
              {filteredReplies.map((reply) => (
                <button
                  key={reply.id}
                  onClick={() => handleSelectQuickReply(reply.content)}
                  className="w-full text-left p-3 hover:bg-emerald-50 rounded-xl transition-colors flex flex-col gap-1 border border-transparent hover:border-emerald-100/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-emerald-800">{reply.title}</span>
                    {reply.shortcut && <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 font-semibold border border-slate-200 rounded">{reply.shortcut}</span>}
                  </div>
                  <span className="text-xs text-slate-500 truncate">{reply.content}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Emoji Picker Popup */}
        {showEmoji && (
          <div className="absolute bottom-full left-4 mb-2 shadow-2xl rounded-2xl overflow-hidden border border-slate-200">
            <EmojiPicker onEmojiClick={onEmojiClick} theme={Theme.AUTO} searchPlaceholder="Buscar emoji..." />
          </div>
        )}

        {/* Attachment Options Popup */}
        {showAttach && (
          <div className="absolute bottom-full left-20 mb-2 w-56 bg-white shadow-2xl rounded-2xl border border-slate-200 overflow-hidden p-1.5 animate-in fade-in slide-in-from-bottom-2">
             <button
                onClick={() => { photoInputRef.current?.click() }}
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
                onClick={() => { docInputRef.current?.click() }}
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

        <div className="max-w-5xl mx-auto flex flex-col gap-2 relative">
           {/* Uploading indicator */}
           {isUploading && (
             <div className="absolute -top-10 left-0 bg-emerald-50 text-emerald-700 text-xs px-4 py-2 font-bold rounded-full border border-emerald-200 flex items-center gap-2 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t('chatArea', 'uploading')}
             </div>
           )}

   {replyingTo && (
    <div className="flex flex-col bg-slate-50 border-l-4 border-emerald-500 rounded-lg p-2.5 mx-2 text-sm relative shadow-sm">
      <button onClick={() => setReplyingTo(null)} className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
      <span className="font-bold text-emerald-600 text-xs mb-0.5">{replyingTo.direction === 'outbound' ? 'Você' : (context?.conversation?.contact_name || 'Contato')}</span>
      <span className="text-slate-500 text-xs truncate max-w-[85%]">{replyingTo.content || 'Mídia'}</span>
    </div>
  )}

  {attachment && (
    <div className="relative mx-2 mb-1 p-2 bg-slate-100/50 rounded-xl border border-slate-200 w-max max-w-[300px] shadow-sm">
      <button onClick={() => setAttachment(null)} className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-md border hover:bg-red-50 text-slate-500 hover:text-red-500 transition-colors z-10"><X className="w-4 h-4" /></button>
      {attachment.type === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={attachment.previewUrl} className="max-h-32 object-contain rounded-lg" alt="Preview"/>
      ) : (
        <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200">
           <FileText className="w-6 h-6 text-emerald-500" />
           <span className="text-sm font-medium text-slate-700 max-w-[150px] truncate">{attachment.file.name}</span>
        </div>
      )}
    </div>
  )}
  {/* Tabs Responder / Privada */}
           <div className="flex items-center gap-6 px-2 text-[13px] font-semibold text-slate-500">
              <button 
                onClick={() => setActiveTab('reply')}
                className={`${activeTab === 'reply' ? 'text-slate-800 border-emerald-600' : 'hover:text-slate-800 border-transparent'} border-b-2 pb-1 flex items-center gap-1.5 transition-colors`}
              >
                 {t('chatArea', 'reply')}
              </button>
              <button 
                onClick={() => setActiveTab('note')}
                className={`${activeTab === 'note' ? 'text-amber-600 border-amber-600' : 'hover:text-amber-600 border-transparent'} border-b-2 pb-1 flex items-center gap-1.5 transition-colors`}
              >
                 <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                 {t('chatArea', 'privateNote')}
              </button>
           </div>
           
           {/* Input Box */}
           <div className={`flex items-end gap-2 p-1.5 rounded-2xl border shadow-sm focus-within:shadow-md transition-all ${activeTab === 'note' ? 'bg-amber-50/50 border-amber-200 focus-within:border-amber-400' : 'bg-chat-inbound-bg border-chat-inbound-border focus-within:border-chat-outbound-border'}`}>
             
             {/* Ações Rápidas (Esquerda) */}
             <div className="flex items-center gap-0.5 shrink-0 self-end mb-1">
               <button onClick={() => setShowQuickReplies(!showQuickReplies)} className={`p-2 hover:bg-slate-50 rounded-xl transition-colors shrink-0 ${showQuickReplies ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:text-emerald-600'}`} title={t('chatArea', 'quickReplies')}>
                 <Zap className="w-5 h-5" />
               </button>
               <button onClick={() => setShowEmoji(!showEmoji)} className={`p-2 hover:bg-slate-50 rounded-xl transition-colors shrink-0 ${showEmoji ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:text-emerald-600'}`} title={t('chatArea', 'emoji')}>
                 <Smile className="w-5 h-5" />
               </button>
               <button onClick={() => setShowAttach(!showAttach)} className={`p-2 hover:bg-slate-50 rounded-xl transition-colors shrink-0 ${showAttach ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:text-emerald-600'}`} title={t('chatArea', 'attach')}>
                 <Paperclip className="w-5 h-5" />
               </button>
               <div className="flex items-center justify-center -ml-1">
                  <AudioRecorder onSend={handleSendAudio} disabled={isSending || isUploading} />
               </div>
             </div>
             
             <div className="flex-1 flex overflow-hidden self-center border-l border-slate-200/60 pl-2 ml-1">
               <textarea 
                 ref={textareaRef}
                 value={text}
                 onChange={handleTextChange}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' && !e.shiftKey) {
                     e.preventDefault()
                     if (text.trim() || attachment) {
                       handleSend()
                     }
                   }
                 }}
                 onPaste={handlePaste}
                 className="w-full bg-transparent px-2 py-3 max-h-32 min-h-[44px] resize-none focus:outline-none text-[15px] text-slate-700 placeholder-slate-400 font-medium"
                 placeholder={activeTab === 'note' ? t('chatArea', 'internalNote') : t('chatArea', 'typeMessage')}
                 rows={1}
               />
             </div>
             
             {/* Botão Enviar (Direita) */}
             <div className="shrink-0 self-end mb-1 mr-1 flex flex-col sm:flex-row items-center gap-1.5">
               {translatorActive && activeTab !== 'note' && (
                 <button 
                   onClick={handleTranslateAndSend} 
                   disabled={isSending || text.trim() === '' || isUploading || isTranslatingOutbound} 
                   className={`px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-bold shadow-sm hover:shadow-md rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
                   title="Traduzir e Enviar"
                 >
                   {isTranslatingOutbound ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                   <span className="hidden sm:inline">Traduzir</span>
                 </button>
               )}
               <button 
                 onClick={handleSend} 
                 disabled={isSending || (text.trim() === '' && !attachment) || isUploading || isTranslatingOutbound} 
                 className={`px-4 py-2 text-white shadow-sm hover:shadow-md rounded-xl transition-all shrink-0 disabled:opacity-40 disabled:scale-95 flex items-center gap-2 text-[13px] font-bold ${activeTab === 'note' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
                 title={activeTab === 'note' ? t('chatArea', 'save') : t('chatArea', 'send')}
               >
                 <span className="hidden sm:inline">{activeTab === 'note' ? 'Salvar Nota' : 'Enviar'}</span>
                 <Send className="w-4 h-4" />
               </button>
             </div>
           </div>
        </div>
      </div>
    </div>
  )
}
