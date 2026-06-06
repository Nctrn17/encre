import { NextResponse } from 'next/server'
import { checkCronSecret } from '@/lib/cron-auth'
import { processRawBatch } from '@/lib/pipeline/process-raw'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 min max (Vercel Pro requis pour >60s)

/**
 * Trigger manuel du pipeline de traitement.
 *
 * Auth via header `x-cron-secret` (partagé avec GitHub Actions et pg_cron).
 *
 * POST / : traite un batch de 50 items
 * POST /?batch=100 : traite un batch customisé
 */
export async function POST(request: Request) {
  const unauthorized = checkCronSecret(request)
  if (unauthorized) return unauthorized

  const url = new URL(request.url)
  const batchSize = Math.min(Number.parseInt(url.searchParams.get('batch') ?? '50', 10), 200)

  try {
    const result = await processRawBatch(batchSize)
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    console.error('[cron/process-raw] failed:', err)
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}

