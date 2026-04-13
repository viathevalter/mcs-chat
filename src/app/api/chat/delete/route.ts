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

    if (!messageId || !externalId) {
      return NextResponse.json({ error: "O ID da mensagem e o ID externo são obrigatórios" }, { status: 400, headers: corsHeaders })
    }

    const supabase = createAdminClient()

    // Get the message and its conversation to fetch the channel info
    const { data: dbMsg } = await supabase
      .from('chat_messages')
      .select('message_type, conversation_id')
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
    const { data: conv, error: convError } = await supabase
      .from('chat_conversations')
      .select('contact_phone, channel:chat_channels(name, api_url, api_token, provider)')
      .eq('id', dbMsg.conversation_id)
      .single()

    if (convError || !conv) {
      return NextResponse.json({ error: "Conversa não encontrada para determinar o canal" }, { status: 404, headers: corsHeaders })
    }

    const channelData = conv.channel as any
    const instanceName = channelData?.name
    const apiUrl = channelData?.api_url
    const apiToken = channelData?.api_token
    const provider = channelData?.provider || 'evolution'

    if (!apiUrl || !apiToken || !instanceName) {
       console.error("Credenciais do canal ausentes no banco para exclusão externa")
    } else {
       // Disparar requisição de deleção para a UAZ API ou Evolution
       try {
         await evolutionApi.deleteMessage({
             id: externalId,
             number: conv.contact_phone,
             instanceName,
             apiUrl,
             apiToken,
             provider
         });
       } catch (apiError: any) {
         console.error("Erro na API (UAZ/Evolution) ao deletar:", apiError);
         return NextResponse.json({ error: `Falha ao deletar externamente: ${apiError.message}` }, { status: 400, headers: corsHeaders })
       }
    }

    // Atualizar no banco Supabase
    await supabase.from('chat_messages').update({ 
       content: '🚫 Mensagem apagada',
       status: 'deleted'
    }).eq('id', messageId)

    return NextResponse.json({ success: true }, { headers: corsHeaders })

  } catch (err: any) {
    console.error("DeleteMsg Error:", err)
    return NextResponse.json({ error: err.message || "Erro interno ao apagar mensagem" }, { status: 500, headers: corsHeaders })
  }
}
