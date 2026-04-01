import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { evolutionApi } from '@/lib/whatsapp/evolution-api'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const conversationId = searchParams.get('conversationId')
    
    if (!conversationId) {
      return NextResponse.json({ error: 'Conversation ID required' }, { status: 400 })
    }

    const { data: conv, error } = await supabase
      .from('chat_conversations')
      .select('*, channel:chat_channels(name, api_url, api_token, provider)')
      .eq('id', conversationId)
      .single()

    if (error || !conv || !conv.channel) {
      return NextResponse.json({ error: 'Conversation or channel not found' }, { status: 404 })
    }

    const fetchedAvatar = await evolutionApi.fetchProfilePictureUrl({
      number: conv.contact_phone + '@s.whatsapp.net',
      instanceName: conv.channel.name,
      apiUrl: conv.channel.api_url,
      apiToken: conv.channel.api_token,
      provider: conv.channel.provider
    })

    if (fetchedAvatar) {
      await supabase.from('chat_conversations')
        .update({ contact_avatar_url: fetchedAvatar })
        .eq('id', conv.id)
      
      return NextResponse.json({ url: fetchedAvatar })
    }

    return NextResponse.json({ message: 'No avatar returned from provider' })

  } catch (error: any) {
    console.error('[sync-avatar] error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
