"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Language, translations } from '@/locales'

type I18nContextType = {
  lang: Language
  setLang: (lang: Language) => void
  t: (section: keyof typeof translations['PT'], key: string) => string
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>('PT')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('app_lang') as Language
    if (saved && (saved === 'PT' || saved === 'EN' || saved === 'ES')) {
      setLang(saved)
    }
    setMounted(true)
  }, [])

  const handleSetLang = (newLang: Language) => {
    setLang(newLang)
    localStorage.setItem('app_lang', newLang)
  }

  const t = (section: keyof typeof translations['PT'], key: string) => {
    // @ts-ignore - dynamic dictionary lookup
    return translations[lang][section]?.[key] || key
  }

  if (!mounted) {
    return null // wait until mounted to avoid hydration mismatch
  }

  return (
    <I18nContext.Provider value={{ lang, setLang: handleSetLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return context
}
