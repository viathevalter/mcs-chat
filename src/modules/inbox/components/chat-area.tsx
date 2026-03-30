"use client"
import { useState, useRef, useEffect } from 'react'
import { Send, Paperclip, MoreVertical, Phone, Clock, CheckCircle2, Check, CheckCheck, PanelRightClose, PanelRightOpen, LockOpen, LockKeyhole, Smile, Zap } from 'lucide-react'
import { useChat } from '../hooks/use-chat'
import { useConversationContext } from '../hooks/use-context'
import { format, isToday, isYesterday, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { AudioRecorder } from './audio-recorder'
import { CustomAudioPlayer } from './custom-audio-player'
import { supabase } from '@/lib/supabase/client'

interface ChatAreaProps {
  conversationId: string
  togglePanel?: () => void
  isPanelOpen?: boolean
}

export default function ChatArea({ conversationId, togglePanel, isPanelOpen }: ChatAreaProps) {
  const { messages, loading, sendMessage } = useChat(conversationId)
  const { context } = useConversationContext(conversationId)
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isAssigning, setIsAssigning] = useState(false)
  const [activeTab, setActiveTab] = useState<'reply' | 'note'>('reply')
  const bottomRef = useRef<HTMLDivElement>(null)
  
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!text.trim() || isSending) return
    setIsSending(true)
    try {
      await sendMessage(text, activeTab === 'note' ? 'internal_note' : 'text')
      setText('')
    } finally {
      setIsSending(false)
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

  const handleAssign = async () => {
    if (!currentUserId || isAssigning) return
    setIsAssigning(true)
    try {
      await supabase.from('chat_conversations').update({ assigned_to: currentUserId, status: 'open' }).eq('id', conversationId)
    } finally {
      setIsAssigning(false)
    }
  }

  const handleClose = async () => {
    if (isAssigning) return
    setIsAssigning(true)
    try {
      await supabase.from('chat_conversations').update({ status: 'closed' }).eq('id', conversationId)
    } finally {
      setIsAssigning(false)
    }
  }

  const conversation = context?.conversation
  const isMine = conversation?.assigned_to === currentUserId
  const isClosed = conversation?.status === 'closed'

  return (
    <div className="flex flex-col h-full bg-slate-50/50 relative">
      <div className="h-20 flex-shrink-0 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-6 flex items-center justify-between shadow-[0_4px_24px_-12px_rgba(0,0,0,0.05)] z-20 sticky top-0">
        <div className="flex items-center gap-4">
          <div className="relative">
             <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-indigo-200 rotate-3 hover:rotate-0 transition-all duration-300">
               RH
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
               Ticket Fechado
            </span>
          ) : isMine ? (
            <button onClick={handleClose} disabled={isAssigning} className="px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-2">
               <CheckCircle2 className="w-3.5 h-3.5" />
               Encerrar Atendimento
            </button>
          ) : (
            <button onClick={handleAssign} disabled={isAssigning} className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-2">
               <LockOpen className="w-3.5 h-3.5" />
               Assumir Atendimento
            </button>
          )}

          <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all" title="Resumir com IA">
             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
          </button>
          
          {togglePanel && (
            <button 
              onClick={togglePanel}
              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all border border-transparent hover:border-indigo-100 flex items-center justify-center shrink-0" 
              title={isPanelOpen ? "Esconder detalhes" : "Mostrar detalhes"}
            >
               {isPanelOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
            </button>
          )}

          <div className="w-px h-6 bg-slate-200 mx-1"></div>
          <button className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading && <p className="text-center text-slate-400 text-sm mt-10">Carregando mensagens...</p>}
        {messages.length === 0 && !loading && (
          <div className="text-center text-slate-400 text-sm mt-10">Nenhuma mensagem neste chat ainda.</div>
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
            <div key={msg.id} className="flex flex-col gap-4">
              {showDateSeparator && (
                <div className="flex justify-center my-4">
                  <span className="px-4 py-1.5 bg-slate-200/60 text-slate-500 font-bold text-[10px] tracking-widest rounded-full">{dateLabel}</span>
                </div>
              )}
              <div className={`flex ${isOutbound ? 'justify-end flex-row-reverse' : 'justify-start'} group items-end gap-2 max-w-[85%] ${isOutbound ? 'ml-auto' : ''}`}>
              <div className={`w-8 h-8 rounded-full shrink-0 mb-1 flex items-center justify-center text-[10px] font-bold border border-white ${isOutbound ? (isNote ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600') : 'bg-slate-200 text-slate-500'}`}>
                {isOutbound ? (isNote ? 'RH' : 'RH') : (msg.sender_name?.substring(0, 2).toUpperCase() || 'TR')}
              </div>
              <div className={`px-3 py-2 shadow-sm ${isOutbound ? (isNote ? 'bg-amber-100 text-amber-900 border border-amber-200 rounded-3xl rounded-br-sm shadow-amber-200/50' : 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-3xl rounded-br-sm shadow-indigo-200/50') : 'bg-white border border-slate-200/80 rounded-3xl rounded-bl-sm text-slate-700'}`}>
                
                {msg.media_url && msg.message_type !== 'audio' && (
                  <div className="mb-1 max-w-sm rounded-2xl overflow-hidden mt-1 mx-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={msg.media_url} alt="Media" className="max-w-full h-auto rounded-lg" />
                  </div>
                )}
                
                {msg.media_url && msg.message_type === 'audio' && (
                  <CustomAudioPlayer 
                     src={msg.media_url} 
                     isOutbound={isOutbound && !isNote} 
                     senderInitials={isOutbound ? 'RH' : (msg.sender_name?.substring(0, 2).toUpperCase() || 'TR')}
                  />
                )}

                {msg.content && msg.content !== '[Mídia UAZ]' && (
                   <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap px-1">{msg.content}</p>
                )}
                <div className={`flex justify-end gap-1 mt-0.5 opacity-60 group-hover:opacity-100 transition-opacity ${isOutbound ? (isNote ? 'text-amber-700' : 'text-indigo-200') : 'text-slate-400'}`}>
                   <span className="text-[10px] font-medium">{time} {isNote && '• Nota Interna'}</span>
                   {isOutbound && !isNote && (
                      msg.status === 'error' ? <span className="text-[10px] text-red-400">Erro</span> :
                      msg.status === 'read' ? <CheckCheck className="w-4 h-4 text-blue-300" /> :
                      msg.status === 'delivered' ? <CheckCheck className="w-4 h-4" /> :
                      msg.status === 'sending' ? <Clock className="w-3.5 h-3.5" /> :
                      <Check className="w-4 h-4" />
                   )}
                </div>
              </div>
            </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 bg-slate-50/80 backdrop-blur-xl border-t border-slate-200/60 sticky bottom-0">
        <div className="max-w-5xl mx-auto flex flex-col gap-2">
           {/* Tabs Responder / Privada */}
           <div className="flex items-center gap-6 px-2 text-[13px] font-semibold text-slate-500">
              <button 
                onClick={() => setActiveTab('reply')}
                className={`${activeTab === 'reply' ? 'text-slate-800 border-indigo-600' : 'hover:text-slate-800 border-transparent'} border-b-2 pb-1 flex items-center gap-1.5 transition-colors`}
              >
                 Responder
              </button>
              <button 
                onClick={() => setActiveTab('note')}
                className={`${activeTab === 'note' ? 'text-amber-600 border-amber-600' : 'hover:text-amber-600 border-transparent'} border-b-2 pb-1 flex items-center gap-1.5 transition-colors`}
              >
                 <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                 Mensagem Privada
              </button>
           </div>
           
           {/* Input Box */}
           <div className={`flex items-end gap-2 p-1.5 rounded-2xl border shadow-sm focus-within:shadow-md transition-all ${activeTab === 'note' ? 'bg-amber-50/50 border-amber-200 focus-within:border-amber-400' : 'bg-white border-slate-200 focus-within:border-indigo-300'}`}>
             
             {/* Ações Rápidas (Esquerda) */}
             <div className="flex items-center gap-0.5 shrink-0 self-end mb-1">
               <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-colors shrink-0" title="Respostas Rápidas (/)">
                 <Zap className="w-5 h-5" />
               </button>
               <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-colors shrink-0" title="Emoji">
                 <Smile className="w-5 h-5" />
               </button>
               <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-colors shrink-0" title="Anexar">
                 <Paperclip className="w-5 h-5" />
               </button>
               <div className="flex items-center justify-center -ml-1">
                  <AudioRecorder onSend={handleSendAudio} disabled={isSending} />
               </div>
             </div>
             
             <div className="flex-1 flex overflow-hidden self-center border-l border-slate-200/60 pl-2 ml-1">
               <textarea 
                 value={text}
                 onChange={(e) => setText(e.target.value)}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' && !e.shiftKey) {
                     e.preventDefault()
                     if (text.trim()) {
                       handleSend()
                     }
                   }
                 }}
                 className="w-full bg-transparent px-2 py-3 max-h-32 min-h-[44px] resize-none focus:outline-none text-[15px] text-slate-700 placeholder-slate-400 font-medium"
                 placeholder={activeTab === 'note' ? "Nota interna..." : "Digite uma mensagem..."}
                 rows={1}
               />
             </div>
             
             {/* Botão Enviar (Direita) */}
             <div className="shrink-0 self-end mb-1 mr-1">
               <button 
                 onClick={handleSend} 
                 disabled={isSending || text.trim() === ''} 
                 className={`p-2.5 text-white shadow-sm hover:shadow-md rounded-xl transition-all shrink-0 disabled:opacity-40 disabled:scale-95 flex items-center justify-center ${activeTab === 'note' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-slate-700 hover:bg-slate-800'}`}
                 title={activeTab === 'note' ? 'Salvar' : 'Enviar'}
               >
                 <Send className="w-5 h-5 ml-0.5" />
               </button>
             </div>
           </div>
        </div>
      </div>
    </div>
  )
}
