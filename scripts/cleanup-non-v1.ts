#!/usr/bin/env tsx
/**
 * Cleanup : marque is_published=false toutes les opportunités hors scope V1.
 *
 * V1 launch cible scénaristes/auteurs uniquement (cinema / audiovisuel /
 * litterature / theatre / numerique). Cf. src/lib/pilot-defaults.ts.
 *
 * On ne SUPPRIME pas les opps : on les masque (is_published = false). Permet :
 *   - audit / debug (la donnée reste consultable côté admin)
 *   - extension future du scope sans rescraper (juste re-publier en bulk)
 *
 * Usage :
 *   npm run cleanup:non-v1                # dry-run par défaut
 *   npm run cleanup:non-v1 -- --apply     # exécute les UPDATE
 *
 * Idempotent : ré-exécuter ne change rien si le scope V1 reste le même.
 */

import { loadEnv } from '../scrapers/lib/load-env'
loadEnv()

import { createClient } from '@supabase/supabase-js'
import { hasV1Discipline, V1_MACRO_DISCIPLINES } from '../src/lib/pilot-defaults'

interface OpportunityRow {
  id: string
  slug: string
  title: string
  emitter: string
  disciplines: string[] | null
}

async function main() {
  const apply = process.argv.includes('--apply')
  console.log(`🧹 Cleanup hors V1 · mode ${apply ? 'APPLY' : 'DRY-RUN'}`)
  console.log(`   V1 macro disciplines : ${V1_MACRO_DISCIPLINES.join(', ')}\n`)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ Missing env vars'); process.exit(1)
  }
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  // 1. Fetch toutes les opps publiées (peu importe leur deadline ; on
  //    cleanup même les opps expirées hors V1 pour rester cohérent).
  const { data, error } = await sb
    .from('opportunities')
    .select('id, slug, title, emitter, disciplines')
    .eq('is_published', true)
  if (error) { console.error('❌ Fetch failed:', error.message); process.exit(1) }
  const opps = (data ?? []) as OpportunityRow[]

  // 2. Identifier celles qui SORTENT du scope V1
  const toUnpublish = opps.filter((o) => !hasV1Discipline(o.disciplines))

  console.log(`Pool publié actuel  : ${opps.length}`)
  console.log(`Hors V1 (à masquer) : ${toUnpublish.length}`)
  console.log(`Reste V1            : ${opps.length - toUnpublish.length}\n`)

  if (toUnpublish.length === 0) {
    console.log('✓ Rien à faire, tout est V1.')
    return
  }

  // 3. Stats par émetteur
  const byEmitter: Record<string, number> = {}
  for (const o of toUnpublish) byEmitter[o.emitter] = (byEmitter[o.emitter] ?? 0) + 1
  console.log('Émetteurs concernés :')
  Object.entries(byEmitter)
    .sort((a, b) => b[1] - a[1])
    .forEach(([e, n]) => console.log(`  ${n.toString().padStart(4)} ${e}`))
  console.log()

  // 4. Échantillon (10 premières opps masquées avec leurs disciplines)
  console.log('Échantillon (10 premières) :')
  for (const o of toUnpublish.slice(0, 10)) {
    const disc = (o.disciplines ?? []).join(',') || '∅'
    console.log(`  · [${disc}] ${o.title.slice(0, 70)}`)
  }
  if (toUnpublish.length > 10) console.log(`  … +${toUnpublish.length - 10} autres\n`)
  else console.log()

  if (!apply) {
    console.log(`Pour exécuter : npm run cleanup:non-v1 -- --apply`)
    return
  }

  // 5. UPDATE en lot (chunks de 100 pour rester sous limites Supabase)
  const ids = toUnpublish.map((o) => o.id)
  let updated = 0
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const { error: upErr, count } = await sb
      .from('opportunities')
      .update({ is_published: false, updated_at: new Date().toISOString() }, { count: 'exact' })
      .in('id', chunk)
    if (upErr) { console.warn(`  ✗ chunk ${i}-${i + chunk.length}: ${upErr.message}`); continue }
    updated += count ?? 0
  }
  console.log(`✓ ${updated} opps masquées (is_published = false)`)
}

main().catch((err) => { console.error('❌ Fatal:', err); process.exit(1) })
