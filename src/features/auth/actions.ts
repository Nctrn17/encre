'use server'

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { safeNext } from './safe-next'

const MagicLinkSchema = z.object({
  email: z.string().email().toLowerCase(),
  next: z.string().optional(),
})

export async function sendMagicLink(formData: FormData) {
  const parsed = MagicLinkSchema.safeParse({
    email: formData.get('email'),
    next: formData.get('next'),
  })

  if (!parsed.success) {
    return { error: 'Email invalide' }
  }

  const supabase = await createClient()
  const h = await headers()
  const origin = h.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:4000'

  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(safeNext(parsed.data.next))}`

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: true,
    },
  })

  if (error) {
    console.error('[auth] signInWithOtp:', error.message)
    return { error: "Impossible d'envoyer le lien. Réessayez dans quelques instants." }
  }

  return { ok: true, email: parsed.data.email }
}

const PasswordSignInSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(200),
  next: z.string().optional(),
})

/**
 * Connexion par mot de passe (alternative au magic link).
 * Suppose que l'utilisateur a déjà un mot de passe défini, soit via
 * Supabase Studio (Auth → Users → Update user), soit via le flow
 * password-recovery email.
 *
 * En cas de succès : redirect vers `next` (par défaut /aides).
 * En cas d'échec : retourne `{ error }` au formulaire.
 */
export async function signInWithPassword(formData: FormData) {
  const parsed = PasswordSignInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next'),
  })
  if (!parsed.success) {
    return { error: 'Email ou mot de passe invalide.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })
  if (error) {
    // Message générique pour ne pas révéler quels emails existent
    return { error: 'Email ou mot de passe incorrect.' }
  }

  redirect(safeNext(parsed.data.next))
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}
