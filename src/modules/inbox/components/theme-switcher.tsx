"use client"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Palette, Check } from "lucide-react"

export function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  // Evitar hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <button className="p-2 text-slate-400 rounded-xl transition-all opacity-50 cursor-default">
        <Palette className="w-5 h-5" />
      </button>
    )
  }

  const themes = [
    { 
      id: 'light', 
      name: 'Classico (Claro)', 
      color1: '#6366f1', // emerald-500
      color2: '#f8fafc', // bg
    },
    { 
      id: 'dark', 
      name: 'Modo Escuro', 
      color1: '#4f46e5', // emerald-600
      color2: '#0f172a', // bg
    },
    { 
      id: 'sunset', 
      name: 'Sunset (Quente)', 
      color1: '#ff758c', // rose
      color2: '#ffede6', // bg
    },
    { 
      id: 'ocean', 
      name: 'Ocean (Frio)', 
      color1: '#0ea5e9', // cyan/blue
      color2: '#e0f2fe', // bg
    }
  ]

  return (
    <div className="relative group">
      <button className="p-2 flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-all" title="Mudar Tema">
        <Palette className="w-5 h-5" />
      </button>
      
      {/* Dropdown via group-hover ou foco. Abrindo para baixo (top-full mt-2) e alinhado à direita (right-0) */}
      <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 -translate-y-1 group-hover:translate-y-0 z-50 overflow-hidden">
        <div className="p-2 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
          Temas do Chat
        </div>
        <div className="flex flex-col">
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={`flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors ${theme === t.id ? 'bg-slate-50 dark:bg-slate-700 font-medium text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            >
              <div 
                className="w-5 h-5 rounded-full flex-shrink-0 border border-slate-200 shadow-sm relative overflow-hidden flex"
              >
                <div style={{ backgroundColor: t.color1, width: '50%', height: '100%' }} />
                <div style={{ backgroundColor: t.color2, width: '50%', height: '100%' }} />
              </div>
              <span className="flex-1">{t.name}</span>
              {theme === t.id && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
