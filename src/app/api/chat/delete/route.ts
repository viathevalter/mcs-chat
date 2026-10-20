import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionApi } from '@/lib/whatsapp/evolution-api'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, token, apikey',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function POST(req: Request) {
  try {
    const { messageId, externalId } = await req.json()

    if (!messageId) {
      return NextResponse.json({ error: "O ID da mensagem é obrigatório" }, { status: 400, headers: corsHeaders })
    }

    const supabase = createAdminClient()

    const { data: dbMsg } = await supabase
      .from('chat_messages')
      .select('id, external_id, message_type, conversation_id')
      .eq('id', messageId)
      .single()

    if (!dbMsg) {
      return NextResponse.json({ error: "Mensagem não encontrada no banco" }, { status: 404, headers: corsHeaders })
    }

    // Se for nota interna, só excluir do banco e retornar
    if (dbMsg.message_type === 'private_note' || dbMsg.message_type === 'internal_note') {
      await supabase.from('chat_messages').delete().eq('id', messageId)
      return NextResponse.json({ success: true, localOnly: true }, { headers: corsHeaders })
    }

    // Puxar detalhes do canal pra essa conversa
    const { data: conv } = await supabase
      .from('chat_conversations')
      .select('contact_phone, channel:chat_channels(name, instance_name, api_url, api_token, instance_token, provider)')
      .eq('id', dbMsg.conversation_id)
      .single()

    const channelData = (conv as any)?.channel
    const instanceName = channelData?.instance_name || channelData?.name
    const apiUrl = channelData?.api_url || 'https://mcs-chat.uazapi.com'
    const apiToken = channelData?.instance_token || channelData?.api_token
    const provider = channelData?.provider || 'uazapi'
    const targetExtId = dbMsg.external_id || externalId

    if (apiUrl && apiToken && instanceName && targetExtId && !String(targetExtId).startsWith('sync_')) {
      try {
        await evolutionApi.deleteMessage({
          id: targetExtId,
          number: conv?.contact_phone || '',
          instanceName,
          apiUrl,
          apiToken,
          provider
        })
      } catch (apiError: any) {
        console.warn("Aviso na API UazAPI ao deletar:", apiError?.message)
      }
    }

    // Atualizar no banco Supabase
    await supabase
      .from('chat_messages')
      .update({
        content: '🚫 Mensagem apagada',
        status: 'deleted'
      })
      .eq('id', messageId)

    // Se era a última mensagem da conversa, atualizar preview na barra lateral
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
          last_message_text: '🚫 Mensagem apagada',
          last_message_preview: '🚫 Mensagem apagada',
          updated_at: new Date().toISOString()
        })
        .eq('id', dbMsg.conversation_id)
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders })
  } catch (err: any) {
    console.error("DeleteMsg Error:", err)
    return NextResponse.json({ error: err.message || "Erro interno ao apagar mensagem" }, { status: 500, headers: corsHeaders })
  }
}
