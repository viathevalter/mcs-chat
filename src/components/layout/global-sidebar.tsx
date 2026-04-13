"use client"
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { MessageCircle, Megaphone, Bot, Settings, ChevronLeft, ChevronRight, Moon, Sun, Globe, LogOut, User as UserIcon, Palette, Check } from 'lucide-react'
import { useI18n } from '@/contexts/i18n-context'
import { supabase } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'

export function GlobalSidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const { lang, setLang, t } = useI18n()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    setMounted(true)
    
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  const links = [
    { href: '/inbox', labelKey: 'inbox', icon: MessageCircle, exact: true },
    { href: '/inbox/automations', labelKey: 'campaigns', icon: Megaphone, exact: false },
    { href: '/inbox/captain', labelKey: 'captain', icon: Bot, exact: false },
    { href: '/inbox/admin', labelKey: 'admin', icon: Settings, exact: false },
  ] as const

  const toggleLanguage = () => {
    const langs = ['PT', 'EN', 'ES'] as const
    const next = langs[(langs.indexOf(lang) + 1) % langs.length]
    setLang(next)
  }

  const themesList = [
    { id: 'light', name: 'Classico (Claro)', color1: '#6366f1', color2: '#f8fafc' },
    { id: 'dark', name: 'Modo Escuro', color1: '#4f46e5', color2: '#0f172a' },
    { id: 'sunset', name: 'Sunset (Quente)', color1: '#ff758c', color2: '#ffede6' },
    { id: 'ocean', name: 'Ocean (Frio)', color1: '#0ea5e9', color2: '#e0f2fe' }
  ]


  return (
    <nav className={`flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 transition-all duration-300 ${collapsed ? 'w-20' : 'w-[240px]'} h-full shrink-0 relative z-50`}>
      {/* Logo Area */}
      <div className="h-20 flex items-center justify-center border-b border-slate-100 dark:border-slate-800 shrink-0">
         <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
           M
         </div>
         {!collapsed && <span className="ml-3 font-bold text-slate-800 dark:text-slate-100 text-lg tracking-tight shrink-0 whitespace-nowrap">MCS-Chat</span>}
      </div>

      {/* Collapse Button */}
      <button 
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-24 w-6 h-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center text-slate-500 hover:text-emerald-600 transition-colors shadow-sm z-50"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {/* Navigation Links */}
      <div className="flex-1 py-6 px-3 space-y-2 overflow-y-auto overflow-x-hidden scrollbar-hide">
        {links.map((link) => {
          const isActive = link.exact ? pathname === link.href : pathname?.startsWith(link.href)
          const Icon = link.icon
          const translatedLabel = t('sidebar', link.labelKey)
          return (
            <Link key={link.href} href={link.href} title={collapsed ? translatedLabel : undefined}>
              <div className={`flex items-center ${collapsed ? 'justify-center px-0' : 'px-3'} py-3 rounded-xl cursor-pointer transition-colors group relative ${isActive ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                <Icon className={`w-5 h-5 shrink-0 transition-colors ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`} />
                {!collapsed && <span className="ml-3 text-[14px] whitespace-nowrap">{translatedLabel}</span>}
              </div>
            </Link>
          )
        })}
      </div>

      {/* Footer Controls (Theme & Lang & User) */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-col items-center gap-3">
        {/* User Profile */}
        <div className={`w-full flex items-center ${collapsed ? 'justify-center' : 'justify-between'} bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-2`}>
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex flex-shrink-0 items-center justify-center text-emerald-600 dark:text-emerald-400">
              <UserIcon className="w-4 h-4" />
            </div>
            {!collapsed && (
              <div className="flex flex-col truncate">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate pr-2">
                  {user?.email ? user.email.split('@')[0] : 'Usuário'}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate pr-2">
                  {user?.email || 'Desconhecido'}
                </span>
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={() => supabase.auth.signOut().then(() => router.push('/'))}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-colors"
              title={t('sidebar', 'logout')}
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
        
        {/* Collapsed Logout */}
        {collapsed && (
          <button
            onClick={() => supabase.auth.signOut().then(() => router.push('/'))}
            className="flex items-center justify-center w-10 h-10 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-600 dark:text-slate-300 hover:border-red-300 hover:text-red-500 transition-colors group"
            title={t('sidebar', 'logout')}
          >
            <LogOut className="w-4 h-4 group-hover:text-red-500" />
          </button>
        )}

        <button onClick={toggleLanguage} className={`flex items-center ${collapsed ? 'justify-center w-10 h-10' : 'px-3 py-2 w-full justify-between'} bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-600 dark:text-slate-300 hover:border-emerald-300 transition-colors group`} title={t('sidebar', 'language')}>
           {collapsed ? (
             <span className="text-xs font-bold leading-none">{lang}</span>
           ) : (
             <>
               <span className="text-xs font-semibold flex items-center gap-2"><Globe className="w-4 h-4 text-slate-400 group-hover:text-emerald-500" /> {t('sidebar', 'language')}</span>
               <span className="text-xs font-bold bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded shadow-sm border border-slate-200 dark:border-slate-700">{lang}</span>
             </>
           )}
        </button>

        {mounted && (
          <div className="relative group w-full">
            <button 
              className={`flex items-center ${collapsed ? 'justify-center w-10 h-10 mx-auto' : 'px-3 py-2 w-full justify-between'} bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-600 dark:text-slate-300 hover:border-emerald-300 transition-colors group-hover:border-emerald-300 group`}
              title={t('sidebar', 'theme')}
            >
              {collapsed ? (
                 <Palette className="w-4 h-4 text-slate-400 group-hover:text-emerald-500" />
              ) : (
                <>
                 <span className="text-xs font-semibold flex items-center gap-2">
                   <Palette className="w-4 h-4 text-slate-400 group-hover:text-emerald-500" />
                   {t('sidebar', 'theme')}
                 </span>
                 <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate max-w-[80px]">
                   {themesList.find(t => t.id === theme)?.name || theme}
                 </span>
                </>
              )}
            </button>

            {/* Dropdown via group-hover */}
            <div className={`absolute bottom-full left-0 mb-2 ${collapsed ? 'w-48 left-12 bottom-0 mb-0' : 'w-full'} bg-white dark:bg-slate-800 rounded-xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 translate-y-1 group-hover:translate-y-0 z-50 overflow-hidden`}>
              <div className="p-2 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                Temas do Chat
              </div>
              <div className="flex flex-col">
                {themesList.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors ${theme === t.id ? 'bg-slate-50 dark:bg-slate-700 font-medium text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                  >
                    <div className="w-5 h-5 rounded-full flex-shrink-0 border border-slate-200 shadow-sm relative overflow-hidden flex">
                      <div style={{ backgroundColor: t.color1, width: '50%', height: '100%' }} />
                      <div style={{ backgroundColor: t.color2, width: '50%', height: '100%' }} />
                    </div>
                    <span className="flex-1 truncate">{t.name}</span>
                    {theme === t.id && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
