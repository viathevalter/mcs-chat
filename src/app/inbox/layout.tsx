"use client"
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import InboxSidebar from '@/modules/inbox/components/inbox-sidebar'
import { GlobalSidebar } from '@/components/layout/global-sidebar'

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ''

  // Ocultar a coluna de conversas (395px) nas telas de página inteira (Campanhas, Admin, Captain AI, Agenda)
  const isFullWidthModule =
    pathname.startsWith('/inbox/automations') ||
    pathname.startsWith('/inbox/admin') ||
    pathname.startsWith('/inbox/captain') ||
    pathname.startsWith('/inbox/agenda')

  // Worker silencioso para processar envios espaçados de campanhas ativas em background mesmo navegando no Inbox
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetch('/api/chat/campaign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'process_next', maxItems: 1 }),
        }).catch(() => {})
      }
    }, 8000)

    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-900 overflow-hidden font-sans text-slate-900 dark:text-slate-100">
      <GlobalSidebar />
      {!isFullWidthModule && <InboxSidebar />}
      <main className="flex-1 flex min-w-0 h-full overflow-hidden">
        {children}
      </main>
    </div>
  )
}
