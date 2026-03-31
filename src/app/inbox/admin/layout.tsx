"use client"
import { AdminNav } from './admin-nav'
import { useI18n } from '@/contexts/i18n-context'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { t } = useI18n()
  
  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto w-full">
      <div className="border-b border-slate-200 bg-white px-8 py-8 shadow-sm">
         <h1 className="text-3xl font-black tracking-tight text-slate-800">{t('admin', 'generalSettingsTitle')}</h1>
         <p className="text-sm font-medium text-slate-500 mt-2">{t('admin', 'generalSettingsDesc')}</p>
      </div>
      
      <div className="flex flex-1 overflow-visible p-8 max-w-[1400px] w-full gap-8">
        <aside className="w-[280px] flex-shrink-0">
          <AdminNav />
        </aside>
        <main className="flex-1 w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
          {children}
        </main>
      </div>
    </div>
  )
}
