#!/usr/bin/env tsx
/**
 * Reclassify — remplissage des champs pilote scénariste (migration 0011)
 * et de l'éligibilité structurée (migration 0034) sur toutes les
 * opportunités existantes.
 *
 * Lit chaque opportunity, retrouve le raw_item correspondant (via match
 * sur `source_url`) pour accéder aux hints encodés par les nouveaux
 * scrapers. Si pas de hints, fallback sur inférence texte (extractPilotFields).
 *
 * Usage :
 *   npx tsx scripts/reclassify-pilot-fields.ts          (sec-pass, idempotent)
 *   npx tsx scripts/reclassify-pilot-fields.ts --dry-run
 *
 * Pas d'appel LLM — coût tokens = 0. Juste du regex/texte.
 */

import { loadEnv } from '../scrapers/lib/load-env'
loadEnv()

import { createClient } from '@supabase/supabase-js'
import { extractPilotFields } from '../src/lib/pipeline/normalize'
import { extractEligibility } from '../src/lib/pipeline/eligibility'

interface OpportunityRow {
  id: string
  title: string
  description: string | null
  source_url: string
  disciplines: string[] | null
}

interface RawItemRow {
  payload: { raw_json?: Record<string, unknown> } & Record<string, unknown>
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ Missing Supabase credentials in .env.local')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(`🔄 Reclassify pilot fields${dryRun ? ' [dry-run]' : ''}\n`)

  // 1. Fetch all opportunities
  const { data: opps, error: oppsErr } = await supabase
    .from('opportunities')
    .select('id, title, description, source_url, disciplines')
    .eq('is_published', true)

  if (oppsErr) {
    console.error('❌ Failed to fetch opportunities:', oppsErr.message)
    process.exit(1)
  }

  const opportunities = (opps ?? []) as OpportunityRow[]
  console.log(`Fetched ${opportunities.length} opportunities`)

  let withHints = 0
  let textOnly = 0
  let updated = 0
  let errors = 0
  let withEligibilitySummary = 0
  let withProfileDataNeeds = 0

  for (const opp of opportunities) {
    try {
      // 2. Lookup matching raw_item (via source_url — payload->>'url')
      const { data: rawItems } = await supabase
        .from('raw_items')
        .select('payload')
        .eq('payload->>url', opp.source_url)
        .limit(1)

      const rawItem = (rawItems?.[0] ?? null) as RawItemRow | null
      const rawJson = (rawItem?.payload?.raw_json ?? {}) as Record<string, unknown>

      const hasHints = Object.keys(rawJson).some((k) => k.startsWith('hint_'))
      if (hasHints) withHints++
      else textOnly++

      // 3. Extract pilot fields
      const fields = extractPilotFields({
        title: opp.title,
        description: opp.description,
        rawJson,
        disciplines: opp.disciplines ?? [],
      })
      const eligibility = extractEligibility({
        title: opp.title,
        description: opp.description,
        rawJson,
        tags: fields.disciplines_tags,
        requiresProducer: fields.requires_producer,
        requiresEditor: fields.requires_editor,
        ageMax: fields.age_max,
        minFilmsProduced: fields.min_films_produits,
      })

      if (eligibility.eligibility_summary) withEligibilitySummary++
      if (eligibility.eligibility_profile.requiresProfileData.length > 0) {
        withProfileDataNeeds++
      }

      // 4. Update
      if (!dryRun) {
        const { error: updateErr } = await supabase
          .from('opportunities')
          .update({
            hors_reseau_friendly: fields.hors_reseau_friendly,
            min_films_produits: fields.min_films_produits,
            requires_producer: fields.requires_producer,
            requires_editor: fields.requires_editor,
            age_max: fields.age_max,
            disciplines_tags: fields.disciplines_tags,
            eligibility_profile: eligibility.eligibility_profile,
            eligibility_summary: eligibility.eligibility_summary,
            eligibility_confidence: eligibility.eligibility_confidence,
          })
          .eq('id', opp.id)

        if (updateErr) {
          console.warn(`  ✗ ${opp.title.slice(0, 60)} — ${updateErr.message}`)
          errors++
          continue
        }
      }
      updated++

      if (updated % 20 === 0) {
        console.log(`  … ${updated}/${opportunities.length} traités`)
      }
    } catch (err) {
      console.warn(`  ✗ ${opp.title.slice(0, 60)} — ${(err as Error).message}`)
      errors++
    }
  }

  console.log(`\n✓ Reclassify terminé${dryRun ? ' (dry-run)' : ''}`)
  console.log(`  - ${updated} opportunités traitées`)
  console.log(`  - ${withHints} avec hints explicites (nouveaux scrapers)`)
  console.log(`  - ${textOnly} fallback inférence texte`)
  console.log(`  - ${withEligibilitySummary} avec résumé d'éligibilité`)
  console.log(`  - ${withProfileDataNeeds} demandent une donnée de profil`)
  console.log(`  - ${errors} erreurs`)
}

main().catch((err) => {
  console.error('❌ Fatal:', err)
  process.exit(1)
})
