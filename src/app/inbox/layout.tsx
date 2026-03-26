import InboxSidebar from '@/modules/inbox/components/inbox-sidebar'
import { GlobalSidebar } from '@/components/layout/global-sidebar'

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-900 overflow-hidden font-sans text-slate-900 dark:text-slate-100">
      <GlobalSidebar />
      <InboxSidebar />
      <main className="flex-1 flex min-w-0">
        {children}
      </main>
    </div>
  )
}
