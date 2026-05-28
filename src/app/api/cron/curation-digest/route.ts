import { NextResponse } from 'next/server'
import { getCurationQueues, queuesHaveContent } from '@/features/curation/queues'
import { renderCurationDigest, sendCurationDigest } from '@/features/curation/digest'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Déclencheur cron pour le digest curation hebdo (samedi 8 h Paris).
 *
 * Auth : header `x-cron-secret`.
 *
 * Paramètres query :
 *   ?preview=1 → ne fait QUE construire le digest, pas d'envoi (debug)
 *
 * Réponse :
 *   { ok, sent: boolean, totals: {...}, skip_reason? }
 *
 * Branché à GitHub Actions scheduled workflow .github/workflows/curation-digest.yml.
 */
export async function POST(request: Request) {
  const secret = request.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const preview = url.searchParams.get('preview') === '1'

  try {
    const q = await getCurationQueues()
    const totals = {
      awaiting: q.awaitingDetails.length,
      partial: q.partialExtraction.length,
      expired: q.expired.length,
      new_week: q.newThisWeek.length,
    }

    if (!queuesHaveContent(q)) {
      return NextResponse.json({
        ok: true,
        sent: false,
        skip_reason: 'queues_empty',
        totals,
      })
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? request.headers.get('origin') ?? 'https://encre.io'
    const digest = renderCurationDigest(q, { siteUrl })

    if (preview) {
      return NextResponse.json({
        ok: true,
        sent: false,
        skip_reason: 'preview_mode',
        totals,
        subject: digest.subject,
        text_preview: digest.text.slice(0, 2000),
      })
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        ok: false,
        sent: false,
        error: 'RESEND_API_KEY missing',
        totals,
      }, { status: 500 })
    }

    const to = process.env.CURATION_DIGEST_TO
    if (!to) {
      return NextResponse.json({ ok: false, error: 'CURATION_DIGEST_TO not configured' }, { status: 500 })
    }
    const from = process.env.RESEND_FROM_EMAIL
    await sendCurationDigest(digest, { to, apiKey, from })

    return NextResponse.json({ ok: true, sent: true, to, totals })
  } catch (err) {
    const msg = (err as Error).message
    console.error('[curation-digest]', msg)
    return NextResponse.json({ ok: false, error: msg.slice(0, 300) }, { status: 500 })
  }
}
