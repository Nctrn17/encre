import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Callback OAuth / magic link Supabase.
 *
 * Flow :
 *   1. User reçoit email → clique le lien Supabase
 *   2. Supabase redirige ici avec ?code=xxx
 *   3. On échange le code contre une session
 *   4. Redirect vers `next` (ou /aides par défaut)
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/aides'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error('[auth/callback] exchange failed:', error.message)
  }

  return NextResponse.redirect(`${origin}/connexion?error=auth`)
}
