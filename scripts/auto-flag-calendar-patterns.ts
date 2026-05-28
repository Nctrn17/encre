#!/usr/bin/env tsx
/**
 * Backfill : détecte le pattern de calendrier (continuous / awaiting /
 * partial Format C / unknown empty) pour les opps publiées avec un
 * calendrier vide ou partiellement extrait, et applique les corrections.
 *
 * Pour chaque opp candidate :
 *   1. Fetch le texte plein de source_url via extractPageText
 *   2. Run detectCalendarPattern(text, calendrier)
 *   3. Décide selon le verdict :
 *      - `continuous`        → calendrier = ["Flux continu, pas de commission"]
 *      - `awaiting_next`     → next_edition_status = 'awaiting_details'
 *      - `unknown_empty`     → next_edition_status = 'awaiting_details' (fail-safe)
 *      - `partial_format_c`  → log uniquement (re-classify LLM via enrich,
 *                              hors scope de ce script)
 *      - `ok`                → skip
 *   4. Si --apply, exécute le UPDATE
 *
 * Modes :
 *   - défaut : dry-run (affiche ce qui serait fait, ne modifie rien)
 *   - --apply : exécute les UPDATEs
 *
 * Filtres :
 *   - --emitter CNC : limite à un émetteur (sinon tous les émetteurs sont
 *     candidats - la logique est générique, pas spécifique au CNC)
 *   - --limit N : limite le nombre d'opps traitées
 *
 * Pré-requis : module src/lib/pipeline/calendar-pattern.ts.
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { createClient } from '@supabase/supabase-js'
import {
  detectCalendarPattern,
  applyContinuousFlowOverride,
  synthesizeFormatAFromProchaineList,
  CONTINUOUS_FLOW_ITEM,
  type CalendarPattern,
} from '../src/lib/pipeline/calendar-pattern'
import { normalizeSectionList } from '../src/lib/normalize/section-item'
import { extractPageText } from '../scrapers/lib/extract-page-text'

interface Opp {
  id: string
  slug: string
  title: string
  emitter: string
  source_url: string
  calendrier: string[] | null
  next_edition_status: string | null
  is_published: boolean
}

interface Decision {
  action:
    | 'set_continuous'
    | 'synthesize_format_a'
    | 'flag_awaiting'
    | 'log_partial'
    | 'log_unknown'
    | 'skip'
  patchCalendrier?: string[]
  patchNextEditionStatus?: 'awaiting_details'
  reason: string
}

function decide(
  pattern: CalendarPattern,
  currentCal: string[],
  currentNes: string | null,
  synthesized: string[] | null,
): Decision {
  if (pattern === 'continuous') {
    // Évite un UPDATE inutile si déjà au bon état
    if (
      currentCal.length === 1 &&
      currentCal[0] === CONTINUOUS_FLOW_ITEM
    ) {
      return { action: 'skip', reason: 'déjà flagué continuous' }
    }
    return {
      action: 'set_continuous',
      patchCalendrier: applyContinuousFlowOverride(currentCal, 'continuous'),
      reason: 'flux continu détecté',
    }
  }
  // Si on a réussi à synthétiser un Format A depuis le pattern « Prochaine
  // date limite : <liste> », on l'applique en priorité - c'est plus
  // utile au user qu'un flag awaiting_details vide.
  if (synthesized && synthesized.length >= 2 && currentCal.length === 0) {
    return {
      action: 'synthesize_format_a',
      patchCalendrier: synthesized,
      reason: `synthèse Format A depuis pattern « Prochaine date limite » (${synthesized.length} dates)`,
    }
  }
  if (pattern === 'awaiting_next') {
    // On ne flag QUE si un marqueur explicite a été trouvé. Les
    // `unknown_empty` (calendrier vide sans marqueur) sont traités en
    // log_unknown - ils peuvent être Case A (extraction LLM ratée alors
    // que la page a bien un calendrier), et flagger awaiting_details
    // afficherait un bandeau trompeur à l'utilisateur.
    if (currentNes === 'awaiting_details') {
      return { action: 'skip', reason: 'déjà flagué awaiting_details' }
    }
    return {
      action: 'flag_awaiting',
      patchNextEditionStatus: 'awaiting_details',
      reason: 'cycle suivant non encore annoncé (marqueur explicite)',
    }
  }
  if (pattern === 'partial_format_c') {
    return {
      action: 'log_partial',
      reason: 'extraction Format C tronquée - à re-classify via enrich-from-page',
    }
  }
  if (pattern === 'unknown_empty') {
    return {
      action: 'log_unknown',
      reason:
        'calendrier vide sans marqueur identifiable - possiblement extraction ratée (Case A), à curer manuellement',
    }
  }
  return { action: 'skip', reason: 'ok' }
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const emitterIdx = args.indexOf('--emitter')
  const emitter = emitterIdx >= 0 ? args[emitterIdx + 1] : null
  const limitIdx = args.indexOf('--limit')
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : null

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let q = sb
    .from('opportunities')
    .select(
      'id, slug, title, emitter, source_url, calendrier, next_edition_status, is_published',
    )
    .eq('is_published', true)
    .order('updated_at', { ascending: false })

  if (emitter) {
    q = q.eq('emitter', emitter)
  }
  if (limit) {
    q = q.limit(limit)
  }

  const { data, error } = await q
  if (error) {
    console.error('DB query failed:', error)
    process.exit(1)
  }

  const opps = ((data ?? []) as unknown as Opp[]).filter(
    (o) => !o.calendrier || o.calendrier.length < 3,
  )

  console.log(
    `\nMode : ${apply ? 'APPLY' : 'DRY-RUN'} | Filter : emitter=${emitter ?? 'all'} | Candidates : ${opps.length}\n`,
  )

  const tally = {
    set_continuous: 0,
    synthesize_format_a: 0,
    flag_awaiting: 0,
    log_partial: 0,
    log_unknown: 0,
    skip: 0,
    fetch_failed: 0,
  }

  for (const o of opps) {
    const cal = o.calendrier ?? []
    const calLen = cal.length
    const tag = `[${calLen}cal nes=${o.next_edition_status ?? '-'}]`

    const page = await extractPageText(o.source_url, {
      // 35000 : aligné avec enrich-from-page.ts. Les pages CNC longues
      // (FAJV, fonds documentaire) ont leur calendrier vers 28KB.
      maxChars: 35000,
      minUsefulChars: 200,
    })

    if (!page) {
      console.log(`  ⚠ FETCH_FAILED  ${tag}  ${o.title}`)
      console.log(`               → ${o.source_url}`)
      tally.fetch_failed++
      continue
    }

    const verdict = detectCalendarPattern(page.text, cal)
    const synthesizedRaw = synthesizeFormatAFromProchaineList(page.text)
    const synthesized = synthesizedRaw
      ? normalizeSectionList(synthesizedRaw, 'calendrier')
      : null
    const decision = decide(verdict.pattern, cal, o.next_edition_status, synthesized)

    const verdictLabel = verdict.pattern.padEnd(18)
    const actionLabel = decision.action.padEnd(15)
    console.log(
      `  ${verdictLabel} → ${actionLabel}  ${tag}  ${o.title.slice(0, 60)}`,
    )
    if (verdict.evidence) {
      console.log(`               evidence: "${verdict.evidence}"`)
    }
    console.log(`               reason  : ${decision.reason}`)
    console.log(`               url     : ${o.source_url}`)

    tally[decision.action]++

    const shouldUpdate =
      apply &&
      decision.action !== 'skip' &&
      decision.action !== 'log_partial' &&
      decision.action !== 'log_unknown'
    if (shouldUpdate) {
      const update: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }
      if (decision.patchCalendrier) {
        update.calendrier = decision.patchCalendrier
      }
      if (decision.patchNextEditionStatus) {
        update.next_edition_status = decision.patchNextEditionStatus
      }
      const { error: upErr } = await sb
        .from('opportunities')
        .update(update)
        .eq('id', o.id)
      if (upErr) {
        console.log(`               ✗ UPDATE failed: ${upErr.message}`)
      } else {
        console.log(`               ✓ APPLIED`)
      }
    }
    console.log('')
  }

  console.log(`\n=== Tally ===`)
  console.log(`  set_continuous      : ${tally.set_continuous}`)
  console.log(`  synthesize_format_a : ${tally.synthesize_format_a}`)
  console.log(`  flag_awaiting       : ${tally.flag_awaiting}`)
  console.log(`  log_partial         : ${tally.log_partial}`)
  console.log(`  log_unknown         : ${tally.log_unknown}`)
  console.log(`  skip                : ${tally.skip}`)
  console.log(`  fetch_failed        : ${tally.fetch_failed}`)
  if (!apply) {
    console.log(`\n(Dry-run - pass --apply to execute the updates.)`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
