import { NextResponse } from 'next/server'
import { checkCronSecret } from '@/lib/cron-auth'
import { runBroadcastCycle, runBroadcastPreviewTo } from '@/lib/digest/send-broadcast'
import { isoWeekdayInParis } from '@/lib/digest/weekday'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Déclencheur cron du broadcast waitlist (nouvelles opps aux inscrits sans veille).
 *
 * Cadence : hebdomadaire. La GitHub Action tourne tous les jours ; la route
 * s'auto-filtre au jour fixe (lundi, Europe/Paris) pour ne partir qu'une fois
 * par semaine — sauf `?force=1`.
 *
 * Auth : header `x-cron-secret`.
 *
 * Paramètres query :
 *   ?test=<email> → envoi de VALIDATION à cette seule adresse (n'écrit rien,
 *                   n'envoie à personne d'autre). Ignore le garde-fou de jour.
 *   ?force=1      → ignore le garde-fou de jour (envoi immédiat à tous)
 *   ?preview=1    → construit sans envoyer
 */
const BROADCAST_WEEKDAY = 1 // lundi
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  const unauthorized = checkCronSecret(request)
  if (unauthorized) return unauthorized

  const url = new URL(request.url)
  const preview = url.searchParams.get('preview') === '1'
  const force = url.searchParams.get('force') === '1'
  const test = url.searchParams.get('test')

  // Mode test : un seul mail de validation, indépendant du jour.
  if (test) {
    if (!EMAIL_RE.test(test)) {
      return NextResponse.json({ ok: false, error: 'Adresse test invalide' }, { status: 400 })
    }
    try {
      const result = await runBroadcastPreviewTo(test)
      return NextResponse.json({ ok: true, mode: 'test', result })
    } catch (err) {
      console.error('[cron/waitlist-broadcast] test failed:', err)
      return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
    }
  }

  const today = isoWeekdayInParis(new Date())
  if (!force && today !== BROADCAST_WEEKDAY) {
    return NextResponse.json({
      ok: true,
      skipped: 'not_broadcast_day',
      weekday: today,
      broadcast_weekday: BROADCAST_WEEKDAY,
    })
  }

  try {
    const result = await runBroadcastCycle({ preview })
    const { preview_payloads: _omit, ...publicResult } = result
    return NextResponse.json({ ok: true, result: publicResult })
  } catch (err) {
    console.error('[cron/waitlist-broadcast] failed:', err)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
