"use server"

import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config"

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})

const LANG_TO_ISO: Record<string, string> = {
  'Spanish': 'es',
  'Espanhol': 'es',
  'es': 'es',
  'English': 'en',
  'Inglês': 'en',
  'en': 'en',
  'Portuguese': 'pt',
  'Português': 'pt',
  'Português (Brasil)': 'pt',
  'pt-BR': 'pt',
  'pt': 'pt',
  'Italian': 'it',
  'Italiano': 'it',
  'it': 'it',
  'French': 'fr',
  'Francês': 'fr',
  'fr': 'fr',
  'German': 'de',
  'Alemão': 'de',
  'de': 'de',
}

async function googleTranslateFallback(text: string, targetIso: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetIso)}&dt=t&q=${encodeURIComponent(text)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    cache: 'no-store'
  })
  if (!res.ok) throw new Error(`Translation HTTP ${res.status}`)
  const data = await res.json()
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0].map((chunk: any) => chunk?.[0] || '').join('').trim()
  }
  return text
}

export async function translateInboundMessage(
  messageId: string,
  originalContent: string,
  currentTranslations: any,
  targetLang: string = "pt-BR"
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

    if (process.env.OPENAI_API_KEY) {
      try {
        const systemPrompt = `Você é um tradutor instantâneo de chats de WhatsApp.
Abaixo estará uma mensagem recebida em um chat.
Sua tarefa é identificar automaticamente o idioma original e traduzi-la OBRIGATORIAMENTE para: "${targetLang}".
REGRA CRÍTICA: Se a mensagem original JÁ ESTIVER no idioma "${targetLang}", apenas retorne a mesma mensagem original inalterada.
RETORNE APENAS A MENSAGEM FINAL. SEM ASPAS. SEM TEXTO ADICIONAL.`

        const { text } = await generateText({
          model: openai('gpt-4o-mini'),
          system: systemPrompt,
          prompt: originalContent,
          temperature: 0.1,
        })
        newTranslation = text.trim()
      } catch (aiErr) {
        newTranslation = await googleTranslateFallback(originalContent, targetIso)
      }
    } else {
      newTranslation = await googleTranslateFallback(originalContent, targetIso)
    }

    if (!newTranslation) newTranslation = originalContent

    // Save to public.chat_messages
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

    if (process.env.OPENAI_API_KEY) {
      try {
        const systemPrompt = `Você é um comunicador profissional em um sistema corporativo (MCS).
O operador digitou uma mensagem no idioma original dele. O destinatário fala: ${targetChatLang}.
Sua tarefa é traduzir a mensagem com tom profissional, claro e educado para ${targetChatLang}.
Não perca links e nem variáveis.
RETORNE APENAS E EXCLUSIVAMENTE A TRADUÇÃO. NUNCA ADICIONE COMENTÁRIOS.`

        const { text } = await generateText({
          model: openai('gpt-4o-mini'),
          system: systemPrompt,
          prompt: originalContent,
          temperature: 0.2,
        })
        return { success: true, translation: text.trim() }
      } catch (aiErr) {
        const fallback = await googleTranslateFallback(originalContent, targetIso)
        return { success: true, translation: fallback }
      }
    } else {
      const fallback = await googleTranslateFallback(originalContent, targetIso)
      return { success: true, translation: fallback }
    }
  } catch (error: any) {
    console.error("Error in outbound translation:", error)
    return { success: false, error: error.message }
  }
}
