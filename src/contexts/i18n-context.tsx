"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Language, translations } from '@/locales'
import { supabase } from '@/lib/supabase/client'

type I18nContextType = {
  lang: Language
  setLang: (lang: Language) => void
  t: (section: keyof typeof translations['PT'], key: string) => string
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

function normalizeDbLang(raw?: string | null): Language | null {
  const up = String(raw || '').trim().toUpperCase()
  if (up === 'ES' || up.startsWith('ES')) return 'ES'
  if (up === 'EN' || up.startsWith('EN')) return 'EN'
  if (up === 'PT' || up.startsWith('PT')) return 'PT'
  return null
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>('PT')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('app_lang') as Language
    if (saved && (saved === 'PT' || saved === 'EN' || saved === 'ES')) {
      setLang(saved)
    }
    setMounted(true)

    const syncUserLanguageFromProfile = async (userId?: string | null) => {
      if (!userId) return
      try {
        const { data: mcsUser } = await supabase
          .from('mcs_users')
          .select('language')
          .eq('id', userId)
          .maybeSingle()

        const profileLang = normalizeDbLang(mcsUser?.language)
        const manualUserOverride = localStorage.getItem(`app_lang_manual_${userId}`) as Language | null
        if (manualUserOverride && (manualUserOverride === 'PT' || manualUserOverride === 'EN' || manualUserOverride === 'ES')) {
          setLang(manualUserOverride)
          localStorage.setItem('app_lang', manualUserOverride)
        } else if (profileLang) {
          setLang(profileLang)
          localStorage.setItem('app_lang', profileLang)
        }
      } catch {}
    }

    supabase.auth.getUser().then(({ data }) => {
      syncUserLanguageFromProfile(data?.user?.id)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      syncUserLanguageFromProfile(session?.user?.id)
    })

    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  const handleSetLang = (newLang: Language) => {
    setLang(newLang)
    localStorage.setItem('app_lang', newLang)
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data?.user?.id
      if (uid) {
        localStorage.setItem(`app_lang_manual_${uid}`, newLang)
        await supabase
          .from('mcs_users')
          .update({ language: newLang.toLowerCase() })
          .eq('id', uid)
      }
    })
  }

  const t = (section: keyof typeof translations['PT'], key: string) => {
    // @ts-ignore - dynamic dictionary lookup
    return translations[lang][section]?.[key] || key
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
