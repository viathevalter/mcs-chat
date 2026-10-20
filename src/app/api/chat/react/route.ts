import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionApi } from '@/lib/whatsapp/evolution-api'

export async function POST(req: Request) {
  try {
    const { messageId, emoji } = await req.json()
    if (!messageId || emoji === undefined) {
      return NextResponse.json({ error: 'ID da mensagem e emoji são obrigatórios' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: dbMsg } = await supabase
      .from('chat_messages')
      .select('id, external_id, conversation_id')
      .eq('id', messageId)
      .single()

    if (!dbMsg || !dbMsg.external_id) {
      return NextResponse.json({ error: 'Mensagem sem ID externo do WhatsApp para reagir' }, { status: 400 })
    }

    const { data: conv } = await supabase
      .from('chat_conversations')
      .select('contact_phone, channel:chat_channels(api_url, api_token, instance_token)')
      .eq('id', dbMsg.conversation_id)
      .single()

    const channelData = (conv as any)?.channel
    const apiUrl = channelData?.api_url || 'https://mcs-chat.uazapi.com'
    const apiToken = channelData?.instance_token || channelData?.api_token

    if (!apiUrl || !apiToken || !conv?.contact_phone) {
      return NextResponse.json({ error: 'Credenciais do canal ausentes' }, { status: 400 })
    }

    const res = await evolutionApi.reactMessage({
      id: dbMsg.external_id,
      number: conv.contact_phone,
      emoji,
      apiUrl,
      apiToken
    })

    return NextResponse.json({ success: true, data: res })
  } catch (err: any) {
    console.error('React message error:', err)
    return NextResponse.json({ error: err.message || 'Erro ao enviar reação' }, { status: 500 })
  }
}
