import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
     persistSession: false,
     autoRefreshToken: false,
  }
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, token, apikey',
}

export async function OPTIONS(req: NextRequest) {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function POST(req: NextRequest) {
  try {
    const { conversationId, text, senderId, messageType, mediaUrl, base64Media, quotedMessageId } = await req.json()

    if (!conversationId || (!text && messageType !== 'audio' && messageType !== 'ptt')) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
    }

    // 1. Fetch Conversation Context
    const { data: conv, error: convError } = await supabase
      .from('chat_conversations')
      .select('tenant_id, contact_phone')
      .eq('id', conversationId)
      .single()

    if (convError || !conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
    }

    const { tenant_id, contact_phone } = conv

    const API_URL = process.env.UAZ_API_URL
    const GLOBAL_KEY = process.env.UAZ_GLOBAL_KEY

    // Descobrir a Instância do WhatsApp ativa deste Tenant
    const { data: activeChannel } = await supabase
      .from('chat_channels')
      .select('name')
      .eq('tenant_id', tenant_id)
      .limit(1)
      .single()

    const instanceName = activeChannel?.name

    if (!instanceName) {
      return NextResponse.json({ error: "Nenhum canal ativo encontrado para este Tenant." }, { status: 400 })
    }

    // 1.5 Interceptação para Private Notes
    if (messageType === 'private_note') {
       const newMsg = {
           tenant_id: tenant_id,
           conversation_id: conversationId,
           direction: 'outbound',
           status: 'sent',
           content: text,
           sender_user_id: senderId || null,
           message_type: 'private_note'
       }
       const { error: msgErr } = await supabase.from('chat_messages').insert(newMsg)
       if (msgErr) throw new Error("Erro ao salvar nota privada: " + msgErr.message)
       
       // Atualiza Last Message At da conversa
       await supabase.from('chat_conversations').update({ 
           last_message_at: new Date().toISOString(),
           updated_at: new Date().toISOString()
       }).eq('id', conversationId)

       return NextResponse.json({ success: true, delivered: false, note: "Private Note Saved" }, { headers: corsHeaders })
    }

    // 2. Disparar via UAZ API 
    // Nova Lógica: Auto-discovery do Token da Instância
    const instancesUrl = `${API_URL}/instance/all`
    const activeInstancesReq = await fetch(instancesUrl, {
      method: "GET",
      headers: { "admintoken": GLOBAL_KEY! },
      next: { revalidate: 300 } // Magia Negra do Vercel Cache (5 min)
    })
    
    if (!activeInstancesReq.ok) {
       throw new Error("Falha ao buscar instâncias vinculadas na UAZ API. Verifique sua chave Global.")
    }
    
    const uazInstancesList = await activeInstancesReq.json()
    // 1ª Estratégia de busca: Pelo Nome Estrito gravado no banco de dados
    let targetInstance = uazInstancesList.find((i: any) => i.name === instanceName)
    
    // 2ª Estratégia Falha Segura (Fallback): Procura a primeira máquina "Verde/Conectada"
    if (!targetInstance || !targetInstance.token) {
        targetInstance = uazInstancesList.find((i: any) => i.status === 'connected')
    }
    
    if (!targetInstance || !targetInstance.token) {
       throw new Error(`Nenhuma instância conectada correspondente a '${instanceName}' encontrou autorização na UAZ. (Scanner Offline?)`)
    }

    const instanceToken = targetInstance.token

    let sendUrl = `${API_URL}/send/text`
    let body: any = {
      number: contact_phone,
      delay: 0
    }

    if (quotedMessageId) {
        body.replyid = quotedMessageId; // Padrão UAZ API
    }

    if (messageType === 'audio' || messageType === 'ptt') {
       sendUrl = `${API_URL}/send/media`
       body.type = 'ptt' // garante que chega como audio gravado
       body.file = mediaUrl || base64Media
       body.presence = 'recording'
    } else if (messageType === 'image' || messageType === 'video' || messageType === 'document') {
       sendUrl = `${API_URL}/send/media`
       body.type = messageType // <- Adicionado tipo (vital para API UAZ)
       body.file = mediaUrl || base64Media
       body.fileName = text || 'arquivo_anexo'
    } else {
       body.text = text
       body.linkPreview = false
    }

    const uazResponse = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": instanceToken
      },
      body: JSON.stringify(body)
    })

    const uazData = await uazResponse.json()

    if (!uazResponse.ok) {
        throw new Error(uazData.message || uazData.response?.message || "Erro fatal ao enviar para UAZ API")
    }

    // 3. Salvar na Tabela Messages Confirmando o Envio
    const externalMsgId = uazData?.key?.id || uazData?.message?.key?.id || uazData?.data?.key?.id || uazData?.id || uazData?.messageId || null;

    const newMsg = {
        tenant_id: tenant_id,
        conversation_id: conversationId,
        direction: 'outbound',
        status: 'sent',
        content: (messageType !== 'text' && messageType !== 'private_note') ? (mediaUrl || 'Mídia Enviada') : text,
        sender_user_id: senderId || null,
        message_type: messageType || 'text',
        sender_type: req.headers.get('x-sender-type') || 'human', // permitindo injeção de metadata
        external_id: externalMsgId,
        quoted: quotedMessageId || null
    }

    const { error: msgErr } = await supabase.from('chat_messages').insert(newMsg)
    
    if (msgErr) {
        console.error("Message persisted error:", msgErr)
        throw new Error("A mensagem enviou para UAZ, mas não pôde ser salva no Banco de Dados: " + msgErr.message)
    }

    // Atualiza Last Message At da conversa
    await supabase.from('chat_conversations').update({ 
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }).eq('id', conversationId)

    return NextResponse.json({ success: true, delivered: true, data: uazData }, { headers: corsHeaders })
    
  } catch (error: any) {
    console.error("UAZAPI Send Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
  }
}
