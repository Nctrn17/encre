#!/usr/bin/env tsx
/**
 * Re-check des fiches « awaiting_details ».
 *
 * Les fiches dont la prochaine édition est annoncée mais sans dates encore
 * publiées (`next_edition_status = 'awaiting_details'`) sont cachées du registre
 * public. Personne ne peut faire la veille manuelle de chacune chaque semaine :
 * ce job re-fetch leur source et repère celles qui affichent désormais une
 * DATE FUTURE — candidates à une republication.
 *
 * Il NE republie PAS automatiquement (risque de date erronée) : il se contente
 * de SIGNALER les candidates pour validation humaine, en un clic dans
 * /admin/curation. Filet semi-automatique, pas pilote automatique.
 *
 * Usage :
 *   npx tsx scripts/recheck-awaiting-details.ts            # rapport console
 *   npx tsx scripts/recheck-awaiting-details.ts --send     # + email (Resend)
 *
 * Env requis : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Email (optionnel) : RESEND_API_KEY, RESEND_FROM_EMAIL, RECHECK_NOTIFY_TO.
 */
import { loadEnv } from '../scrapers/lib/load-env'
loadEnv()
import { createClient } from '@supabase/supabase-js'
import { extractPageText } from '../scrapers/lib/extract-page-text'

const MONTHS: Record<string, number> = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5,
  juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10,
  novembre: 11, décembre: 12, decembre: 12,
}
const MONTHS_ALT = Object.keys(MONTHS).join('|')

/** Dates pleines (JJ mois AAAA) strictement futures trouvées dans le texte. */
function futureDatesInText(text: string, now: number): string[] {
  const re = new RegExp(`(\\d{1,2})(?:er)?\\s+(${MONTHS_ALT})\\s+(20\\d{2})`, 'gi')
  const found = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const day = Number(m[1])
    const month = MONTHS[m[2].toLowerCase()]
    const year = Number(m[3])
    if (!month || day < 1 || day > 31) continue
    // Fin de journée UTC, comme le backfill deadline.
    const d = Date.UTC(year, month - 1, day, 21, 59, 59)
    if (d > now) found.add(`${day} ${m[2].toLowerCase()} ${year}`)
  }
  return [...found]
}

interface Candidate {
  id: string
  title: string
  slug: string
  sourceUrl: string
  dates: string[]
}

async function main(): Promise<void> {
  const send = process.argv.includes('--send')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ env Supabase manquant (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
    process.exit(1)
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const { data, error } = await supabase
    .from('opportunities')
    .select('id, title, slug, source_url')
    .eq('is_published', true)
    // Deux populations surveillées : les fiches « awaiting_details » (cachées,
    // en attente de dates) ET les fiches « watch_source » (visibles, gardées en
    // référence permanente malgré l'absence de deadline — aides rares Outre-mer
    // / pays du Sud). Dans les deux cas on re-fetch la source pour alerter à la
    // (ré)ouverture.
    .or('next_edition_status.eq.awaiting_details,watch_source.is.true')
  if (error) {
    console.error('❌ requête Supabase :', error.message)
    process.exit(1)
  }
  const rows = (data ?? []) as Array<{ id: string; title: string; slug: string; source_url: string }>
  console.log(`${rows.length} fiche(s) en awaiting_details à re-vérifier.\n`)

  const now = Date.now()
  const candidates: Candidate[] = []
  const unreachable: string[] = []
  let clean = 0

  for (const o of rows) {
    let page: Awaited<ReturnType<typeof extractPageText>> = null
    try {
      page = await extractPageText(o.source_url, { maxChars: 15000 })
    } catch (e) {
      page = null
      console.warn(`  ⚠ fetch fail ${o.title} : ${(e as Error).message.slice(0, 80)}`)
    }
    if (!page) {
      unreachable.push(o.title)
      console.log(`  · [SOURCE INJOIGNABLE] ${o.title}`)
      continue
    }
    const dates = futureDatesInText(page.text, now)
    if (dates.length > 0) {
      candidates.push({ id: o.id, title: o.title, slug: o.slug, sourceUrl: o.source_url, dates })
      console.log(`  ✓ [DATES POSSIBLES] ${o.title} → ${dates.join(', ')}`)
    } else {
      clean++
      console.log(`  · [rien de neuf] ${o.title}`)
    }
  }

  console.log(
    `\nBilan : ${candidates.length} à vérifier, ${clean} sans date future, ${unreachable.length} injoignable(s).`,
  )

  if (candidates.length === 0) {
    console.log('Aucune candidate à republier — rien à signaler.')
    return
  }

  if (send) await sendEmail(candidates)
  else console.log('\n(dry-run : ajouter --send pour notifier par email)')
}

async function sendEmail(candidates: Candidate[]): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  const to = process.env.RECHECK_NOTIFY_TO
  if (!apiKey || !from || !to) {
    console.warn(
      '⚠ email non envoyé : RESEND_API_KEY / RESEND_FROM_EMAIL / RECHECK_NOTIFY_TO manquant(s). Rapport ci-dessus uniquement.',
    )
    return
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://encre.io'
  const rows = candidates
    .map(
      (c) =>
        `<li><strong>${escapeHtml(c.title)}</strong> — dates repérées : ${escapeHtml(
          c.dates.join(', '),
        )}<br><a href="${siteUrl}/admin/curation">curation</a> · <a href="${escapeHtml(
          c.sourceUrl,
        )}">source</a></li>`,
    )
    .join('')
  const html = `<p>${candidates.length} fiche(s) surveillée(s) affichent désormais une date future sur leur source. À vérifier puis dater (poser la deadline ; et retirer le flag awaiting_details si la fiche était masquée) :</p><ul>${rows}</ul>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject: `Encre — ${candidates.length} fiche(s) en attente à re-vérifier`,
      html,
    }),
  })
  if (!res.ok) {
    console.error(`❌ envoi email échoué : ${res.status} ${(await res.text()).slice(0, 200)}`)
    process.exit(1)
  }
  console.log(`✓ email envoyé à ${to} (${candidates.length} candidate(s)).`)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
