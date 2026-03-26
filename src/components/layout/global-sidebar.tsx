"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { MessageCircle, Megaphone, Bot, Settings, ChevronLeft, ChevronRight, Moon, Sun, Globe } from 'lucide-react'

export function GlobalSidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [lang, setLang] = useState('PT')

  useEffect(() => {
    setMounted(true)
  }, [])

  const links = [
    { href: '/inbox', label: 'Atendimento', icon: MessageCircle, exact: true },
    { href: '/inbox/automations', label: 'Campanhas', icon: Megaphone },
    { href: '/inbox/captain', label: 'Capitão IA', icon: Bot },
    { href: '/inbox/admin', label: 'Painel Admin', icon: Settings },
  ]

  const toggleLanguage = () => {
    const langs = ['PT', 'EN', 'ES']
    const next = langs[(langs.indexOf(lang) + 1) % langs.length]
    setLang(next)
  }

  return (
    <nav className={`flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 transition-all duration-300 ${collapsed ? 'w-20' : 'w-[240px]'} h-full shrink-0 relative z-50`}>
      {/* Logo Area */}
      <div className="h-20 flex items-center justify-center border-b border-slate-100 dark:border-slate-800 shrink-0">
         <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
           M
         </div>
         {!collapsed && <span className="ml-3 font-bold text-slate-800 dark:text-slate-100 text-lg tracking-tight shrink-0 whitespace-nowrap">Mastercorp</span>}
      </div>

      {/* Collapse Button */}
      <button 
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-24 w-6 h-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center text-slate-500 hover:text-indigo-600 transition-colors shadow-sm z-50"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {/* Navigation Links */}
      <div className="flex-1 py-6 px-3 space-y-2 overflow-y-auto">
        {links.map((link) => {
          const isActive = link.exact ? pathname === link.href : pathname?.startsWith(link.href)
          const Icon = link.icon
          return (
            <Link key={link.href} href={link.href}>
              <div className={`flex items-center ${collapsed ? 'justify-center px-0' : 'px-3'} py-3 rounded-xl cursor-pointer transition-colors group relative ${isActive ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                <Icon className={`w-5 h-5 shrink-0 transition-colors ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`} />
                {!collapsed && <span className="ml-3 text-[14px] whitespace-nowrap">{link.label}</span>}
                
                {/* Tooltip for collapsed mode */}
                {collapsed && (
                   <div className="absolute left-full ml-4 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                     {link.label}
                   </div>
                )}
              </div>
            </Link>
          )
        })}
      </div>

      {/* Footer Controls (Theme & Lang) */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-col items-center gap-3">
        <button onClick={toggleLanguage} className={`flex items-center ${collapsed ? 'justify-center w-10 h-10' : 'px-3 py-2 w-full justify-between'} bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-600 dark:text-slate-300 hover:border-indigo-300 transition-colors group`} title="Alterar Idioma">
           {collapsed ? (
             <span className="text-xs font-bold leading-none">{lang}</span>
           ) : (
             <>
               <span className="text-xs font-semibold flex items-center gap-2"><Globe className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" /> Idioma</span>
               <span className="text-xs font-bold bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded shadow-sm border border-slate-200 dark:border-slate-700">{lang}</span>
             </>
           )}
        </button>

        {mounted && (
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={`flex items-center ${collapsed ? 'justify-center w-10 h-10' : 'px-3 py-2 w-full justify-between'} bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-600 dark:text-slate-300 hover:border-indigo-300 transition-colors group`}
            title="Alternar Tema"
          >
            {collapsed ? (
              theme === 'dark' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" />
            ) : (
              <>
               <span className="text-xs font-semibold flex items-center gap-2">
                 {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" />}
                 Tema
               </span>
               <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{theme}</span>
              </>
            )}
          </button>
        )}
      </div>
    </nav>
  )
}
