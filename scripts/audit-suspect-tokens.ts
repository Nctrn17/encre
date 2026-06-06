#!/usr/bin/env tsx
/**
 * Audit read-only : scanne toutes les opps publiées pour des caractères
 * non-français (hallucinations LLM observées sur Gemma 4 31B).
 *
 * Détecte les chars dans des plages Unicode étrangères (arabe, vietnamien,
 * suédois, polonais, etc.) qui apparaissent au milieu de texte censé
 * être en français.
 *
 * Ne corrige RIEN — sortie txt qui peut alimenter `/curate-paste` ou
 * une session manuelle de re-classification.
 *
 * Filtres :
 *   --emitter X : limite à un émetteur
 *   --section conditions|calendrier|dossier : limite à une section
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { createClient } from '@supabase/supabase-js'
import { findSuspectChars } from '../src/lib/normalize/quality'

interface Opp {
  id: string
  slug: string
  title: string
  emitter: string
  source_url: string
  conditions: string[] | null
  calendrier: string[] | null
  dossier: string[] | null
}

async function main() {
  const args = process.argv.slice(2)
  const emitterIdx = args.indexOf('--emitter')
  const emitter = emitterIdx >= 0 ? args[emitterIdx + 1] : null
  const sectionIdx = args.indexOf('--section')
  const onlySection = sectionIdx >= 0 ? args[sectionIdx + 1] : null

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let q = sb
    .from('opportunities')
    .select(
      'id, slug, title, emitter, source_url, conditions, calendrier, dossier',
    )
    .eq('is_published', true)
    .order('emitter', { ascending: true })
  if (emitter) q = q.eq('emitter', emitter)

  const { data, error } = await q
  if (error) {
    console.error('DB error:', error)
    process.exit(1)
  }

  const opps = (data ?? []) as unknown as Opp[]

  let totalFindings = 0
  const oppsAffected = new Set<string>()
  const kindTally: Record<string, number> = {}

  for (const o of opps) {
    const sections: Array<['conditions' | 'calendrier' | 'dossier', string[]]> = []
    if (!onlySection || onlySection === 'conditions')
      sections.push(['conditions', o.conditions ?? []])
    if (!onlySection || onlySection === 'calendrier')
      sections.push(['calendrier', o.calendrier ?? []])
    if (!onlySection || onlySection === 'dossier')
      sections.push(['dossier', o.dossier ?? []])

    for (const [kind, items] of sections) {
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx]
        const findings = findSuspectChars(item)
        if (findings.length === 0) continue

        if (!oppsAffected.has(o.id)) {
          oppsAffected.add(o.id)
          console.log(`\n▶ ${o.emitter} : ${o.title.slice(0, 70)}`)
          console.log(`  slug: ${o.slug}`)
          console.log(`  url:  ${o.source_url}`)
        }

        console.log(`  [${kind}#${idx}] ${item}`)
        for (const f of findings) {
          console.log(
            `    ⚠ "${f.char}" (${f.kind}, U+${f.char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')}) — context: ${f.context}`,
          )
          kindTally[f.kind] = (kindTally[f.kind] ?? 0) + 1
          totalFindings++
        }
      }
    }
  }

  console.log(`\n=== Bilan ===`)
  console.log(`  ${oppsAffected.size} opps concernées sur ${opps.length} scannées`)
  console.log(`  ${totalFindings} chars suspects au total`)
  if (Object.keys(kindTally).length > 0) {
    console.log(`  Répartition :`)
    for (const [k, n] of Object.entries(kindTally).sort(
      (a, b) => b[1] - a[1],
    )) {
      console.log(`    ${k.padEnd(28)} ${n}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
