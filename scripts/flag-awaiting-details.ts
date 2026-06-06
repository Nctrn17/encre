/**
 * Flag les opps « édition précédente, prochaine session à venir » avec
 * `next_edition_status = 'awaiting_details'`. L'UI rend alors un bandeau
 * d'alerte au-dessus des sections, pour que l'utilisateur sache que les
 * infos affichées sont issues de la dernière édition connue.
 *
 * Liste figée 2026-05-04 après review humaine. Re-évaluer à chaque
 * début de cycle (sept-oct).
 *
 * Mode :
 *   - défaut : dry-run
 *   - --apply : exécute le UPDATE
 *
 * Pré-requis : migration 0022_next_edition_status.sql appliquée.
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })
import { createClient } from '@supabase/supabase-js'

const TARGETS: { source_url: string; reason: string }[] = [
  // Le Groupe Ouest (4) — modalités par session sur pages individuelles,
  // pages d'accueil de chaque workshop sont juste descriptives
  {
    source_url: 'https://www.legroupeouest.com/workshops-en-residence/le-raconte-moi/',
    reason: 'LGO Le Raconte-moi : page descriptive, modalités à venir par session',
  },
  {
    source_url: 'https://www.legroupeouest.com/workshops-en-residence/lim-less-is-more/',
    reason: 'LGO LIM : page descriptive, modalités à venir par session',
  },
  {
    source_url: 'https://www.legroupeouest.com/workshops-en-residence/groupe-ouest-developpement/',
    reason: 'LGO Développement : page descriptive, modalités à venir par session',
  },
  {
    source_url: 'https://www.legroupeouest.com/workshops-en-residence/pre-ecriture/',
    reason: 'LGO Pré-écriture : page descriptive, modalités à venir par session',
  },
  // Moulin d'Andé (2)
  {
    source_url: 'https://moulinande.com/ceci-residence-francophone',
    reason: 'Moulin Francophone : 2026 fermé (lauréats picked), 2027 dates connues, modalités à venir',
  },
  {
    source_url: 'https://moulinande.com/ceci-autres-programmes',
    reason: 'Moulin Création Normande : 2026 ouvert avec dates, mais pièces non listées publiquement',
  },
  // SCAM (1)
  {
    source_url: 'https://www.lascam.fr/lessentiel/bourses-brouillon-dun-reve/bourses-albert-londres/',
    reason: 'SCAM Albert Londres : cycle 2025 clos, 2026 à confirmer',
  },
]

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(`mode : ${apply ? 'APPLY' : 'DRY-RUN'}`)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('❌ Missing env'); process.exit(1) }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await sb
    .from('opportunities')
    .select('id, title, source_url, next_edition_status')
    .in('source_url', TARGETS.map((t) => t.source_url))
  if (error) { console.error(error); process.exit(1) }

  console.log(`\nFound ${(data ?? []).length} matches on ${TARGETS.length} targets.\n`)

  const toUpdate: string[] = []
  for (const t of TARGETS) {
    const opp = (data ?? []).find((o) => o.source_url === t.source_url)
    if (!opp) {
      console.log(`  ⊘ NOT FOUND  : ${t.source_url}`)
      continue
    }
    const cur = (opp as { next_edition_status?: string | null }).next_edition_status ?? null
    const status = cur === 'awaiting_details' ? 'already_flagged' : 'will_flag'
    console.log(`  · [${status}]  ${opp.title.slice(0, 70)}`)
    console.log(`    raison    : ${t.reason}`)
    if (cur !== 'awaiting_details') toUpdate.push(opp.id)
  }

  if (toUpdate.length === 0) {
    console.log('\nRien à faire.')
    return
  }
  if (!apply) {
    console.log(`\n${toUpdate.length} opp(s) seraient flaggée(s). Re-lancer avec --apply.`)
    return
  }

  const { error: upErr } = await sb
    .from('opportunities')
    .update({ next_edition_status: 'awaiting_details', updated_at: new Date().toISOString() })
    .in('id', toUpdate)
  if (upErr) { console.error(upErr); process.exit(1) }

  console.log(`\n✓ ${toUpdate.length} opp(s) flaggée(s) next_edition_status=awaiting_details.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
