import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

export async function POST(req: NextRequest) {
  try {
    const { conversationId } = await req.json()

    if (!conversationId) return NextResponse.json({ error: "Missing parameters" }, { status: 400 })

    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select('tenant_id, contact_phone, contact_picture')
      .eq('id', conversationId)
      .single()

    if (convError || !conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 })

    // Se já tiver foto armazenada (e for uma URL de internet válida ou base64 grande), pode optar por retornar imediatamente,
    // mas fazemos refresh sempre que ativado pelo chat-area para garantir que mudou
    const API_URL = process.env.UAZ_API_URL
    const GLOBAL_KEY = process.env.UAZ_GLOBAL_KEY

    const { data: activeChannel } = await supabase
      .from('whatsapp_channels')
      .select('name')
      .eq('tenant_id', conv.tenant_id)
      .limit(1)
      .single()

    const instanceName = activeChannel?.name
    if (!instanceName) return NextResponse.json({ error: "No active channel" }, { status: 400 })

    const instancesUrl = `${API_URL}/instance/all`
    const activeInstancesReq = await fetch(instancesUrl, { headers: { "admintoken": GLOBAL_KEY! } })
    const uazInstancesList = await activeInstancesReq.json()
    
    let targetInstance = (Array.isArray(uazInstancesList) ? uazInstancesList : []).find((i: any) => i.name === instanceName) 
        || (Array.isArray(uazInstancesList) ? uazInstancesList : []).find((i: any) => i.status === 'connected')
    
    if (!targetInstance || !targetInstance.token) return NextResponse.json({ error: "No connected instance" }, { status: 400 })

    let picUrl = null;
    
    // Método UAZAPI Real (usado no MCS Chat)
    try {
        const fetchUrl = `${API_URL}/chat/details`
        const res = await fetch(fetchUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "token": targetInstance.token },
            body: JSON.stringify({ number: conv.contact_phone })
        })
        const data = await res.json()
        if (data && (data.image || data.profilePictureUrl || data.picture)) {
            picUrl = data.image || data.profilePictureUrl || data.picture
        }
    } catch(e) {
        console.warn("Falha no método UAZAPI", e)
    }
    
    // Fallback genérico / Evolution V1 GET endpoint
    if (!picUrl) {
       try {
           const fetchUrl2 = `${API_URL}/chat/fetchProfilePicture/${instanceName}?number=${conv.contact_phone}`
           const res2 = await fetch(fetchUrl2, {
               method: "GET",
               headers: { "apikey": GLOBAL_KEY! }
           })
           const data2 = await res2.json()
           if (data2 && (data2.profilePictureUrl || data2.picture || data2.url)) {
               picUrl = data2.profilePictureUrl || data2.picture || data2.url
           }
       } catch(e) {}
    }

    // Se encontramos a foto da UAZAPI (ou está vazio se contato oculta a foto)
    if (picUrl) {
        // Salva cache no banco
        await supabase.from('conversations').update({ contact_picture: picUrl }).eq('id', conversationId)
        return NextResponse.json({ success: true, picture: picUrl })
    }

    return NextResponse.json({ success: false, error: "Profile picture not found or restricted by user privacy." })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
