import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const access_token = requestUrl.searchParams.get('access_token')
  const refresh_token = requestUrl.searchParams.get('refresh_token')

  if (access_token && refresh_token) {
    const cookieStore = await cookies()
    // Prepare the success response early to attach cookies directly to it
    const response = NextResponse.redirect(`${requestUrl.origin}/inbox`)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                // Update Next.js cookie store
                cookieStore.set(name, value, options)
                // Also forcefully attach to the redirect response
                response.cookies.set(name, value, options)
              })
            } catch (error) {
              // Ignored from a server component
            }
          },
        },
      }
    )

    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    })

    if (error) {
      console.error('SSO Error:', error.message)
      return NextResponse.redirect(`${requestUrl.origin}/?error=sso_failed`)
    }

    return response
  }

  // Fallback
  return NextResponse.redirect(`${requestUrl.origin}/?error=missing_tokens`)
}
