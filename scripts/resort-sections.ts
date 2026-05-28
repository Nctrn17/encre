#!/usr/bin/env tsx
/**
 * Re-trie en DB les items de conditions/calendrier/dossier selon l'ordre
 * canonique défini dans `src/lib/normalize/section-item.ts`.
 *
 * - Déterministe, idempotent (peut être relancé sans risque)
 * - Coût zéro (aucun appel LLM, aucune fetch externe)
 * - Préserve le contenu, modifie uniquement l'ordre
 *
 * Usage :
 *   npm run resort:sections                  # dry-run (affiche les diffs)
 *   npm run resort:sections -- --apply       # exécute les UPDATE
 *   npm run resort:sections -- --apply --slug X       # ciblé
 *   npm run resort:sections -- --apply --v1-only      # scope pilote AV
 */

import { loadEnv } from '../scrapers/lib/load-env'
loadEnv()

import { createClient } from '@supabase/supabase-js'
import { normalizeSectionList } from '../src/lib/normalize/section-item'
import { PILOT_SCENARISTE_TAGS } from '../src/lib/pilot-defaults'

interface Row {
  id: string
  slug: string
  title: string
  conditions: string[] | null
  calendrier: string[] | null
  dossier: string[] | null
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function getFlagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  if (i < 0) return undefined
  const v = argv[i + 1]
  return v && !v.startsWith('--') ? v : undefined
}

async function main() {
  const argv = process.argv.slice(2)
  const apply = argv.includes('--apply')
  const v1Only = argv.includes('--v1-only')
  const slug = getFlagValue(argv, '--slug') ?? null

  const mode = apply ? 'APPLY' : 'DRY-RUN (passez --apply pour exécuter)'
  console.log(`🔄 Re-tri canonique des sections · mode ${mode}`)
  if (v1Only) console.log('   → scope V1 (pilote scénariste/auteur AV)')
  if (slug) console.log(`   → slug ciblé : ${slug}`)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant')
    process.exit(1)
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let query = supabase
    .from('opportunities')
    .select('id, slug, title, conditions, calendrier, dossier')
    .eq('is_published', true)
    .order('title', { ascending: true })
  if (slug) query = query.eq('slug', slug)
  if (v1Only) query = query.overlaps('disciplines_tags', [...PILOT_SCENARISTE_TAGS])

  const { data, error } = await query
  if (error) {
    console.error('❌ Fetch failed:', error.message)
    process.exit(1)
  }
  const rows = (data ?? []) as Row[]
  console.log(`\nFetched ${rows.length} opportunités publiées\n`)

  let changed = 0
  let unchanged = 0
  let updated = 0
  let errors = 0

  for (const row of rows) {
    // Renormaliser via la pipeline complète : applique grammaire éditoriale
    // (apostrophes, mois minuscule, capitalize, strip verbes…) + tri par famille.
    const newConditions = normalizeSectionList(row.conditions ?? [], 'conditions')
    const newCalendrier = normalizeSectionList(row.calendrier ?? [], 'calendrier')
    const newDossier = normalizeSectionList(row.dossier ?? [], 'dossier')

    const condChanged = !arraysEqual(row.conditions ?? [], newConditions)
    const calChanged = !arraysEqual(row.calendrier ?? [], newCalendrier)
    const dosChanged = !arraysEqual(row.dossier ?? [], newDossier)

    if (!condChanged && !calChanged && !dosChanged) {
      unchanged += 1
      continue
    }

    changed += 1
    const parts: string[] = []
    if (condChanged) parts.push(`cond ${(row.conditions ?? []).length}→${newConditions.length}`)
    if (calChanged) parts.push(`cal ${(row.calendrier ?? []).length}→${newCalendrier.length}`)
    if (dosChanged) parts.push(`dos ${(row.dossier ?? []).length}→${newDossier.length}`)
    console.log(`  · ${row.title.slice(0, 70)} → ${parts.join(', ')}`)

    if (!apply) continue

    const { error: upErr } = await supabase
      .from('opportunities')
      .update({
        conditions: newConditions,
        calendrier: newCalendrier,
        dossier: newDossier,
      } as never)
      .eq('id', row.id)
    if (upErr) {
      console.error(`    ❌ UPDATE failed: ${upErr.message}`)
      errors += 1
    } else {
      updated += 1
    }
  }

  console.log(`\n✓ Bilan`)
  console.log(`  - ${unchanged} déjà dans l'ordre canonique`)
  console.log(`  - ${changed} à re-trier (${apply ? `${updated} updated` : 'dry-run, aucun UPDATE'})`)
  if (errors > 0) console.log(`  - ${errors} erreurs DB`)
  if (!apply && changed > 0) console.log(`\n  Pour exécuter : npm run resort:sections -- --apply`)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
