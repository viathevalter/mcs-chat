"use client"
import { useState } from 'react'
import ChatArea from './chat-area'
import ChatContextPanel from './chat-context-panel'

export default function ConversationView({ conversationId }: { conversationId: string }) {
  const [isPanelOpen, setIsPanelOpen] = useState(true)

  return (
    <div className="flex-1 flex w-full h-full min-w-0 transition-all duration-300">
      <div className="flex-1 flex flex-col min-w-0 border-r border-slate-200 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] z-10 transition-all duration-300">
        <ChatArea 
          conversationId={conversationId} 
          togglePanel={() => setIsPanelOpen(!isPanelOpen)} 
          isPanelOpen={isPanelOpen} 
        />
      </div>
      {isPanelOpen && <ChatContextPanel conversationId={conversationId} />}
    </div>
  )
}
