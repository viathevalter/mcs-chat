import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { evolutionApi } from '@/lib/whatsapp/evolution-api'

export async function POST(request: Request) {
  try {
    const { phone, channelId } = await request.json()

    if (!phone || !channelId) {
      return NextResponse.json({ error: 'Missing phone or channelId' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      }
    )

    // Verify auth
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get channel
    const { data: channel, error: channelError } = await supabase
      .from('chat_channels')
      .select('*')
      .eq('id', channelId)
      .eq('is_active', true)
      .single()

    if (channelError || !channel) {
      return NextResponse.json({ error: 'Channel not found or inactive' }, { status: 404 })
    }

    // Call evolutionApi to check the number
    let result = await evolutionApi.checkNumber({
      number: phone,
      instanceName: channel.provider_instance_name,
      apiUrl: channel.provider_api_url,
      apiToken: channel.provider_api_token,
      provider: channel.provider
    })

    // Brazilian 9th digit fallback logic
    if (!result.exists && phone.startsWith('55')) {
      let altPhone = null;
      
      // If it has 12 digits (55 + 2 DDD + 8 NUM), it's missing the 9. Add the 9.
      if (phone.length === 12) {
        altPhone = phone.slice(0, 4) + '9' + phone.slice(4);
      } 
      // If it has 13 digits (55 + 2 DDD + 9 + 8 NUM), try without the 9.
      else if (phone.length === 13 && phone[4] === '9') {
        altPhone = phone.slice(0, 4) + phone.slice(5);
      }

      if (altPhone) {
        console.log(`[check-number] Checking alt phone ${altPhone} for ${phone}`);
        const altResult = await evolutionApi.checkNumber({
          number: altPhone,
          instanceName: channel.provider_instance_name,
          apiUrl: channel.provider_api_url,
          apiToken: channel.provider_api_token,
          provider: channel.provider
        })
        if (altResult.exists) {
          result = altResult;
        }
      }
    }

    // Add debug context
    console.log(`[check-number] Final result for ${phone}:`, result);
    return NextResponse.json(result)

  } catch (error: any) {
    console.error('Error checking number:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
