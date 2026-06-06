#!/usr/bin/env tsx
/**
 * Traite les fiches vivantes dont la `deadline` vient de passer, en aiguillant
 * selon qu'une session suivante est DÉJÀ connue ou non.
 *
 * Deux cas, deux signaux distincts (cf. discussion 2026-05-29) :
 *
 *   1. Une clôture FUTURE reste dans le `calendrier` (aide multi-sessions
 *      dont la prochaine date est déjà publiée, ex « Soutien au scénario » :
 *      juin / septembre / novembre). → ALERTE « re-date à la session suivante »
 *      par email. On ne réécrit PAS la date (parser fragile) : l'humain pose
 *      la bonne à la main.
 *
 *   2. Aucune date future dans le calendrier (aide annuelle dont la prochaine
 *      édition n'est pas encore annoncée, ex « Beaumarchais court métrage »).
 *      → BASCULE en `awaiting_details`. Inutile d'alerter maintenant : les
 *      dates n'existent pas encore. C'est `recheck-awaiting-details.ts` qui
 *      surveille alors la source chaque semaine et alerte À LA RÉOUVERTURE,
 *      quand de nouvelles dates apparaissent. C'est le bon moment pour agir.
 *
 * Pourquoi c'est sûr : on ne touche que des fiches DÉJÀ cachées du registre
 * (deadline passée). La bascule case 2 ne fait que changer un STATUT (pas de
 * date devinée) et enrôle la fiche dans la surveillance source. Même si le
 * parser rate une date future réelle (case mal classée en 2), le recheck
 * rattrape : il la détectera sur la page source et alertera à la réouverture.
 * Dégradation gracieuse, jamais de disparition silencieuse.
 *
 * Usage :
 *   npx tsx scripts/process-expired-deadlines.ts                # dry-run
 *   npx tsx scripts/process-expired-deadlines.ts --apply        # bascule case 2
 *   npx tsx scripts/process-expired-deadlines.ts --apply --send # + email case 1
 *
 * Env requis : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Email (optionnel) : RESEND_API_KEY, RESEND_FROM_EMAIL, RECHECK_NOTIFY_TO.
 */
import { loadEnv } from '../scrapers/lib/load-env'
loadEnv()
import { createClient } from '@supabase/supabase-js'
import { nextDeadline } from '../scrapers/lib/calendar-dates'

interface Redate {
  title: string
  slug: string
  sourceUrl: string
  passedOn: string
  nextSession: string
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const send = process.argv.includes('--send')
  console.log(`🗓  Traitement des deadlines passées · ${apply ? 'APPLY' : 'DRY-RUN'}`)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ env Supabase manquant (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
    process.exit(1)
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const now = new Date()
  const { data, error } = await supabase
    .from('opportunities')
    .select('id, title, slug, source_url, deadline, calendrier')
    .eq('is_published', true)
    .is('next_edition_status', null)
    .not('deadline', 'is', null)
    .lt('deadline', now.toISOString())
  if (error) {
    console.error('❌ requête Supabase :', error.message)
    process.exit(1)
  }

  const rows = (data ?? []) as Array<{
    id: string; title: string; slug: string; source_url: string
    deadline: string; calendrier: string[] | null
  }>

  const toRedate: Redate[] = []
  const toMonitor: Array<{ id: string; title: string; slug: string }> = []
  let errors = 0

  for (const o of rows) {
    const next = o.calendrier ? nextDeadline(o.calendrier, now) : null
    if (next) {
      // Case 1 : prochaine session déjà connue → à re-dater à la main.
      toRedate.push({
        title: o.title, slug: o.slug, sourceUrl: o.source_url,
        passedOn: o.deadline.slice(0, 10), nextSession: next.toISOString().slice(0, 10),
      })
      console.log(`  ✎ [re-dater] ${o.title.slice(0, 50)} : clos ${o.deadline.slice(0, 10)} → session connue ${next.toISOString().slice(0, 10)}`)
    } else {
      // Case 2 : plus de date future → surveillance source (awaiting_details).
      toMonitor.push({ id: o.id, title: o.title, slug: o.slug })
      console.log(`  → [surveillance] ${o.title.slice(0, 50)} : clos ${o.deadline.slice(0, 10)}, aucune date future → awaiting_details`)
      if (apply) {
        const { error: upErr } = await supabase
          .from('opportunities')
          .update({ next_edition_status: 'awaiting_details', deadline: null } as never)
          .eq('id', o.id)
        if (upErr) { console.error(`    ❌ ${upErr.message}`); errors += 1 }
      }
    }
  }

  console.log(
    `\n✓ Bilan : ${toRedate.length} à re-dater (session connue), ` +
      `${toMonitor.length} ${apply ? 'basculée(s)' : 'à basculer'} en surveillance` +
      `${errors ? `, ${errors} erreur(s)` : ''}`,
  )
  if (!apply && (toMonitor.length || toRedate.length)) {
    console.log('  Pour exécuter : npm run deadlines:process -- --apply --send')
  }

  if (send && toRedate.length > 0) await sendEmail(toRedate)
  else if (toRedate.length > 0) console.log('\n(dry-run email : ajouter --send pour notifier les fiches à re-dater)')
}

async function sendEmail(toRedate: Redate[]): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  const to = process.env.RECHECK_NOTIFY_TO
  if (!apiKey || !from || !to) {
    console.warn(
      '⚠ email non envoyé : RESEND_API_KEY / RESEND_FROM_EMAIL / RECHECK_NOTIFY_TO manquant(s). Rapport ci-dessus uniquement.',
    )
    return
  }
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://encre.io').replace(/\/$/, '')
  const items = toRedate
    .map(
      (r) =>
        `<li><strong>${escapeHtml(r.title)}</strong> — clôture passée le ${escapeHtml(
          r.passedOn,
        )}, prochaine session au calendrier : <strong>${escapeHtml(
          r.nextSession,
        )}</strong>.<br><a href="${siteUrl}/admin/curation">curation</a> · <a href="${escapeHtml(
          r.sourceUrl,
        )}">source</a></li>`,
    )
    .join('')
  const html = `<p>${toRedate.length} aide(s) multi-sessions ont leur deadline dépassée, mais une session suivante est déjà connue. Pose la nouvelle date à la main (vérifie la source) :</p><ul>${items}</ul>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject: `Encre — ${toRedate.length} aide(s) à re-dater (session suivante connue)`,
      html,
    }),
  })
  if (!res.ok) {
    console.error(`❌ envoi email échoué : ${res.status} ${(await res.text()).slice(0, 200)}`)
    process.exit(1)
  }
  console.log(`✓ email envoyé à ${to} (${toRedate.length} fiche(s) à re-dater).`)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
