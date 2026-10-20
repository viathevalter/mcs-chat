import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionApi } from '@/lib/whatsapp/evolution-api'

export async function POST(req: Request) {
  try {
    const { messageId, newText } = await req.json()
    if (!messageId || !newText || !newText.trim()) {
      return NextResponse.json({ error: 'ID da mensagem e novo texto são obrigatórios' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: dbMsg } = await supabase
      .from('chat_messages')
      .select('id, external_id, message_type, conversation_id')
      .eq('id', messageId)
      .single()

    if (!dbMsg) {
      return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 })
    }

    const cleanText = newText.trim()

    // Se for nota interna ou tiver external_id ausente, edita localmente
    if (dbMsg.message_type === 'internal_note' || dbMsg.message_type === 'private_note' || !dbMsg.external_id) {
      await supabase
        .from('chat_messages')
        .update({ content: cleanText })
        .eq('id', messageId)

      return NextResponse.json({ success: true, localOnly: true })
    }

    // Buscar canal da conversa para editar na UazAPI (/message/edit)
    const { data: conv } = await supabase
      .from('chat_conversations')
      .select('id, contact_phone, channel:chat_channels(name, instance_name, api_url, api_token, instance_token, provider)')
      .eq('id', dbMsg.conversation_id)
      .single()

    const channelData = (conv as any)?.channel
    const apiUrl = channelData?.api_url || 'https://mcs-chat.uazapi.com'
    const apiToken = channelData?.instance_token || channelData?.api_token

    if (apiUrl && apiToken && dbMsg.external_id) {
      await evolutionApi.editMessage({
        id: dbMsg.external_id,
        text: cleanText,
        apiUrl,
        apiToken
      })
    }

    await supabase
      .from('chat_messages')
      .update({ content: cleanText })
      .eq('id', messageId)

    // Se for a última mensagem da conversa, atualiza também o preview na barra lateral
    const { data: latestMsg } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('conversation_id', dbMsg.conversation_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestMsg && latestMsg.id === messageId) {
      await supabase
        .from('chat_conversations')
        .update({
          last_message_text: cleanText,
          last_message_preview: cleanText.slice(0, 140),
          updated_at: new Date().toISOString()
        })
        .eq('id', dbMsg.conversation_id)
    }

    return NextResponse.json({ success: true, newContent: cleanText })
  } catch (err: any) {
    console.error('Edit message error:', err)
    return NextResponse.json({ error: err.message || 'Erro ao editar mensagem' }, { status: 500 })
  }
}
