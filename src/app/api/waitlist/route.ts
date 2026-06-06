import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { WaitlistSignupSchema } from '@/lib/pipeline/schemas'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { sendWaitlistWelcome } from '@/lib/email/welcome'

export const runtime = 'nodejs'

// 5 inscriptions par IP et par 10 minutes : large pour un usage normal, ferme
// contre le flood et l'énumération.
const WAITLIST_RATE_LIMIT = 5
const WAITLIST_RATE_WINDOW_MS = 10 * 60 * 1000

export async function POST(request: Request) {
  const { ok, retryAfter } = rateLimit(
    `waitlist:${getClientIp(request)}`,
    WAITLIST_RATE_LIMIT,
    WAITLIST_RATE_WINDOW_MS,
  )
  if (!ok) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = WaitlistSignupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Adresse email invalide.' },
      { status: 400 },
    )
  }

  try {
    const supabase = createServiceClient()

    // Nouveau vs déjà inscrit : on n'envoie le mail de bienvenue qu'aux
    // nouveaux. Le formulaire upsert (MAJ des préférences à chaque envoi), donc
    // sans ce pré-check on souhaiterait la bienvenue à chaque re-soumission.
    const { data: existing } = await supabase
      .from('waitlist')
      .select('email')
      .eq('email', parsed.data.email)
      .maybeSingle()
    const isNewSignup = !existing

    const { error } = await supabase.from('waitlist').upsert(
      {
        email: parsed.data.email,
        disciplines: parsed.data.disciplines,
        region_codes: parsed.data.region_codes,
        source: parsed.data.source ?? null,
      },
      { onConflict: 'email' },
    )

    if (error) {
      console.error('[waitlist] Supabase error:', error.message)
      return NextResponse.json(
        { error: 'Enregistrement impossible pour le moment. Réessayez dans un instant.' },
        { status: 500 },
      )
    }

    if (isNewSignup) {
      // Non bloquant : un échec d'email ne doit pas faire échouer l'inscription.
      try {
        await sendWaitlistWelcome(parsed.data.email)
      } catch (e) {
        console.error('[waitlist] mail de bienvenue échoué:', (e as Error).message)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[waitlist] Fatal:', err)
    return NextResponse.json(
      { error: 'Une erreur est survenue. Réessayez dans un instant.' },
      { status: 500 },
    )
  }
}
