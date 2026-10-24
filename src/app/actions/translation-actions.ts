"use server"

import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config"

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

async function googleTranslateFallback(text: string, targetIso: string): Promise<string> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetIso)}&dt=t&q=${encodeURIComponent(text)}`
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const joined = data[0].map((chunk: any) => chunk?.[0] || '').join('').trim()
        if (joined) return joined
      }
    }
  } catch (e) {
    console.warn('Primary gtx translation fallback warning:', e)
  }

  // Secondary zero-cost fallback (clients5.google.com)
  try {
    const url2 = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${encodeURIComponent(targetIso)}&q=${encodeURIComponent(text)}`
    const res2 = await fetch(url2, { cache: 'no-store' })
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
  } catch (e2) {
    console.warn('Secondary clients5 translation fallback warning:', e2)
  }

  return text
}

export async function translateInboundMessage(
  messageId: string,
  originalContent: string,
  currentTranslations: any,
  targetLang: string = "Portuguese"
) {
  try {
    if (!originalContent || !originalContent.trim()) {
      return { success: false, error: 'Empty content' }
    }
    if (currentTranslations && currentTranslations[targetLang]) {
      return { success: true, translation: currentTranslations[targetLang] }
    }

    const targetIso = LANG_TO_ISO[targetLang] || 'pt'
    let newTranslation = ''

    // Para leitura de mensagens recebidas: prioriza Google GTX instantâneo (~120ms, sem fila de tokens da OpenAI)
    newTranslation = await googleTranslateFallback(originalContent, targetIso)

    const openAiKey = (process.env.OPENAI_API_KEY || '').trim()
    if ((!newTranslation || newTranslation === originalContent) && openAiKey) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 2800)
        const openai = createOpenAI({ apiKey: openAiKey })
        const systemPrompt = `Você é um tradutor instantâneo de chats de WhatsApp corporativo (MCS).
Abaixo estará uma mensagem recebida em um chat.
Sua tarefa é identificar automaticamente o idioma original e traduzi-la OBRIGATORIAMENTE para: "${targetLang}".
REGRA CRÍTICA: Se a mensagem original JÁ ESTIVER no idioma "${targetLang}", apenas retorne a mesma mensagem original inalterada.
RETORNE APENAS A MENSAGEM FINAL. SEM ASPAS. SEM TEXTO ADICIONAL.`

        const { text } = await generateText({
          model: openai('gpt-4o-mini'),
          maxRetries: 0,
          abortSignal: controller.signal,
          system: systemPrompt,
          prompt: originalContent,
          temperature: 0.1,
        })
        clearTimeout(timer)
        if (text?.trim()) newTranslation = text.trim()
      } catch {}
    }

    if (!newTranslation) newTranslation = originalContent

    const updatedTranslations = { ...(currentTranslations || {}), [targetLang]: newTranslation }
    await supabase
      .from('chat_messages')
      .update({ translations: updatedTranslations })
      .eq('id', messageId)

    return { success: true, translation: newTranslation }
  } catch (error: any) {
    console.error("Error in inbound translation:", error)
    return { success: false, error: error.message }
  }
}

export async function translateOutboundMessage(originalContent: string, targetChatLang: string) {
  try {
    if (!originalContent || !originalContent.trim()) {
      return { success: false, error: 'Empty content' }
    }

    const targetIso = LANG_TO_ISO[targetChatLang] || 'es'
    const openAiKey = (process.env.OPENAI_API_KEY || '').trim()

    if (openAiKey) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 2400)
        const openai = createOpenAI({ apiKey: openAiKey })
        const systemPrompt = `Você é um comunicador profissional em um sistema corporativo (MCS).
O operador digitou uma mensagem no idioma original dele. O destinatário fala: ${targetChatLang}.
Sua tarefa é traduzir a mensagem com tom profissional, claro e educado para ${targetChatLang}.
Não perca links, números de telefone e nem variáveis.
RETORNE APENAS E EXCLUSIVAMENTE A TRADUÇÃO. NUNCA ADICIONE COMENTÁRIOS.`

        const { text } = await generateText({
          model: openai('gpt-4o-mini'),
          maxRetries: 0,
          abortSignal: controller.signal,
          system: systemPrompt,
          prompt: originalContent,
          temperature: 0.2,
        })
        clearTimeout(timer)
        const cleaned = text.trim()
        if (cleaned) {
          return { success: true, translation: cleaned }
        }
      } catch (aiErr) {
        const fallback = await googleTranslateFallback(originalContent, targetIso)
        return { success: true, translation: fallback }
      }
    }

    const fallback = await googleTranslateFallback(originalContent, targetIso)
    return { success: true, translation: fallback }
  } catch (error: any) {
    console.error("Error in outbound translation:", error)
    const targetIso = LANG_TO_ISO[targetChatLang] || 'es'
    const fallback = await googleTranslateFallback(originalContent, targetIso)
    return { success: true, translation: fallback }
  }
}
