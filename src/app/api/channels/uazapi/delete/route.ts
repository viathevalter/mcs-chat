import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  const origin = req.headers.get('origin') || '*'
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-tenant-id, admintoken',
    'Access-Control-Allow-Credentials': 'true',
  }

  try {
    const body = await req.json()
    const { messageId, externalId, instanceName } = body

    if (!messageId || !externalId) {
      return NextResponse.json({ error: "O ID da mensagem e o ID externo são obrigatórios" }, { status: 400, headers: corsHeaders })
    }

    const API_URL = process.env.EVOLUTION_API_URL || process.env.UAZ_API_URL
    const GLOBAL_KEY = process.env.EVOLUTION_API_KEY || process.env.UAZ_GLOBAL_KEY

    if (!API_URL || !GLOBAL_KEY) {
       console.error("Faltam variáveis da Evolution API no .env")
       return NextResponse.json({ error: "Configuração do Gateway Incompleta" }, { status: 500, headers: corsHeaders })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 1. Opcional - Excluir local se for private_note logo de cara sem bater na API
    const { data: dbMsg } = await supabase.from('chat_messages').select('message_type, tenant_id, conversation_id').eq('id', messageId).single()
    if (dbMsg?.message_type === 'private_note') {
        await supabase.from('chat_messages').delete().eq('id', messageId)
        return NextResponse.json({ success: true, localOnly: true }, { headers: corsHeaders })
    }

    // 2. Tentar deletar pela UAZ API
    let tgtInstanceName = instanceName
    let contactPhone = ""

    if (dbMsg?.tenant_id) {
       if (!tgtInstanceName) {
           const { data: channelData } = await supabase.from('chat_channels').select('name').eq('tenant_id', dbMsg.tenant_id).limit(1).single()
           if (channelData && channelData.name) {
               tgtInstanceName = channelData.name
           }
       }
       if (dbMsg?.conversation_id) {
           const { data: conv } = await supabase.from('chat_conversations').select('contact_phone').eq('id', dbMsg.conversation_id).single()
           if (conv?.contact_phone) contactPhone = conv.contact_phone
       }
    }

    if (!tgtInstanceName) tgtInstanceName = 'default'

    const instancesUrl = `${API_URL}/instance/all`
    const activeInstancesReq = await fetch(instancesUrl, {
      method: "GET",
      headers: { "admintoken": GLOBAL_KEY! },
      next: { revalidate: 300 }
    })
    
    if (!activeInstancesReq.ok) {
       throw new Error("Falha ao buscar instâncias vinculadas na UAZ API")
    }
    
    const uazInstancesList = await activeInstancesReq.json()
    let targetInstance = uazInstancesList.find((i: any) => i.name === tgtInstanceName)
    if (!targetInstance || !targetInstance.token) {
        targetInstance = uazInstancesList.find((i: any) => i.status === 'connected')
    }

    if (targetInstance && targetInstance.token) {
       let formattedId = externalId
       if (!formattedId.includes(':') && contactPhone) {
           const ownerStr = contactPhone.includes('@') ? contactPhone : `${contactPhone}@s.whatsapp.net`
           formattedId = `${ownerStr}:${externalId}`
       }

       const uazDeleteReq = await fetch(`${API_URL}/message/delete`, {
           method: "POST",
           headers: {
             "Content-Type": "application/json",
             "token": targetInstance.token
           },
           body: JSON.stringify({
              id: formattedId,
              number: contactPhone // fallback property que varias apis baseadas no baileys pedem
           })
       })

       if (!uazDeleteReq.ok) {
           const errorData = await uazDeleteReq.text()
           console.error("Erro na UAZ ao deletar:", errorData)
           return NextResponse.json({ error: `UAZ API falhou ao deletar: ${errorData}` }, { status: 400, headers: corsHeaders })
       }
    }

    // 3. Atualizar no banco Supabase
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

export async function OPTIONS(req: Request) {
  const origin = req.headers.get('origin') || '*'
  return new NextResponse('OK', {
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-tenant-id, admintoken',
      'Access-Control-Allow-Credentials': 'true',
    }
  })
}
