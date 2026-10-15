import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config"

export async function POST(req: NextRequest) {
  try {
    const { instanceName, companyId, companyName, departmentId, aiAgentId, apiUrl, apiToken } = await req.json()

    if (!instanceName) {
      return NextResponse.json({ error: "Nome da instância é obrigatório." }, { status: 400 })
    }

    const UAZ_API_URL = apiUrl || process.env.UAZ_API_URL || "https://uazapi.gestaologinpro.com"
    const UAZ_GLOBAL_KEY = apiToken || process.env.UAZ_GLOBAL_KEY || process.env.UAZ_ADMIN_TOKEN || ""

    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    )

    // Call UAZAPI to initialize instance
    const cleanUrl = UAZ_API_URL.replace(/\/$/, '')
    const uazInitUrl = `${cleanUrl}/instance/init`

    const body = {
      instanceName: instanceName.trim().replace(/\s+/g, '-').toLowerCase(),
      token: "",
      qrcode: true,
      integration: "WHATSAPP-BAILEYS"
    }

    let qrcodeBase64 = null
    let instanceToken = null
    let instanceStatus = "disconnected"

    try {
      const response = await fetch(uazInitUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "admintoken": UAZ_GLOBAL_KEY
        },
        body: JSON.stringify(body)
      })

      if (response.ok) {
        const uazData = await response.json()
        qrcodeBase64 = uazData?.qrcode?.base64 || uazData?.base64 || null
        instanceToken = uazData?.instance?.token || uazData?.token || null
        instanceStatus = uazData?.instance?.status || "connecting"
      }
    } catch (e: any) {
      console.warn("UAZ API init call error, saving channel in database:", e.message)
    }

    // Insert or Update chat_channels
    const { data: channel, error: dbError } = await supabase
      .from('chat_channels')
      .insert({
        name: instanceName,
        company_id: companyId || null,
        company_name: companyName || null,
        department_id: departmentId || null,
        ai_agent_id: aiAgentId || null,
        instance_name: instanceName,
        instance_token: instanceToken,
        qrcode_base64: qrcodeBase64,
        status: instanceStatus,
        is_active: true,
        api_url: cleanUrl,
        api_token: UAZ_GLOBAL_KEY
      })
      .select('*')
      .single()

    if (dbError) {
      console.error("DB Channel Insert Error:", dbError)
      return NextResponse.json({ error: "Erro ao salvar canal no banco: " + dbError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, channel, qrcode: qrcodeBase64 })
  } catch (error: any) {
    console.error("Erro Instance Route:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
