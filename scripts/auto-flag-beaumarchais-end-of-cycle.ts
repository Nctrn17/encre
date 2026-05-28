/**
 * Auto-flag des opps Beaumarchais en `awaiting_details` après deadline.
 *
 * Les bourses Beaumarchais (Théâtre, Télévision, Mise en scène, Cinéma,
 * Animation, Court métrage…) ouvrent quasi à date fixe annuellement.
 * Quand la deadline d'un cycle passe, le cycle suivant n'est généralement
 * pas encore annoncé sur le site - la page reste avec le règlement de
 * l'édition précédente.
 *
 * Plutôt que de laisser ces opps tomber dans la file EXPIRED (et y rester
 * à chaque review hebdo), ce script les flagge automatiquement en
 * `next_edition_status='awaiting_details'`, ce qui :
 *   - les sort de EXPIRED
 *   - affiche le bandeau « modalités à venir » sur la fiche
 *   - les fait apparaître dans la file AWAITING en /admin/curation
 *     pour que Walid réévalue quand le nouveau cycle est annoncé
 *
 * Mode :
 *   - défaut : dry-run
 *   - --apply : exécute
 *
 * Idempotent : si déjà flaggé, skip.
 *
 * À brancher en cron quotidien (GitHub Actions) après la phase de scrape :
 *   .github/workflows/scrape.yml step "Auto-flag Beaumarchais EOL"
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })
import { createClient } from '@supabase/supabase-js'

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(`mode : ${apply ? 'APPLY' : 'DRY-RUN'}`)

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const nowIso = new Date().toISOString()

  // Sélectionne toutes les opps Beaumarchais publiées dont :
  //   - deadline est passée (deadline < now())
  //   - et next_edition_status n'est pas déjà 'awaiting_details'
  const { data, error } = await sb
    .from('opportunities')
    .select('id,title,deadline,next_edition_status,is_published')
    .eq('emitter_slug', 'association-beaumarchais-sacd')
    .eq('is_published', true)
    .lt('deadline', nowIso)
  if (error) { console.error(error); process.exit(1) }

  // Filtrage côté client pour les non encore flaggés
  const toFlag = (data ?? []).filter(
    (o) => (o as { next_edition_status?: string | null }).next_edition_status !== 'awaiting_details',
  )

  console.log(`\nOpps Beaumarchais avec deadline passée : ${data?.length ?? 0}`)
  console.log(`Dont à flagger (pas encore awaiting_details) : ${toFlag.length}\n`)

  for (const o of toFlag) {
    console.log(`  → ${o.title.slice(0, 70)} (deadline ${o.deadline?.slice(0, 10)})`)
  }

  if (toFlag.length === 0) {
    console.log('\nRien à faire.')
    return
  }
  if (!apply) {
    console.log(`\nRe-lancer avec --apply pour exécuter.`)
    return
  }

  const { error: upErr } = await sb
    .from('opportunities')
    .update({ next_edition_status: 'awaiting_details', updated_at: new Date().toISOString() })
    .in('id', toFlag.map((o) => o.id))
  if (upErr) { console.error(upErr); process.exit(1) }

  console.log(`\n✓ ${toFlag.length} opps Beaumarchais flaggées awaiting_details.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
