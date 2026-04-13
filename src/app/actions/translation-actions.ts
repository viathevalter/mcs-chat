"use server"

import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"
import { createClient } from "@supabase/supabase-js"

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

// Precisamos usar service_role key pois vamos ler/gravar translations nas messages 
// mesmo se o RLS bloquear updates na message inteira.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

export async function translateInboundMessage(messageId: string, originalContent: string, currentTranslations: any, targetLang: string = "pt-BR") {
  try {
    if (currentTranslations && currentTranslations[targetLang]) {
      return { success: true, translation: currentTranslations[targetLang] }
    }

    const systemPrompt = `Você é um tradutor instantâneo de chats de WhatsApp.
Abaixo estará uma mensagem recebida em um chat.
Sua tarefa é identificar automaticamente o idioma original e traduzi-la OBRIGATORIAMENTE para: "${targetLang}".
REGRA CRÍTICA: Se a mensagem original JÁ ESTIVER no idioma "${targetLang}", não faça nenhuma tradução! Apenas retorne a mesma mensagem original inalterada. NÃO traduza para inglês ou qualquer outro idioma.
RETORNE APENAS A MENSAGEM FINAL. SEM ASPAS. SEM TEXTO ADICIONAL.`

    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      prompt: originalContent,
      temperature: 0.1, // temperatura baixa para tradução precisa
    })

    const newTranslation = text.trim()

    // Save to DB
    const updatedTranslations = { ...(currentTranslations || {}), [targetLang]: newTranslation }
    
    await supabase.from('messages').update({
      translations: updatedTranslations
    }).eq('id', messageId)

    return { success: true, translation: newTranslation }
  } catch (error: any) {
    console.error("Error in inbound translation", error)
    return { success: false, error: error.message }
  }
}

export async function translateOutboundMessage(originalContent: string, targetChatLang: string) {
  try {
    const systemPrompt = `Você é um comunicador profissional em um CRM.
O operador digitou uma mensagem no idioma original dele. O cliente destino fala: ${targetChatLang}.
Sua tarefa é traduzir a mensagem com tom comercial, amigável e educado, adaptando perfeitamente para ${targetChatLang}.
Não perca links e nem perca variáveis.
RETORNE APENAS E EXCLUSIVAMENTE A TRADUÇÃO. NUNCA ADICIONE COMENTÁRIOS.`

    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      prompt: originalContent,
      temperature: 0.2,
    })

    return { success: true, translation: text.trim() }
  } catch (error: any) {
    console.error("Error in outbound translation", error)
    return { success: false, error: error.message }
  }
}
