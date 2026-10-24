import { NextResponse } from 'next/server'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '@/lib/supabase/config'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})

const LANG_TO_ISO: Record<string, string> = {
  Spanish: 'es',
  Espanhol: 'es',
  Español: 'es',
  es: 'es',
  English: 'en',
  Inglês: 'en',
  en: 'en',
  Portuguese: 'pt',
  Português: 'pt',
  'Português (Brasil)': 'pt',
  'pt-BR': 'pt',
  pt: 'pt',
  Italian: 'it',
  Italiano: 'it',
  it: 'it',
  French: 'fr',
  Francês: 'fr',
  Français: 'fr',
  fr: 'fr',
  German: 'de',
  Alemão: 'de',
  Deutsch: 'de',
  de: 'de',
}

export async function fastGoogleTranslate(text: string, targetIso: string): Promise<string | null> {
  // 1. Primary ultra-fast endpoint (~100-200ms, no rate limit per OpenAI token)
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2800)
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetIso)}&dt=t&q=${encodeURIComponent(text)}`
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const joined = data[0].map((chunk: any) => chunk?.[0] || '').join('').trim()
        if (joined) return joined
      }
    }
  } catch {}

  // 2. Secondary zero-cost endpoint (clients5.google.com)
  try {
    const controller2 = new AbortController()
    const timer2 = setTimeout(() => controller2.abort(), 2800)
    const url2 = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${encodeURIComponent(targetIso)}&q=${encodeURIComponent(text)}`
    const res2 = await fetch(url2, { cache: 'no-store', signal: controller2.signal })
    clearTimeout(timer2)
    if (res2.ok) {
      const data2 = await res2.json()
      if (Array.isArray(data2)) {
        const first = data2[0]
        if (typeof first === 'string' && first.trim()) return first.trim()
        if (Array.isArray(first) && typeof first[0] === 'string' && first[0].trim()) {
          return first[0].trim()
        }
      }
    }
  } catch {}

  return null
}

async function openAiTranslate(text: string, targetLang: string, timeoutMs = 3000): Promise<string | null> {
  const openAiKey = (process.env.OPENAI_API_KEY || '').trim()
  if (!openAiKey) return null

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const openai = createOpenAI({ apiKey: openAiKey })
    const { text: out } = await generateText({
      model: openai('gpt-4o-mini'),
      maxRetries: 0,
      abortSignal: controller.signal,
      system: `Traduza a mensagem abaixo para "${targetLang}". Se já estiver em "${targetLang}", retorne igual. Retorne APENAS a tradução, sem aspas e sem comentários.`,
      prompt: text,
      temperature: 0.1,
    })
    clearTimeout(timer)
    return out?.trim() || null
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      messageId,
      content,
      currentTranslations,
      targetLang = 'Portuguese',
      mode = 'inbound',
    } = body

    const cleanContent = String(content || '').trim()
    if (!cleanContent) {
      return NextResponse.json({ success: false, error: 'Empty content' }, { status: 400 })
    }

    if (mode === 'inbound' && currentTranslations && currentTranslations[targetLang]) {
      return NextResponse.json({ success: true, translation: currentTranslations[targetLang] })
    }

    const targetIso = LANG_TO_ISO[targetLang] || (mode === 'outbound' ? 'es' : 'pt')
    let translated: string | null = null

    if (mode === 'inbound') {
      // Para leitura das mensagens recebidas dos trabalhadores: prioriza motor instantâneo (~120ms) sem fila de tokens
      translated = await fastGoogleTranslate(cleanContent, targetIso)
      if (!translated) {
        translated = await openAiTranslate(cleanContent, targetLang, 3500)
      }
    } else {
      // Para envio (outbound): tenta IA rápida (máx 2.2s) e faz fallback imediato para Google GTX
      translated = await openAiTranslate(cleanContent, targetLang, 2200)
      if (!translated) {
        translated = await fastGoogleTranslate(cleanContent, targetIso)
      }
    }

    if (!translated) {
      translated = cleanContent
    }

    // Salva no banco em background para cache permanente (sem travar a resposta HTTP ao navegador)
    if (mode === 'inbound' && messageId && !String(messageId).startsWith('temp_')) {
      const updatedTranslations = { ...(currentTranslations || {}), [targetLang]: translated }
      supabase
        .from('chat_messages')
        .update({ translations: updatedTranslations })
        .eq('id', messageId)
        .then(() => {})
    }

    return NextResponse.json({ success: true, translation: translated })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Translation error' }, { status: 500 })
  }
}
