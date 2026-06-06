#!/usr/bin/env tsx
/**
 * Reclassify — 2e passe LLM pour remplir les sections structurées
 * (conditions / calendrier / dossier) sur les opportunités existantes.
 *
 * Migration 0018 a ajouté ces 3 champs au schema mais les opps antérieures
 * les ont vides. Sans cette passe, la fiche détail affiche partout les
 * fallbacks "voir règlement officiel". Ce script appelle classifyOpportunity()
 * sur le payload du raw_item d'origine et stocke uniquement conditions /
 * calendrier / dossier (les autres champs ne sont pas écrasés).
 *
 * Cascade modèles (mêmes paliers que process-raw.ts) :
 *   1. Gemma 4 31B (DEFAULT_CLASSIFY_MODEL)            — quota free large
 *   2. Gemini 3 Flash (SECOND_PASS_MODEL) si confidence < 0.6
 *   3. Backoff exponentiel sur HTTP 429 (30s → 60s → 120s, 3 retries)
 *   4. Skip l'opp si tout échoue (pas de fallback local : vide=vide)
 *
 * Usage :
 *   npm run reclassify:sections                       # dry-run par défaut
 *   npm run reclassify:sections -- --apply            # exécute les UPDATE
 *   npm run reclassify:sections -- --apply --limit 5  # test sur 5 opps
 *   npm run reclassify:sections -- --apply --only-empty
 *                                                    # skip celles déjà remplies
 *
 * Coût : ~1 appel Gemma + 0-1 appel Flash par opp. Avec ~232 opps,
 * environ 1-2 cents (Gemma free + Flash paid à la marge).
 */

import { loadEnv } from '../scrapers/lib/load-env'
loadEnv()

import { createClient } from '@supabase/supabase-js'
import {
  classifyOpportunity,
  DEFAULT_CLASSIFY_MODEL,
  SECOND_PASS_MODEL,
} from '../src/lib/pipeline/classify'
import type { RawItemPayload } from '../src/lib/pipeline/schemas'
import type { ClassificationOutput } from '../src/lib/pipeline/schemas'

interface OpportunityRow {
  id: string
  title: string
  description: string | null
  source_url: string
  emitter: string
  conditions: string[] | null
  calendrier: string[] | null
  dossier: string[] | null
}

interface RawItemRow {
  payload: RawItemPayload
}

interface CliFlags {
  apply: boolean
  onlyEmpty: boolean
  limit: number | null
  delayMs: number
}

function parseFlags(): CliFlags {
  const argv = process.argv.slice(2)
  const flags: CliFlags = {
    apply: argv.includes('--apply'),
    onlyEmpty: argv.includes('--only-empty'),
    limit: null,
    delayMs: 250,
  }
  const limitIdx = argv.indexOf('--limit')
  if (limitIdx >= 0 && argv[limitIdx + 1]) {
    flags.limit = Number.parseInt(argv[limitIdx + 1], 10) || null
  }
  const delayIdx = argv.indexOf('--delay-ms')
  if (delayIdx >= 0 && argv[delayIdx + 1]) {
    flags.delayMs = Math.max(0, Number.parseInt(argv[delayIdx + 1], 10) || 250)
  }
  return flags
}

function isEmptySection(value: string[] | null): boolean {
  return !value || value.length === 0
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isQuotaError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? ''
  return /\b429\b|quota|rate.?limit|exceeded/i.test(msg)
}

/**
 * Cascade : appelle classifyOpportunity en essayant Gemma d'abord (free, gros
 * quota), puis Flash si la confidence est faible. À chaque palier, backoff
 * exponentiel 30s/60s/120s sur 429. Retourne le meilleur résultat disponible
 * ou throw si tous les paliers ont échoué.
 *
 * Circuit-breaker session : après FLASH_QUOTA_GIVE_UP_AT 429 sur Flash, on
 * considère le quota Flash épuisé pour le reste du run et on saute direct
 * à Gemma seul (Gemma a un quota beaucoup plus large).
 */
const FLASH_QUOTA_GIVE_UP_AT = 2
let flash429Count = 0
let flashGivenUp = false

async function classifyWithCascade(
  payload: RawItemPayload,
  emitter: string,
): Promise<ClassificationOutput> {
  // Palier 1 : Gemma 4 31B (gros quota gratuit)
  let primary: ClassificationOutput | null = null
  try {
    primary = await callWithBackoff(payload, emitter, DEFAULT_CLASSIFY_MODEL)
  } catch (err) {
    // Gemma a échoué : on tente Flash en dernier recours (sauf si déjà ko).
    if (flashGivenUp) throw err
    console.warn(`    [cascade] Gemma KO (${(err as Error).message.slice(0, 80)}), tentative Flash…`)
    try {
      return await callWithBackoff(payload, emitter, SECOND_PASS_MODEL)
    } catch (flashErr) {
      registerFlash429(flashErr)
      throw flashErr
    }
  }

  // Palier 2 : 2e passe Gemini Flash uniquement si Gemma a peu de confiance
  // ET que le quota Flash n'est pas déjà épuisé sur cette session.
  if (primary.confidence < 0.5 && !flashGivenUp) {
    try {
      const second = await callWithBackoff(payload, emitter, SECOND_PASS_MODEL)
      // Garde Flash uniquement s'il extrait au moins autant de sections que Gemma.
      const primaryItems =
        primary.conditions.length + primary.calendrier.length + primary.dossier.length
      const secondItems =
        second.conditions.length + second.calendrier.length + second.dossier.length
      if (secondItems >= primaryItems) return second
    } catch (err) {
      registerFlash429(err)
      console.warn(`    [cascade] Flash KO, garde Gemma : ${(err as Error).message.slice(0, 80)}`)
    }
  }
  return primary
}

function registerFlash429(err: unknown): void {
  if (!isQuotaError(err)) return
  flash429Count += 1
  if (flash429Count >= FLASH_QUOTA_GIVE_UP_AT && !flashGivenUp) {
    flashGivenUp = true
    console.warn(
      `    [cascade] Quota Flash épuisé (${flash429Count} × 429), bypass Flash pour le reste du run · Gemma seul.`,
    )
  }
}

const BACKOFF_DELAYS_MS = [30_000, 60_000, 120_000]

async function callWithBackoff(
  payload: RawItemPayload,
  emitter: string,
  model: string,
): Promise<ClassificationOutput> {
  let lastErr: unknown = null
  for (let attempt = 0; attempt <= BACKOFF_DELAYS_MS.length; attempt += 1) {
    try {
      return await classifyOpportunity(payload, emitter, { model })
    } catch (err) {
      lastErr = err
      if (!isQuotaError(err) || attempt === BACKOFF_DELAYS_MS.length) throw err
      const wait = BACKOFF_DELAYS_MS[attempt]
      console.warn(
        `    [backoff ${model}] 429 reçu, pause ${wait / 1000}s avant retry (attempt ${attempt + 1}/${BACKOFF_DELAYS_MS.length})…`,
      )
      await sleep(wait)
    }
  }
  throw lastErr as Error
}

async function main() {
  const flags = parseFlags()
  const mode = flags.apply ? 'APPLY' : 'DRY-RUN (passez --apply pour exécuter)'
  console.log(`🔄 Reclassify sections structurées · mode ${mode}`)
  if (flags.onlyEmpty) console.log(`   → filtre : opps avec au moins 1 section vide`)
  if (flags.limit) console.log(`   → limite : ${flags.limit} opps`)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ Missing GEMINI_API_KEY in .env.local (script LLM)')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let query = supabase
    .from('opportunities')
    .select('id, title, description, source_url, emitter, conditions, calendrier, dossier')
    .eq('is_published', true)
    .order('updated_at', { ascending: true })

  if (flags.limit) query = query.limit(flags.limit)

  const { data, error } = await query
  if (error) {
    console.error('❌ Failed to fetch opportunities:', error.message)
    process.exit(1)
  }

  let opps = (data ?? []) as OpportunityRow[]
  if (flags.onlyEmpty) {
    opps = opps.filter(
      (o) => isEmptySection(o.conditions) || isEmptySection(o.calendrier) || isEmptySection(o.dossier),
    )
  }

  console.log(`\nFetched ${opps.length} opportunités à traiter\n`)

  let updated = 0
  let skipped = 0
  let errors = 0
  const startMs = Date.now()

  for (let i = 0; i < opps.length; i += 1) {
    const opp = opps[i]
    const label = `[${i + 1}/${opps.length}] ${opp.title.slice(0, 70)}`

    try {
      // 1. Récupérer le raw_item d'origine pour avoir la description complète
      //    (la description en table opportunities peut être tronquée).
      const { data: rawItems } = await supabase
        .from('raw_items')
        .select('payload')
        .eq('payload->>url', opp.source_url)
        .order('created_at', { ascending: false })
        .limit(1)

      const rawPayload = ((rawItems?.[0] as RawItemRow | undefined)?.payload ?? null) as
        | RawItemPayload
        | null

      const payload: RawItemPayload = rawPayload ?? {
        title: opp.title,
        description: opp.description,
        emitter: opp.emitter,
        url: opp.source_url,
        deadline: null,
      }

      // 2. Appel LLM en cascade : Gemma 4 31B → Gemini Flash si confidence
      //    insuffisante. Backoff exponentiel sur 429 à chaque palier.
      const out = await classifyWithCascade(payload, opp.emitter)

      const newConditions = out.conditions ?? []
      const newCalendrier = out.calendrier ?? []
      const newDossier = out.dossier ?? []
      const totalItems = newConditions.length + newCalendrier.length + newDossier.length

      if (totalItems === 0) {
        console.log(`  · ${label} → 0 sections extraites, skip`)
        skipped += 1
      } else if (!flags.apply) {
        console.log(
          `  ✓ ${label} → ${newConditions.length}c · ${newCalendrier.length}cal · ${newDossier.length}d`,
        )
        updated += 1
      } else {
        const { error: updateErr } = await supabase
          .from('opportunities')
          .update({
            conditions: newConditions,
            calendrier: newCalendrier,
            dossier: newDossier,
            updated_at: new Date().toISOString(),
          })
          .eq('id', opp.id)

        if (updateErr) {
          console.warn(`  ✗ ${label} — ${updateErr.message}`)
          errors += 1
          continue
        }
        console.log(
          `  ✓ ${label} → ${newConditions.length}c · ${newCalendrier.length}cal · ${newDossier.length}d`,
        )
        updated += 1
      }
    } catch (err) {
      console.warn(`  ✗ ${label} — ${(err as Error).message.slice(0, 200)}`)
      errors += 1
    }

    // Rate limit volontaire entre appels (anti-burst sur l'API Gemini).
    if (i + 1 < opps.length) await sleep(flags.delayMs)
  }

  const durationS = ((Date.now() - startMs) / 1000).toFixed(1)
  console.log(`\n✓ Reclassify terminé en ${durationS}s`)
  console.log(`  - ${updated} opps ${flags.apply ? 'mises à jour' : 'auraient été mises à jour'}`)
  console.log(`  - ${skipped} skipped (0 section extraite)`)
  console.log(`  - ${errors} erreurs`)
  if (!flags.apply && updated > 0) {
    console.log(`\n  Pour exécuter : npm run reclassify:sections -- --apply`)
  }
}

main().catch((err) => {
  console.error('❌ Fatal:', err)
  process.exit(1)
})
