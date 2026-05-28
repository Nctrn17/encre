import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

/**
 * Client Supabase navigateur · lit la session côté client.
 *
 * Sert uniquement à l'état d'auth cosmétique (nav connecté/déconnecté). Garder
 * cette lecture hors du root layout serveur évite d'opter toute l'app hors du
 * rendu statique/ISR - sinon chaque requête tape l'origine (X-Vercel-Cache:
 * MISS partout, TTFB/LCP dégradés). La protection réelle reste serveur (RLS +
 * guards), cet état n'est pas une frontière de sécurité.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY (browser client).',
    )
  }

  return createBrowserClient<Database>(url, key)
}
