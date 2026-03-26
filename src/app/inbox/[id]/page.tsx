import ChatArea from '@/modules/inbox/components/chat-area'
import ChatContextPanel from '@/modules/inbox/components/chat-context-panel'

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <div className="flex-1 flex w-full h-full min-w-0">
      <div className="flex-1 flex flex-col min-w-0 border-r border-slate-200 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] z-10">
        <ChatArea conversationId={id} />
      </div>
      <ChatContextPanel conversationId={id} />
    </div>
  )
}
