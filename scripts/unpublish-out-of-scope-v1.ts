/**
 * Désindexe les opps qui sont structurellement hors cible V1
 * (jeunes auteurs hors-réseau). Décision après review humaine
 * 2026-05-04 : ces aides s'adressent à des sociétés de production,
 * éditeurs de chaînes, ou établissements culturels — pas à des
 * auteurs individuels.
 *
 * Mode :
 *   - défaut : dry-run, montre ce qu'il ferait sans modifier
 *   - --apply : exécute le UPDATE is_published=false
 *
 * Usage :
 *   npx tsx scripts/unpublish-out-of-scope-v1.ts
 *   npx tsx scripts/unpublish-out-of-scope-v1.ts --apply
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })
import { createClient } from '@supabase/supabase-js'

interface Target {
  source_url: string
  reason: string
}

const TARGETS: Target[] = [
  {
    source_url: 'https://alca-nouvelle-aquitaine.fr/fr/cinema-audiovisuel/fonds-de-soutien-au-cinema-et-l-audiovisuel/l-aide-la-production',
    reason: 'ALCA Aide à la production : demandeur = société de production, hors cible V1',
  },
  {
    source_url: 'https://alca-nouvelle-aquitaine.fr/fr/cinema-audiovisuel/fonds-de-soutien-au-cinema-et-l-audiovisuel/coproduction-internationale',
    reason: 'ALCA Coproduction internationale : demandeur = société de production, hors cible V1',
  },
  {
    source_url: 'https://alca-nouvelle-aquitaine.fr/fr/cinema-audiovisuel/fonds-de-soutien-au-cinema-et-l-audiovisuel/l-aide-au-developpement',
    reason: 'ALCA Aide au développement : demandeur = société de production, hors cible V1',
  },
  {
    source_url: 'https://www.cnc.fr/professionnels/aides-et-financements/multi-sectoriel/diffusion/aides-a-la-diffusion-en-ligne_2511433',
    reason: 'CNC Aides à la diffusion en ligne : demandeur = éditeur de chaîne, hors cible V1',
  },
  {
    source_url: 'https://www.cnc.fr/professionnels/aides-et-financements/multi-sectoriel/production/alliance-4-development--a4d_1431290',
    reason: 'CNC Alliance 4 Development (A4D) : demandeur = producteur, hors cible V1',
  },
  {
    source_url: 'https://www.pictanovo.com/fond/aide-au-programme-editorial/',
    reason: 'PictanovO Aide au programme éditorial : demandeur = société commerciale, hors cible V1',
  },
  {
    source_url: 'https://www.culture.gouv.fr/catalogue-des-demarches-et-subventions/appels-a-projets-candidatures/applications-et-dispositifs-numeriques-innovants-adni-en-hauts-de-france',
    reason: 'Ministère Culture ADNI : demandeur = établissement culturel, hors cible V1',
  },
]

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(`mode : ${apply ? 'APPLY (UPDATE en DB)' : 'DRY-RUN (lecture seule, passez --apply pour exécuter)'}`)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await sb
    .from('opportunities')
    .select('id, title, source_url, is_published')
    .in('source_url', TARGETS.map((t) => t.source_url))

  if (error) { console.error(error); process.exit(1) }

  console.log(`\nFound ${(data ?? []).length} matches in DB on ${TARGETS.length} targets.\n`)

  const matchedIds: string[] = []
  for (const t of TARGETS) {
    const opp = (data ?? []).find((o) => o.source_url === t.source_url)
    if (!opp) {
      console.log(`  ⊘ NOT FOUND  : ${t.source_url}`)
      continue
    }
    const status = opp.is_published ? 'published' : 'already_unpublished'
    console.log(`  · [${status}]  ${opp.title.slice(0, 70)}`)
    console.log(`    raison    : ${t.reason}`)
    if (opp.is_published) matchedIds.push(opp.id)
  }

  if (matchedIds.length === 0) {
    console.log('\nRien à faire.')
    return
  }
  if (!apply) {
    console.log(`\n${matchedIds.length} opp(s) seraient désindexée(s). Re-lancer avec --apply pour exécuter.`)
    return
  }

  const { error: upErr } = await sb
    .from('opportunities')
    .update({ is_published: false, updated_at: new Date().toISOString() })
    .in('id', matchedIds)
  if (upErr) { console.error(upErr); process.exit(1) }

  console.log(`\n✓ ${matchedIds.length} opp(s) désindexée(s) (is_published = false).`)
}

main().catch((e) => { console.error(e); process.exit(1) })
