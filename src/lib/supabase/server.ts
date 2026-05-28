import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient as createRawClient } from '@supabase/supabase-js'
import type { Database } from './types'

/**
 * Client Supabase côté serveur (Server Components, Server Actions, Route Handlers).
 * Respecte la session utilisateur via les cookies.
 */
export async function createClient() {
  const cookieStore = await cookies()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY (server client).',
    )
  }

  return createServerClient<Database>(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // En Server Component, `set` est bloqué - ignoré
          }
        },
      },
    },
  )
}

/**
 * Client public · ANON key, sans cookies.
 *
 * À utiliser quand on lit des données publiques depuis un contexte
 * non-HTTP (build time, generateStaticParams, generateMetadata des
 * pages statiques, sitemap, etc.). RLS respecté : seules les lignes
 * accessibles à l'anon role sont retournées.
 *
 * Différence avec createClient() : pas de cookies (impossible au build),
 * donc pas de session utilisateur. Pour les données purement publiques.
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY (public client).',
    )
  }

  return createRawClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

/**
 * Client service_role · bypass RLS.
 * À utiliser UNIQUEMENT côté serveur dans des contextes contrôlés :
 *   - Edge Functions
 *   - API routes cron protégées par CRON_SECRET
 *   - Admin actions
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SERVICE_ROLE_KEY')
  }

  return createRawClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
