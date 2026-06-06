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
// Parsing des dates de clôture : source unique partagée avec roll-deadlines.ts
import { nextDeadline } from '../scrapers/lib/calendar-dates'

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
