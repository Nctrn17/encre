import { NextResponse } from 'next/server'
import { checkCronSecret } from '@/lib/cron-auth'
import { runDigestCycle } from '@/lib/digest/send-digests'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Déclencheur cron d'envoi des digests.
 *
 * Auth : header `x-cron-secret`.
 *
 * Paramètres query :
 *   ?frequency=weekly          → filtre les profils par fréquence (default: weekly)
 *   ?preview=1                 → ne fait QUE construire les digests, pas d'envoi
 *
 * Réponse :
 *   { ok, result: { total_profiles, emails_sent, skipped_empty, errors, preview_mode } }
 *
 * À brancher à pg_cron (Supabase Pro) ou à GitHub Actions scheduled workflow.
 */
export async function POST(request: Request) {
  const unauthorized = checkCronSecret(request)
  if (unauthorized) return unauthorized

  const url = new URL(request.url)
  const frequencyParam = url.searchParams.get('frequency')
  const preview = url.searchParams.get('preview') === '1'

  const frequencies: Array<'daily' | 'weekly' | 'deadline_only'> = frequencyParam
    ? [frequencyParam as 'daily' | 'weekly' | 'deadline_only']
    : ['weekly'] // par défaut on ne traite que les hebdo (cadence par défaut)

  try {
    const result = await runDigestCycle({ preview, frequencies })
    // Ne renvoyer que les métadonnées, pas les preview_payloads (volumineux)
    const { preview_payloads: _, ...publicResult } = result
    return NextResponse.json({ ok: true, result: publicResult })
  } catch (err) {
    console.error('[cron/send-digests] failed:', err)
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}
