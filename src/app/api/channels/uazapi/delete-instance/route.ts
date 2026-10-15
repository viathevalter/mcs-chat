import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config"

export async function POST(req: NextRequest) {
  try {
    const { channelId } = await req.json()

    if (!channelId) {
      return NextResponse.json({ error: "O channelId é obrigatório." }, { status: 400 })
    }

    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    )

    // 1. Fetch Channel details
    const { data: channel, error: fetchErr } = await supabase
      .from('chat_channels')
      .select('*')
      .eq('id', channelId)
      .single()

    if (fetchErr || !channel) {
      return NextResponse.json({ error: "Canal não encontrado." }, { status: 404 })
    }

    // 2. Call UAZAPI DELETE /instance if token/url exists
    const apiUrl = channel.api_url || process.env.UAZ_API_URL
    const token = channel.instance_token || channel.api_token || process.env.UAZ_GLOBAL_KEY

    if (apiUrl && token) {
      try {
        const cleanUrl = apiUrl.replace(/\/$/, '')
        await fetch(`${cleanUrl}/instance`, {
          method: "DELETE",
          headers: {
            "token": token,
            "admintoken": token
          }
        })
      } catch (uazErr: any) {
        console.warn("Aviso ao deletar instância na UazAPI:", uazErr.message)
      }
    }

    // 3. Delete from database
    const { error: deleteErr } = await supabase
      .from('chat_channels')
      .delete()
      .eq('id', channelId)

    if (deleteErr) {
      return NextResponse.json({ error: "Erro ao excluir canal do banco: " + deleteErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Erro Delete Instance Route:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
