import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const access_token = requestUrl.searchParams.get('access_token')
  const refresh_token = requestUrl.searchParams.get('refresh_token')

  if (!access_token || !refresh_token) {
    return NextResponse.redirect(new URL('/?error=missing_tokens', request.url))
  }

  const cookieStore = await cookies()
  const redirectTarget = new URL('/inbox', request.url)
  const response = NextResponse.redirect(redirectTarget)

  try {
    const supabase = createServerClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options)
                response.cookies.set(name, value, options)
              })
            } catch (error) {
              // Server component context
            }
          },
        },
      }
    )

    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    })

    if (!error && data?.session) {
      return response
    }
  } catch (err) {
    console.error('SSO server session exception:', err)
  }

  // Fallback para autenticação no cliente se os cookies do servidor falharem
  const clientFallback = new URL('/', request.url)
  clientFallback.searchParams.set('access_token', access_token)
  clientFallback.searchParams.set('refresh_token', refresh_token)
  return NextResponse.redirect(clientFallback)
}
