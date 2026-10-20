import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config"

export async function POST(req: NextRequest) {
  try {
    const { instanceName, phoneNumber, companyId, companyName, channelType, displayLabel, departmentId, aiAgentId, apiUrl, apiToken } = await req.json()

    if (!instanceName) {
      return NextResponse.json({ error: "Nome da instância é obrigatório." }, { status: 400 })
    }

    const cleanInstanceName = instanceName.trim()
    const UAZ_API_URL = (apiUrl || process.env.UAZ_API_URL || "https://mcs-chat.uazapi.com").replace(/\/$/, '')
    const providedToken = (apiToken || "").trim()
    const UAZ_GLOBAL_KEY = process.env.UAZ_GLOBAL_KEY || process.env.UAZ_ADMIN_TOKEN || ""

    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    )

    let qrcodeBase64 = null
    let instanceToken: string | null = providedToken || null
    let instanceStatus = "connected"
    let detectedPhone: string | null = phoneNumber ? String(phoneNumber).replace(/\D/g, '') : null

    // 1. Se tivermos o token da instância, verificar status diretamente na UazAPI (/instance/status)
    if (instanceToken) {
      try {
        const stRes = await fetch(`${UAZ_API_URL}/instance/status`, {
          method: "GET",
          headers: { token: instanceToken }
        })
        if (stRes.ok) {
          const stData = await stRes.json()
          const st = stData?.instance?.status || stData?.status
          if (st) instanceStatus = st === 'open' ? 'connected' : st
          if (!detectedPhone && stData?.instance?.owner) {
            detectedPhone = String(stData.instance.owner).replace(/\D/g, '')
          }
        }
      } catch (e: any) {
        console.warn("Aviso ao checar status da instância na UazAPI:", e.message)
      }
    } else if (UAZ_GLOBAL_KEY) {
      // 2. Se houver admintoken global configurado, buscar a instância ativa pelo nome em /instance/all
      try {
        const allRes = await fetch(`${UAZ_API_URL}/instance/all`, {
          method: "GET",
          headers: { admintoken: UAZ_GLOBAL_KEY }
        })
        if (allRes.ok) {
          const list = await allRes.json()
          if (Array.isArray(list)) {
            const found = list.find((i: any) => String(i.name || '').toLowerCase() === cleanInstanceName.toLowerCase())
            if (found) {
              instanceToken = found.token || null
              instanceStatus = found.status === 'open' || found.status === 'connected' ? 'connected' : (found.status || 'connected')
              if (!detectedPhone && found.owner) {
                detectedPhone = String(found.owner).replace(/\D/g, '')
              }
            }
          }
        }
      } catch (e: any) {
        console.warn("Aviso ao consultar /instance/all na UazAPI:", e.message)
      }
    }

    const resolvedChannelType = channelType || 'workers'
    const resolvedDisplayLabel = displayLabel || (
      companyName
        ? `${companyName.toUpperCase()} • ${resolvedChannelType === 'clients' ? 'Clientes' : resolvedChannelType === 'general' ? 'Geral' : 'Trabalhadores'}`
        : cleanInstanceName
    )

    // Insert or Update chat_channels
    const { data: channel, error: dbError } = await supabase
      .from('chat_channels')
      .insert({
        name: cleanInstanceName,
        phone_number: detectedPhone,
        company_id: companyId || null,
        company_name: companyName || null,
        channel_type: resolvedChannelType,
        display_label: resolvedDisplayLabel,
        department_id: departmentId || null,
        ai_agent_id: aiAgentId || null,
        instance_name: cleanInstanceName,
        instance_token: instanceToken,
        qrcode_base64: qrcodeBase64,
        status: instanceStatus,
        is_active: true,
        provider: 'uazapi',
        api_url: UAZ_API_URL,
        api_token: instanceToken || UAZ_GLOBAL_KEY || null
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
