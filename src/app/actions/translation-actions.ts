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

function normalizeTemplateVariableTags(input: string): string {
  return input
    .replace(/\{\s*(nombre\s+de\s+pila|primer[_\s]*nombre|first[_\s]*name)\s*\}/gi, '{primeiro_nome}')
    .replace(/\{\s*(nombre\s+completo|nombre|full[_\s]*name)\s*\}/gi, '{nome}')
    .replace(/\{\s*(pasaporte|passport|documento)\s*\}/gi, '{passaporte}')
    .replace(/\{\s*(alojamiento|housing)\s*\}/gi, '{alojamento}')
    .replace(/\{\s*(direcci[oó]n[_\s]*de[_\s]*alojamiento|direcci[oó]n[_\s]*alojamiento|endereco[_\s]*de[_\s]*alojamento)\s*\}/gi, '{endereco_alojamento}')
    .replace(/\{\s*(funci[oó]n|funcion|role)\s*\}/gi, '{funcao}')
    .replace(/\{\s*(order[_\s]*code|c[oó]digo[_\s]*pedido|cod[_\s]*encargo)\s*\}/gi, '{cod_pedido}')
    .replace(/\{\s*(trabajar|trabajo|work[_\s]*site)\s*\}/gi, '{obra}')
}

function maskTemplateVariables(input: string): { masked: string; vars: string[] } {
  const normalized = normalizeTemplateVariableTags(input)
  const vars: string[] = []
  const masked = normalized.replace(/\{[a-zA-Z0-9_À-ÿ\s]+\}/g, (match) => {
    const idx = vars.length
    vars.push(match)
    return `__MCS_VAR_${idx}__`
  })
  return { masked, vars }
}

function unmaskTemplateVariables(translated: string, vars: string[]): string {
  let out = translated
  vars.forEach((originalTag, idx) => {
    const re = new RegExp(`__\\s*MCS[\\s_]*VAR[\\s_]*${idx}\\s*__`, 'gi')
    out = out.replace(re, originalTag)
  })
  return normalizeTemplateVariableTags(out)
}

export async function translateOutboundMessage(originalContent: string, targetChatLang: string) {
  try {
    if (!originalContent || !originalContent.trim()) {
      return { success: false, error: 'Empty content' }
    }

    const { masked, vars } = maskTemplateVariables(originalContent)
    const targetIso = LANG_TO_ISO[targetChatLang] || 'es'
    const openAiKey = (process.env.OPENAI_API_KEY || '').trim()

    if (openAiKey) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 3200)
        const openai = createOpenAI({ apiKey: openAiKey })
        const systemPrompt = `Você é um comunicador profissional em um sistema corporativo (MCS).
O operador digitou uma mensagem no idioma original dele. O destinatário fala: ${targetChatLang}.
Sua tarefa é traduzir a mensagem com tom profissional, claro e educado para ${targetChatLang}.
REGRAS CRÍTICAS DE FORMATAÇÃO WHATSAPP:
1. Preserve EXATAMENTE todas as quebras de linha, parágrafos, emojis e marcadores de negrito do WhatsApp (*texto*).
2. NUNCA altere, traduza nem remova tokens de variáveis como __MCS_VAR_0__, __MCS_VAR_1__, links ou números de telefone.
3. Sempre mantenha um espaço após o fechamento de negrito (ex: *Dirección:* texto).
RETORNE APENAS E EXCLUSIVAMENTE A TRADUÇÃO. NUNCA ADICIONE COMENTÁRIOS.`

        const { text } = await generateText({
          model: openai('gpt-4o-mini'),
          maxRetries: 0,
          abortSignal: controller.signal,
          system: systemPrompt,
          prompt: masked,
          temperature: 0.15,
        })
        clearTimeout(timer)
        const cleaned = unmaskTemplateVariables(text.trim(), vars)
        if (cleaned) {
          return { success: true, translation: cleaned }
        }
      } catch (aiErr) {
        const fallback = await googleTranslateFallback(masked, targetIso)
        return { success: true, translation: unmaskTemplateVariables(fallback, vars) }
      }
    }

    const fallback = await googleTranslateFallback(masked, targetIso)
    return { success: true, translation: unmaskTemplateVariables(fallback, vars) }
  } catch (error: any) {
    console.error("Error in outbound translation:", error)
    const { masked, vars } = maskTemplateVariables(originalContent)
    const targetIso = LANG_TO_ISO[targetChatLang] || 'es'
    const fallback = await googleTranslateFallback(masked, targetIso)
    return { success: true, translation: unmaskTemplateVariables(fallback, vars) }
  }
}
