import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const { instanceName, tenantId, channelId } = await req.json()

    if (!instanceName || !tenantId || !channelId) {
      return NextResponse.json({ error: "Parâmetros 'instanceName', 'tenantId' ou 'channelId' ausentes." }, { status: 400 })
    }

    const API_URL = process.env.UAZ_API_URL
    const GLOBAL_KEY = process.env.UAZ_GLOBAL_KEY

    if (!API_URL || !GLOBAL_KEY) {
      return NextResponse.json({ error: "Credenciais da UAZ API não encontradas no servidor." }, { status: 500 })
    }

    // A UAZ API exige a Global Key via header na requisição administrativa
    const url = `${API_URL}/instance/create`
    const body = {
      instanceName: instanceName,
      token: "",
      qrcode: true,
      integration: "WHATSAPP-BAILEYS"
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "admintoken": GLOBAL_KEY
      },
      body: JSON.stringify(body)
    })

    const data = await response.json()

    if (!response.ok) {
        return NextResponse.json({ error: data.message || "Erro na UAZ API" }, { status: response.status })
    }

    // O retorno da API costuma trazer { instance: {...}, qrcode: { base64: "...", ... } }
    return NextResponse.json(data)
    
  } catch (error: any) {
    console.error("Erro UAZAPI Proxy:", error)
    return NextResponse.json({ error: "Erro interno ao provisionar API: " + error.message }, { status: 500 })
  }
}
