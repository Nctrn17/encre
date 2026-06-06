#!/usr/bin/env tsx
/**
 * Reclassify — re-classification LLM des opportunités à confidence basse.
 *
 * Cible toutes les opportunités avec `classify_confidence < threshold`
 * (défaut 0.6 — le seuil human_review du pipeline). Pour chacune, retrouve
 * le raw_item d'origine via `source_url`, appelle Gemma 4 31B, et met à jour
 * `type / disciplines / audience / geo_scope / classify_confidence /
 * human_review` en DB.
 *
 * Idempotent : on stocke le nouveau confidence ; relancer ne recalculera que
 * les items toujours sous le seuil après le premier passage.
 *
 * Throttle : 4,5 s entre chaque appel LLM pour rester sous le quota Gemma
 * 4 31B free tier (15 RPM). 235 items ≈ 18 min.
 *
 * Usage :
 *   npx tsx scripts/reclassify-via-llm.ts                     (tous, < 0.6)
 *   npx tsx scripts/reclassify-via-llm.ts --dry-run           (compte mais n'appelle pas)
 *   npx tsx scripts/reclassify-via-llm.ts --limit=5           (les 5 premiers, pour tester)
 *   npx tsx scripts/reclassify-via-llm.ts --threshold=0.45    (seul fallback regex)
 *   npx tsx scripts/reclassify-via-llm.ts --emitter=DRAC      (filtre nom émetteur)
 */

import { loadEnv } from '../scrapers/lib/load-env'
loadEnv()

import { createClient } from '@supabase/supabase-js'
import { classifyOpportunity, DEFAULT_CLASSIFY_MODEL } from '../src/lib/pipeline/classify'
import type { RawItemPayload } from '../src/lib/pipeline/schemas'

const THROTTLE_MS = 4500

interface OpportunityRow {
  id: string
  title: string
  description: string | null
  emitter: string
  source_url: string
  classify_confidence: number | null
}

interface RawItemRow {
  payload: RawItemPayload
}

function parseArgs() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const get = (prefix: string) => {
    const a = args.find((x) => x.startsWith(prefix))
    return a ? a.slice(prefix.length) : null
  }
  const limit = get('--limit=') ? Number.parseInt(get('--limit=')!, 10) : null
  const threshold = get('--threshold=') ? Number.parseFloat(get('--threshold=')!) : 0.6
  const emitter = get('--emitter=')
  return { dryRun, limit, threshold, emitter }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const { dryRun, limit, threshold, emitter } = parseArgs()

  if (!process.env.GEMINI_API_KEY && !dryRun) {
    console.error('❌ GEMINI_API_KEY manquant dans .env.local')
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ Credentials Supabase manquants dans .env.local')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(
    `🔄 Reclassify LLM ${DEFAULT_CLASSIFY_MODEL}` +
      `${dryRun ? ' [dry-run]' : ''}` +
      `\n   threshold = ${threshold}` +
      `${limit ? `, limit = ${limit}` : ''}` +
      `${emitter ? `, emitter ~ ${emitter}` : ''}\n`,
  )

  // 1. Fetch opportunités sous le seuil de confidence.
  let query = supabase
    .from('opportunities')
    .select('id, title, description, emitter, source_url, classify_confidence')
    .lt('classify_confidence', threshold)
    .order('classify_confidence', { ascending: true })

  if (emitter) query = query.ilike('emitter', `%${emitter}%`)
  if (limit) query = query.limit(limit)

  const { data: opps, error: oppsErr } = await query
  if (oppsErr) {
    console.error('❌ Failed to fetch opportunities:', oppsErr.message)
    process.exit(1)
  }

  const opportunities = (opps ?? []) as OpportunityRow[]
  if (opportunities.length === 0) {
    console.log('✓ Aucune opportunité sous le seuil — rien à faire.')
    return
  }

  const eta = Math.round((opportunities.length * THROTTLE_MS) / 1000 / 60)
  console.log(`Trouvé ${opportunities.length} opportunités à reclassifier (ETA ~${eta} min)\n`)

  if (dryRun) {
    for (const opp of opportunities.slice(0, 10)) {
      console.log(`  • [${opp.classify_confidence}] ${opp.title.slice(0, 70)} — ${opp.emitter}`)
    }
    if (opportunities.length > 10) console.log(`  … et ${opportunities.length - 10} autres`)
    console.log('\n[dry-run] aucun appel LLM, aucune écriture DB.')
    return
  }

  let updated = 0
  let improved = 0
  let unchanged = 0
  let errors = 0
  let llmFailed = 0

  for (const [i, opp] of opportunities.entries()) {
    try {
      // 2. Récupère le raw_item d'origine pour reconstruire le payload riche.
      const { data: rawItems } = await supabase
        .from('raw_items')
        .select('payload')
        .eq('payload->>url', opp.source_url)
        .limit(1)

      const rawItem = (rawItems?.[0] ?? null) as RawItemRow | null
      const payload: RawItemPayload = rawItem?.payload ?? {
        title: opp.title,
        description: opp.description ?? undefined,
        emitter: opp.emitter,
        url: opp.source_url,
      }

      // 3. Appel LLM (Gemma 4 31B).
      let classification
      try {
        classification = await classifyOpportunity(payload, opp.emitter)
      } catch (err) {
        console.warn(`  ✗ LLM échec [${opp.title.slice(0, 50)}] — ${(err as Error).message}`)
        llmFailed++
        await sleep(THROTTLE_MS)
        continue
      }

      // 4. Update DB avec la nouvelle classification.
      const { error: updErr } = await supabase
        .from('opportunities')
        .update({
          type: classification.type,
          disciplines: classification.disciplines,
          audience: classification.audience,
          geo_scope: classification.geo_scope,
          classify_confidence: classification.confidence,
          human_review: classification.confidence < 0.6,
        })
        .eq('id', opp.id)

      if (updErr) {
        console.warn(`  ✗ DB update échec [${opp.title.slice(0, 50)}] — ${updErr.message}`)
        errors++
      } else {
        updated++
        const before = opp.classify_confidence ?? 0
        if (classification.confidence > before) improved++
        else unchanged++
        if (i < 5 || (i + 1) % 20 === 0) {
          console.log(
            `  ✓ [${i + 1}/${opportunities.length}] ` +
              `${before.toFixed(2)} → ${classification.confidence.toFixed(2)}  ` +
              `${opp.title.slice(0, 60)}`,
          )
        }
      }
    } catch (err) {
      console.warn(`  ✗ erreur inattendue [${opp.title.slice(0, 50)}] — ${(err as Error).message}`)
      errors++
    }

    // 5. Throttle pour rester sous 15 RPM Gemma free tier.
    if (i < opportunities.length - 1) await sleep(THROTTLE_MS)
  }

  console.log(`\n✓ Reclassify terminé`)
  console.log(`  - ${updated} updates DB réussis`)
  console.log(`    dont ${improved} confidences améliorées, ${unchanged} stables/dégradées`)
  console.log(`  - ${llmFailed} échecs LLM (rate-limit ?, garde la classif existante)`)
  console.log(`  - ${errors} erreurs DB ou inattendues`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
