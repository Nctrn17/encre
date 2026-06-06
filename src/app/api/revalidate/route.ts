import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { checkCronSecret } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'

/**
 * Revalidation ISR à la demande, pour la curation.
 *
 * Auth : header `x-cron-secret` contre `CRON_SECRET` (même secret que les crons,
 * vérifié en temps constant via checkCronSecret).
 *
 * Usage :
 *   GET /api/revalidate?slug=mon-slug  → rafraîchit /aides ET /aides/mon-slug
 *   GET /api/revalidate                → rafraîchit seulement la liste /aides
 *
 * Permet de voir une fiche corrigée en quelques secondes sans rebuild complet.
 * /api est bloqué dans robots.txt, donc non indexable.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const denied = checkCronSecret(request)
  if (denied) return denied

  const slug = new URL(request.url).searchParams.get('slug')

  revalidatePath('/aides')

  if (slug) {
    if (!/^[a-z0-9-]{1,200}$/.test(slug)) {
      return NextResponse.json({ ok: false, error: 'slug invalide' }, { status: 400 })
    }
    revalidatePath(`/aides/${slug}`)
  }

  return NextResponse.json({
    ok: true,
    revalidated: slug ? ['/aides', `/aides/${slug}`] : ['/aides'],
  })
}
