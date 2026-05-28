#!/usr/bin/env tsx
/**
 * One-shot : re-normalise les sections (conditions/calendrier/dossier)
 * de toutes les opps publiées avec la grammaire éditoriale Encre
 * (normalizeSectionList). Utile après un changement de la normalisation,
 * pour appliquer les nouvelles règles aux opps déjà en DB.
 *
 * Concrètement le 2026-05-07 : ajout du fix ISO YYYY-MM-DD → format FR
 * dans normalizeSectionItem. Ce script propage le fix à toutes les opps.
 *
 * Modes :
 *   - défaut : dry-run (affiche les diffs, ne modifie rien)
 *   - --apply : exécute les UPDATEs
 *
 * Filtres :
 *   - --emitter X : limite à un émetteur
 *   - --section conditions|calendrier|dossier : limite à une section
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { createClient } from '@supabase/supabase-js'
import { normalizeSectionList } from '../src/lib/normalize/section-item'
import { hasSuspectChars } from '../src/lib/normalize/quality'

interface Opp {
  id: string
  slug: string
  title: string
  emitter: string
  conditions: string[] | null
  calendrier: string[] | null
  dossier: string[] | null
}

function diff(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return true
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true
  return false
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const emitterIdx = args.indexOf('--emitter')
  const emitter = emitterIdx >= 0 ? args[emitterIdx + 1] : null
  const sectionIdx = args.indexOf('--section')
  const onlySection = sectionIdx >= 0 ? args[sectionIdx + 1] : null
  // Mode --only-suspect : ne traite QUE les opps qui contiennent au moins
  // un item avec des caractères suspects (hallucinations LLM). Évite le
  // bruit des capitalize-only diffs.
  const onlySuspect = args.includes('--only-suspect')

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let q = sb
    .from('opportunities')
    .select('id, slug, title, emitter, conditions, calendrier, dossier')
    .eq('is_published', true)
    .order('updated_at', { ascending: false })
  if (emitter) q = q.eq('emitter', emitter)

  const { data, error } = await q
  if (error) {
    console.error('DB error:', error)
    process.exit(1)
  }

  const opps = (data ?? []) as unknown as Opp[]
  console.log(`Mode : ${apply ? 'APPLY' : 'DRY-RUN'} | ${opps.length} opps scannées\n`)

  let changedCount = 0
  for (const o of opps) {
    if (onlySuspect) {
      const allItems = [
        ...(o.conditions ?? []),
        ...(o.calendrier ?? []),
        ...(o.dossier ?? []),
      ]
      if (!allItems.some((i) => hasSuspectChars(i))) continue
    }
    const sectionsToCheck: Array<['conditions' | 'calendrier' | 'dossier', string[]]> = []
    if (!onlySection || onlySection === 'conditions')
      sectionsToCheck.push(['conditions', o.conditions ?? []])
    if (!onlySection || onlySection === 'calendrier')
      sectionsToCheck.push(['calendrier', o.calendrier ?? []])
    if (!onlySection || onlySection === 'dossier')
      sectionsToCheck.push(['dossier', o.dossier ?? []])

    const update: Record<string, unknown> = {}
    const diffs: string[] = []

    for (const [kind, current] of sectionsToCheck) {
      const normalized = normalizeSectionList(current, kind)
      if (diff(current, normalized)) {
        update[kind] = normalized
        diffs.push(`  ${kind} :`)
        for (let i = 0; i < Math.max(current.length, normalized.length); i++) {
          const a = current[i] ?? '(absent)'
          const b = normalized[i] ?? '(absent)'
          if (a !== b) {
            diffs.push(`    - "${a}"`)
            diffs.push(`    + "${b}"`)
          }
        }
      }
    }

    if (Object.keys(update).length === 0) continue

    changedCount++
    console.log(`▶ ${o.emitter} : ${o.title.slice(0, 70)}`)
    console.log(`  slug: ${o.slug}`)
    for (const line of diffs) console.log(line)

    if (apply) {
      update.updated_at = new Date().toISOString()
      const { error: upErr } = await sb
        .from('opportunities')
        .update(update)
        .eq('id', o.id)
      if (upErr) {
        console.log(`  ✗ UPDATE failed: ${upErr.message}`)
      } else {
        console.log(`  ✓ APPLIED`)
      }
    }
    console.log('')
  }

  console.log(`\n=== ${changedCount} / ${opps.length} opps with diffs ===`)
  if (!apply && changedCount > 0) {
    console.log(`(Dry-run - pass --apply to execute the updates.)`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
