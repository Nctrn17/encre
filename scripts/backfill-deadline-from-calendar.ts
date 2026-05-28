#!/usr/bin/env tsx
/**
 * Backfill du champ `deadline` (date unique structurée) à partir du champ
 * `calendrier` (text[]) pour les opps publiées qui ont des dates de clôture
 * mais pas de deadline.
 *
 * Pourquoi : le tri du listing (deadline ASC), les pills d'urgence (J-X) et
 * le JSON-LD applicationDeadline dépendent tous de `deadline`. 86% des
 * fiches l'avaient null alors que leur calendrier contient les clôtures.
 *
 * Prudent par design : ne remplit `deadline` QUE si on identifie une
 * clôture FUTURE fiable. Sinon laisse null (mieux vaut vide qu'une mauvaise
 * date, ex: une date de résultats prise pour une deadline).
 *
 * Sources de dates retenues (par ordre de fiabilité) :
 *   1. Format C : ligne "Clôtures YYYY : 30 janvier, 30 mars, …"
 *      → toutes des clôtures certaines, année dans l'en-tête.
 *   2. Format A : ligne "JJ mois YYYY : …" contenant un mot de clôture
 *      (clôture / dépôt / date limite / candidatures / jusqu'au / avant le).
 *
 * On ignore les étapes postérieures (résultats, commission, jury, auditions,
 * annonce, résidence, restitution) qui ne sont pas des deadlines de dépôt.
 *
 * Usage :
 *   npm run backfill:deadline                 # dry-run
 *   npm run backfill:deadline -- --apply      # exécute les UPDATE
 */

import { loadEnv } from '../scrapers/lib/load-env'
loadEnv()
import { createClient } from '@supabase/supabase-js'

const MONTHS: Record<string, number> = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5,
  juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10,
  novembre: 11, décembre: 12, decembre: 12,
}
const MONTHS_ALT = Object.keys(MONTHS).join('|')

// Mot indiquant une clôture de dépôt (vs étape postérieure)
const CLOTURE_RE = /clôtur|clotur|dépôt|depot|date limite|candidatur|jusqu['’]au|avant le|deadline|inscription/i
// Étapes postérieures à ignorer si pas de mot clôture
const POSTERIEUR_RE = /résultat|resultat|commission|jury|sélection|selection|annonce|notification|audition|résidence|residence|restitution|remise|atelier|forum|festival|examen|délibér|deliber/i

/** 23:59 Paris ≈ 21:59 UTC (approximation deadline fin de journée). */
function frDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 21, 59, 59))
}

/** Parse "Clôtures 2026 : 30 janvier, 30 mars, 27 avril" → dates (année de l'en-tête). */
function parseClotureLine(item: string): Date[] {
  const ym = item.match(/cl[oô]tures?\s+(\d{4})\s*:/i)
  if (!ym) return []
  const year = Number.parseInt(ym[1], 10)
  const rest = item.slice(item.indexOf(':') + 1)
  // Année optionnelle après le mois : si une date porte sa propre année
  // (ex "04 décembre 2025" dans une ligne "Clôtures 2026"), on la respecte
  // plutôt que d'appliquer aveuglément l'année de l'en-tête.
  const re = new RegExp(`(\\d{1,2})(?:er)?\\s+(${MONTHS_ALT})(?:\\s+(\\d{4}))?`, 'gi')
  const out: Date[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(rest))) {
    const day = Number.parseInt(m[1], 10)
    const month = MONTHS[m[2].toLowerCase()]
    const y = m[3] ? Number.parseInt(m[3], 10) : year
    if (month) out.push(frDate(y, month, day))
  }
  return out
}

/** Parse une ligne Format A "JJ mois YYYY : action" si c'est une clôture. */
function parseFormatALine(item: string): Date | null {
  const re = new RegExp(`(\\d{1,2})(?:er)?\\s+(${MONTHS_ALT})\\s+(\\d{4})`, 'i')
  const m = item.match(re)
  if (!m) return null
  // Doit ressembler à une clôture, pas une étape postérieure
  const isCloture = CLOTURE_RE.test(item)
  const isPosterieur = POSTERIEUR_RE.test(item)
  if (!isCloture && isPosterieur) return null
  if (!isCloture && !isPosterieur) return null // ambigu → on ne prend pas
  const day = Number.parseInt(m[1], 10)
  const month = MONTHS[m[2].toLowerCase()]
  const year = Number.parseInt(m[3], 10)
  if (!month) return null
  return frDate(year, month, day)
}

/** Extrait la prochaine clôture future depuis le calendrier, ou null. */
function nextDeadline(calendrier: string[], now: Date): Date | null {
  const candidates: Date[] = []
  for (const item of calendrier) {
    if (/cl[oô]tures?\s+\d{4}\s*:/i.test(item)) {
      candidates.push(...parseClotureLine(item))
    } else {
      const d = parseFormatALine(item)
      if (d) candidates.push(d)
    }
  }
  const future = candidates.filter((d) => d.getTime() > now.getTime()).sort((a, b) => a.getTime() - b.getTime())
  return future[0] ?? null
}

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(`🗓  Backfill deadline depuis calendrier · ${apply ? 'APPLY' : 'DRY-RUN'}`)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('❌ env Supabase manquant'); process.exit(1) }
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const { data, error } = await supabase
    .from('opportunities')
    .select('id, slug, title, deadline, calendrier, disciplines_tags')
    .eq('is_published', true)
    .is('deadline', null)
  if (error) { console.error('❌', error.message); process.exit(1) }

  const now = new Date()
  const rows = (data ?? []) as Array<{
    id: string; slug: string; title: string; deadline: string | null
    calendrier: string[] | null; disciplines_tags: string[] | null
  }>

  let filled = 0
  let skipped = 0
  let errors = 0

  for (const row of rows) {
    if (!row.calendrier || row.calendrier.length === 0) { skipped += 1; continue }
    const d = nextDeadline(row.calendrier, now)
    if (!d) { skipped += 1; continue }

    const iso = d.toISOString()
    console.log(`  ✓ ${row.title.slice(0, 60)} → ${iso.slice(0, 10)}`)
    filled += 1

    if (apply) {
      const { error: upErr } = await supabase
        .from('opportunities')
        .update({ deadline: iso } as never)
        .eq('id', row.id)
      if (upErr) { console.error(`    ❌ ${upErr.message}`); errors += 1 }
    }
  }

  console.log(`\n✓ Bilan : ${filled} deadlines ${apply ? 'écrites' : 'à écrire'}, ${skipped} sans clôture future identifiable${errors ? `, ${errors} erreurs` : ''}`)
  if (!apply && filled > 0) console.log('  Pour exécuter : npm run backfill:deadline -- --apply')
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
