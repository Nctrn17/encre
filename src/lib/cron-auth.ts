import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  // timingSafeEqual exige des longueurs égales ; on court-circuite proprement
  // sans introduire d'oracle de longueur exploitable au-delà de ce que révèle
  // déjà la réponse 401.
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Vérifie le header `x-cron-secret` contre `CRON_SECRET` en temps constant.
 *
 * Retourne une `NextResponse` 401/500 à renvoyer tel quel si l'auth échoue,
 * ou `null` si la requête est autorisée.
 */
export function checkCronSecret(request: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const provided = request.headers.get('x-cron-secret')
  if (!provided || !safeEqual(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
