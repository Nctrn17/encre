import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Proxy (ex-middleware, renommé en Next.js 16).
 * Rafraîchit la session Supabase à chaque requête.
 *
 * No-op si NEXT_PUBLIC_SUPABASE_URL / ANON_KEY absent — permet de lancer
 * le site en dev sans config complète.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Guard : pas de Supabase configuré → skip auth refresh
  if (!url || !key) {
    return response
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        )
      },
    },
  })

  await supabase.auth.getUser()
  return response
}

export const config = {
  matcher: [
    /*
     * Match tout sauf :
     * - _next/static (assets statiques)
     * - _next/image (optimization images)
     * - favicon / OG images
     * - robots.txt / sitemap.xml
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
