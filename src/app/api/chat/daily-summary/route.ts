import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createOpenAI } from "@ai-sdk/openai"
import { generateObject } from "ai"
import { z } from "zod"

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

export const maxDuration = 300 // Max 5 minutes for AI processing if on Vercel Pro, else 60s or 10s depending on plan

export async function POST(req: Request) {
  try {
    const reqData = await req.json().catch(() => ({}))
    const targetDate = reqData.date || new Date().toISOString().split('T')[0] // 'YYYY-MM-DD'

    const supabase = createAdminClient()

    const { data: existingSummary } = await supabase
      .from('chat_daily_summaries')
      .select('id, status')
      .eq('summary_date', targetDate)
      .single()

    if (existingSummary && existingSummary.status === 'completed' && !reqData.force) {
      return NextResponse.json({ message: 'Summary already completed for this date.' })
    }

    let summaryId = existingSummary?.id
    if (!summaryId) {
      const { data: newSum } = await supabase.from('chat_daily_summaries')
        .insert({ summary_date: targetDate, status: 'processing' })
        .select('id')
        .single()
      summaryId = newSum?.id
    } else {
      await supabase.from('chat_daily_summaries').update({ status: 'processing' }).eq('id', summaryId)
    }

    const startOfDay = new Date(`${targetDate}T00:00:00.000Z`).toISOString()
    const endOfDay = new Date(`${targetDate}T23:59:59.999Z`).toISOString()

    const { data: messages, error: msgError } = await supabase
      .from('chat_messages')
      .select('id, conversation_id, content, direction, sender_name, created_at, message_type')
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
      .neq('message_type', 'internal_note')
      .order('created_at', { ascending: true })

    if (msgError || !messages || messages.length === 0) {
      await supabase.from('chat_daily_summaries').update({ status: 'error', summary: 'No messages found for this date.' }).eq('id', summaryId)
      return NextResponse.json({ message: 'No messages found.' })
    }

    const convMap = new Map<string, any[]>()
    messages.forEach(m => {
       const key = m.conversation_id
       if (!convMap.has(key)) convMap.set(key, [])
       convMap.get(key)!.push(m)
    })

    const totalConversations = convMap.size
    const totalMessages = messages.length

    let transcriptBlock = ''
    for (const [convId, msgs] of convMap.entries()) {
       transcriptBlock += `\n\n--- INÍCIO DA CONVERSA (ID: ${convId}) ---\n`
       for (const m of msgs) {
         if (!m.content) continue;
         const author = m.direction === 'inbound' ? 'Trabalhador' : (m.sender_name || 'Operador')
         transcriptBlock += `[${m.created_at}] ${author}: ${m.content}\n`
       }
       transcriptBlock += `--- FIM DA CONVERSA ---\n`
    }

    if (transcriptBlock.length > 250000) {
        transcriptBlock = transcriptBlock.substring(0, 250000) + "\n...[TRUNCATED FOR LENGTH]"
    }

    const systemPrompt = `Você é um Auditor Sênior de Qualidade e Compliance para as centrais de atendimento WhatsApp.
Você receberá um histórico completo de transcrições de dezenas/centenas de conversas do dia.
Seu objetivo é extrair inteligência, estatísticas de tópicos abordados e identificar RIGOROSAMENTE qualquer risco.

CRITÉRIOS DE RISCO:
1. Acidentes de trabalho ou ferimentos relatados pelo trabalhador.
2. Ameaças de processos trabalhistas, reclamações severas no Ministério do Trabalho ou descontentamento extremo.
3. Atendimento Ríspido: Qualquer grosseria, falta de profissionalismo, ironia ou despreparo por parte do "Operador".

Resuma o dia em um texto claro e extraia os tópicos mais falados com porcentagem aproximada.`

    const { object: aiResponse } = await generateObject({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      prompt: `Aqui estão as transcrições do dia:\n\n${transcriptBlock}`,
      schema: z.object({
        summary: z.string().describe("Um resumo gerencial de 2 a 3 parágrafos sobre como foi o dia na central, principais ocorrências e clima geral."),
        topic_stats: z.array(z.object({
             topic: z.string().describe("O assunto abordado. Ex: Dúvida de Ponto, Pagamento, Atestado Médico"),
             percentage: z.number().describe("Um valor inteiro de 0 a 100 estimando a proporção de conversas sobre isso no dia.")
        })).describe("Lista dos 3 a 5 principais assuntos falados hoje."),
        risks_detected: z.array(z.object({
             type: z.string().describe("O tipo de risco: 'Acidente', 'Processo/Legal', 'Atendimento Ríspido' ou 'Outro'"),
             conversation_id: z.string().describe("O ID exato da conversa onde o risco ocorreu, conforme informado no separador INÍCIO DA CONVERSA (ID: X)."),
             reason: z.string().describe("Breve explicação do porquê foi flagrado."),
             excerpt: z.string().describe("Trecho da mensagem que comprova a ocorrência.")
        })).describe("Se não houver riscos, retorne um array vazio []")
      }),
      temperature: 0.1,
    })

    await supabase.from('chat_daily_summaries')
       .update({
         total_conversations: totalConversations,
         total_messages: totalMessages,
         summary: aiResponse.summary,
         topic_stats: aiResponse.topic_stats,
         risks_detected: aiResponse.risks_detected,
         status: 'completed',
         updated_at: new Date().toISOString()
       })
       .eq('id', summaryId)

    return NextResponse.json({ success: true, summary: aiResponse })

  } catch (err: any) {
    console.error('Daily summary failed:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
