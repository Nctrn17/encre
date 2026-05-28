#!/usr/bin/env tsx
/**
 * Enrichissement des sections structurées via re-classification LLM sur le
 * **texte plein de la page source**, pas la description courte produite par
 * les scrapers de découverte.
 *
 * Pour chaque opp avec au moins une section vide (conditions / calendrier /
 * dossier), on :
 *   1. Fetch la page source_url
 *   2. Strip script/style/HTML tags pour obtenir le texte visible
 *   3. Tronque à 8KB
 *   4. Repasse au LLM (Gemma 4 31B uniquement + retries sur 429)
 *      avec ce texte enrichi en lieu et place de la description courte
 *   5. Update conditions / calendrier / dossier si extraction non vide
 *
 * Pourquoi pas de cascade vers Flash : le free tier Flash plafonne à
 * 20 RPD. Avec 3 retries de backoff par tentative, le moindre 429 brûle
 * 4 calls Flash, donc 5 cycles d'échec = quota cuit pour la journée
 * sans bénéfice (Gemma seul fait déjà l'extraction). Si Gemma 429s
 * définitivement, on skip l'opp pour cette run et le cron du lendemain
 * la reprend.
 *
 * Pas de Firecrawl, pas de Playwright : 95%+ des sites institutionnels FR
 * sont server-side rendered, le HTML statique contient tout le texte visible.
 *
 * Usage :
 *   npm run enrich:sections                       # dry-run par défaut
 *   npm run enrich:sections -- --apply            # exécute les UPDATE
 *   npm run enrich:sections -- --apply --limit 5  # test sur 5 opps
 *   npm run enrich:sections -- --apply --slug X   # une seule opp ciblée
 *   npm run enrich:sections -- --apply --emitter "CNC"
 *   npm run enrich:sections -- --apply --v1-only      # restreint au scope V1
 *                                                     # (scénaristes/auteurs AV)
 *
 * Coût : ~1 fetch + 1 appel Gemma par opp. Flash en filet de sécurité.
 */

import { loadEnv } from '../scrapers/lib/load-env'
loadEnv()

import { createClient } from '@supabase/supabase-js'
import {
  classifyOpportunity,
  DEFAULT_CLASSIFY_MODEL,
} from '../src/lib/pipeline/classify'
import {
  classifyOpportunityOpenRouter,
  DEFAULT_OPENROUTER_MODEL,
} from '../src/lib/pipeline/classify-openrouter'

// Cascade : Gemini 2.5 Flash (qualité + 1M context natif + 250 RPD)
// en primaire, Gemma 4 31B (1500 RPD, plus lent mais quota énorme) en
// fallback. Le pipeline process-raw garde son cascade Gemma → Flash car
// il fait moins de calls (~5-10/jour vs ~30+/jour pour enrich).
const PRIMARY_MODEL = 'gemini-2.5-flash'
const FALLBACK_MODEL = DEFAULT_CLASSIFY_MODEL // 'gemma-4-31b-it'
import type { ClassificationOutput, RawItemPayload } from '../src/lib/pipeline/schemas'
import { extractPageText } from '../scrapers/lib/extract-page-text'
import { extractPdfText } from '../scrapers/lib/extract-pdf-text'
import { firecrawlScrape } from '../scrapers/lib/firecrawl-helpers'
import { PILOT_SCENARISTE_TAGS } from '../src/lib/pilot-defaults'

interface OpportunityRow {
  id: string
  title: string
  description: string | null
  source_url: string
  emitter: string
  conditions: string[] | null
  calendrier: string[] | null
  dossier: string[] | null
  disciplines_tags: string[] | null
}

interface CliFlags {
  apply: boolean
  limit: number | null
  delayMs: number
  slug: string | null
  /** Plusieurs slugs séparés par virgule. Force re-traitement même si sections pleines. */
  slugs: string[] | null
  /** Récupère le texte via Firecrawl (JS rendu + accordéons) au lieu du fetch statique. */
  firecrawl: boolean
  emitter: string | null
  /**
   * Restreint aux opps V1 (disciplines_tags overlap PILOT_SCENARISTE_TAGS).
   * Permet d'économiser le quota Gemma sur les opps hors-scope du launch.
   */
  v1Only: boolean
}

/**
 * Récupère la valeur d'un flag CLI sous l'une des deux formes :
 *   --flag value      (deux args séparés)
 *   --flag=value      (un seul arg)
 * Retourne `undefined` si absent.
 */
function getFlagValue(argv: string[], name: string): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === name && argv[i + 1] != null) return argv[i + 1]
    if (a.startsWith(`${name}=`)) return a.slice(name.length + 1)
  }
  return undefined
}

function parseFlags(): CliFlags {
  const argv = process.argv.slice(2)
  const limitRaw = getFlagValue(argv, '--limit')
  const delayRaw = getFlagValue(argv, '--delay-ms')
  return {
    apply: argv.includes('--apply'),
    limit: limitRaw ? Number.parseInt(limitRaw, 10) || null : null,
    delayMs: delayRaw ? Math.max(0, Number.parseInt(delayRaw, 10) || 1000) : 1000,
    slug: getFlagValue(argv, '--slug') ?? null,
    slugs: (() => {
      const raw = getFlagValue(argv, '--slugs')
      if (!raw) return null
      const list = raw.split(',').map((s) => s.trim()).filter(Boolean)
      return list.length > 0 ? list : null
    })(),
    firecrawl: argv.includes('--firecrawl'),
    emitter: getFlagValue(argv, '--emitter') ?? null,
    v1Only: argv.includes('--v1-only'),
  }
}

function isEmptySection(value: string[] | null): boolean {
  return !value || value.length === 0
}

/**
 * Empty-or-better policy : décide si on doit écraser une section existante.
 *   - old vide → toujours fill (cas standard découverte)
 *   - new vide → jamais écraser (LLM s'est planté ou source a régressé)
 *   - new strictement > old → écraser (amélioration nette, ex: PDF parsé
 *     qui complète une extraction page-only minimale)
 *   - new <= old → préserver old (pas d'amélioration, évite régressions
 *     sur des extractions équivalentes ou marginalement meilleures)
 *
 * Cette logique remplace l'ancien check "n'écrase JAMAIS si non-vide" qui
 * empêchait les improvements quand le pipeline progressait (ex: ajout du
 * PDF parsing).
 *
 * Quand la curation manuelle sera ajoutée, prévoir un check
 * `if (manually_curated) return false` au début pour ne jamais
 * écraser un effort humain.
 */
function shouldOverwrite(oldSection: string[] | null, newSection: string[]): boolean {
  const oldLen = (oldSection ?? []).length
  if (oldLen === 0) return newSection.length > 0
  if (newSection.length === 0) return false
  return newSection.length > oldLen
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isQuotaError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? ''
  return /\b429\b|quota|rate.?limit|exceeded/i.test(msg)
}

// Backoff par modèle - Flash a un RPD très serré (250 free tier), donc dès
// le 1er 429 on bail vite et on laisse le cascade tomber sur Gemma plutôt
// que d'attendre 210s pour rien. Gemma a 1500 RPD, on peut se permettre
// un backoff plus généreux car c'est notre fallback final.
const BACKOFF_DELAYS_MS_BY_MODEL: Record<string, number[]> = {
  'gemini-2.5-flash': [5_000], // 1 retry court puis cascade → Gemma
  'gemma-4-31b-it': [30_000, 60_000, 120_000],
}
const DEFAULT_BACKOFF_MS = [30_000, 60_000, 120_000]

/**
 * Throttle par modèle (RPM réel free tier Gemini, mai 2026) :
 *   - gemini-2.5-flash : 10 RPM → 6500ms entre 2 calls (marge sur 6000)
 *   - gemma-4-31b-it   : 15 RPM → 4500ms entre 2 calls (marge sur 4000)
 *
 * Cascade : on commence par Flash 2.5 (qualité + 1M context natif) ;
 * fallback Gemma 4 31B si Flash 429 (RPD 250 plus serré sur Flash).
 */
const MODEL_MIN_INTERVAL_MS: Record<string, number> = {
  'gemini-2.5-flash': 6500,
  'gemma-4-31b-it': 4500,
}
const modelLastCallMs = new Map<string, number>()

// Circuit-breaker : après FLASH_QUOTA_GIVE_UP_AT 429 sur Flash dans la
// session, on bypass Flash pour le reste du run et on passe direct sur
// Gemma. Évite de brûler du temps en backoff sur Flash quand son quota
// journalier est cuit.
const FLASH_QUOTA_GIVE_UP_AT = 1
let flash429Count = 0
let flashGivenUp = false

async function throttleModel(model: string): Promise<void> {
  const minInterval = MODEL_MIN_INTERVAL_MS[model] ?? 4500
  const last = modelLastCallMs.get(model) ?? 0
  const elapsed = Date.now() - last
  if (elapsed < minInterval) await sleep(minInterval - elapsed)
  modelLastCallMs.set(model, Date.now())
}

/**
 * Appel LLM unique avec retry exponentiel sur 429. Utilisé par classifyCascade.
 */
async function callWithRetries(
  payload: RawItemPayload,
  emitter: string,
  model: string,
): Promise<ClassificationOutput> {
  let lastErr: unknown = null
  const backoffs = BACKOFF_DELAYS_MS_BY_MODEL[model] ?? DEFAULT_BACKOFF_MS
  for (let attempt = 0; attempt <= backoffs.length; attempt += 1) {
    await throttleModel(model)
    try {
      return await classifyOpportunity(payload, emitter, { model })
    } catch (err) {
      lastErr = err
      if (!isQuotaError(err) || attempt === backoffs.length) throw err
      const wait = backoffs[attempt]
      console.warn(`    [backoff ${model}] 429, pause ${wait / 1000}s (${attempt + 1}/${backoffs.length})…`)
      await sleep(wait)
    }
  }
  throw lastErr as Error
}

/**
 * Cascade : Gemini 2.5 Flash en primaire (qualité + 1M context),
 * Gemma 4 31B en fallback (quota énorme). Circuit-breaker à 2 × 429
 * sur Flash pour bypass durablement quand le quota Flash est cuit.
 *
 * Si Gemma cuit aussi → throw, l'opp est skip pour cette run.
 */
async function classifyWithCascade(
  payload: RawItemPayload,
  emitter: string,
): Promise<ClassificationOutput> {
  // 1. Tenter Flash si pas givenUp
  if (!flashGivenUp) {
    try {
      return await callWithRetries(payload, emitter, PRIMARY_MODEL)
    } catch (err) {
      if (isQuotaError(err)) {
        flash429Count += 1
        if (flash429Count >= FLASH_QUOTA_GIVE_UP_AT && !flashGivenUp) {
          flashGivenUp = true
          console.warn(`    [cascade] Quota Flash épuisé (${flash429Count} × 429), Gemma seul pour le reste du run.`)
        }
        console.warn(`    [cascade] Flash KO → fallback Gemma : ${(err as Error).message.slice(0, 80)}`)
      } else {
        // Erreur non-quota (5xx, network, etc.) : on tente quand même Gemma
        console.warn(`    [cascade] Flash erreur non-quota → fallback Gemma : ${(err as Error).message.slice(0, 80)}`)
      }
      // Fall through to Gemma
    }
  }

  // 2. Fallback Gemma 4 31B. Si OK → return. Si KO → tente OpenRouter
  //    en 3e étage (DeepSeek V3.1) pour les jours où Google est dégradé.
  try {
    return await callWithRetries(payload, emitter, FALLBACK_MODEL)
  } catch (err) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw err
    }
    console.warn(
      `    [cascade] Gemma KO → fallback OpenRouter ${DEFAULT_OPENROUTER_MODEL} : ${(err as Error).message.slice(0, 80)}`,
    )
    return await classifyOpportunityOpenRouter(payload, emitter)
  }
}

async function main() {
  const flags = parseFlags()
  const mode = flags.apply ? 'APPLY' : 'DRY-RUN (passez --apply pour exécuter)'
  console.log(`🔄 Enrichissement sections via texte plein page · mode ${mode}`)
  if (flags.limit) console.log(`   → limite : ${flags.limit} opps`)
  if (flags.slug) console.log(`   → slug ciblé : ${flags.slug}`)
  if (flags.emitter) console.log(`   → émetteur ciblé : ${flags.emitter}`)
  if (flags.v1Only) console.log(`   → V1-only : disciplines_tags ∩ pilote scénariste/auteur AV`)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ Missing GEMINI_API_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let query = supabase
    .from('opportunities')
    .select('id, title, description, source_url, emitter, conditions, calendrier, dossier, disciplines_tags')
    .eq('is_published', true)
    .order('updated_at', { ascending: true })
  if (flags.slug) query = query.eq('slug', flags.slug)
  if (flags.slugs) query = query.in('slug', flags.slugs)
  if (flags.emitter) query = query.eq('emitter', flags.emitter)
  if (flags.v1Only) {
    // disciplines_tags @> any(PILOT_TAGS) - ne garde que les opps qui ont au
    // moins un tag pilote scénariste/auteur AV. Cohérent avec /aides
    // et la home (cf. src/lib/pilot-defaults.ts).
    query = query.overlaps('disciplines_tags', [...PILOT_SCENARISTE_TAGS])
  }
  const { data, error } = await query
  if (error) {
    console.error('❌ Failed to fetch opportunities:', error.message)
    process.exit(1)
  }

  let opps = (data ?? []) as OpportunityRow[]
  // Filtre opps avec au moins 1 section vide (sauf si --slug/--slugs ciblé :
  // on force le re-traitement même si déjà rempli, utile pour corriger
  // des extractions buggées - calendrier expiré, mots anglais, etc.).
  if (!flags.slug && !flags.slugs) {
    opps = opps.filter(
      (o) => isEmptySection(o.conditions) || isEmptySection(o.calendrier) || isEmptySection(o.dossier),
    )
  }
  if (flags.limit) {
    opps = opps.slice(0, flags.limit)
  }
  console.log(`\nFetched ${opps.length} opps à enrichir\n`)

  let updated = 0
  let skippedNoText = 0
  let skippedNoExtract = 0
  let errors = 0
  const startMs = Date.now()

  for (let i = 0; i < opps.length; i += 1) {
    const opp = opps[i]
    const label = `[${i + 1}/${opps.length}] ${opp.title.slice(0, 60)}`

    try {
      // 1. Fetch + strip + truncate texte de la page
      // maxChars élevé : depuis le fix de removeRelatedBlocks (2026-05-07),
      // les pages CNC longues (FAJV, fonds documentaire) sortent ~35KB de
      // texte propre, avec le calendrier des sessions situé vers 28KB.
      // 35000 couvre tous les cas FR observés. Au-delà (40K+), Gemma free
      // tier peut hit des Headers Timeout côté HTTP (1ère réponse trop
      // lente). Le retry/cascade existant compense le risque résiduel.
      let combinedDescription: string
      let pageSize: number
      let pageTrunc = false
      let pdfStat = ''

      if (flags.firecrawl) {
        // Firecrawl : rend le JS et déplie les accordéons (sources type
        // TorinoFilmLab, Villa Médicis…) que le fetch statique ne voit pas.
        const fc = await firecrawlScrape(opp.source_url, {
          waitForMs: 4000,
          onlyMainContent: true,
        })
        if (!fc || fc.markdown.trim().length < 200) {
          console.log(`  ⊘ ${label} → firecrawl vide/échec, skip`)
          skippedNoText += 1
          continue
        }
        combinedDescription = fc.markdown.slice(0, 35000)
        pageSize = fc.markdown.length
        pageTrunc = fc.markdown.length > 35000
        pdfStat = ' [firecrawl]'
      } else {
        const page = await extractPageText(opp.source_url, { maxChars: 35000, minUsefulChars: 200 })
        if (!page) {
          console.log(`  ⊘ ${label} → page non récupérable, skip`)
          skippedNoText += 1
          continue
        }

        // 2. Concat le contenu de TOUS les PDFs candidates (jusqu'à 5) +
        //    une éventuelle page candidature secondaire sur le même
        //    hostname (cas Moulin d'Andé : la page principale décrit le
        //    programme, /ceci-candidature/ liste les modalités).
        //    Budget : 5 PDFs × 7200c = 36000c total + 8000c page secondaire.
        //    Page principale ~25K + extensions ~44K = ~69K. Largement dans
        //    la fenêtre 1M de Gemini Flash 2.5 et Gemma 4 31B.
        combinedDescription = page.text
        pageSize = page.textSize
        pageTrunc = page.truncated
        const pdfStats: string[] = []
        const PDF_COUNT_MAX = 5
        const PDF_TOTAL_BUDGET = 36000
        const pdfsToFetch = page.pdfCandidates.slice(0, PDF_COUNT_MAX)
        const pdfBudgetPer = pdfsToFetch.length > 0
          ? Math.floor(PDF_TOTAL_BUDGET / pdfsToFetch.length)
          : 0
        const pdfTexts: string[] = []
        for (const pdfUrl of pdfsToFetch) {
          const pdf = await extractPdfText(pdfUrl, { maxChars: pdfBudgetPer })
          if (!pdf) continue
          const filename = pdfUrl.split('/').pop()?.slice(0, 80) ?? 'pdf'
          pdfTexts.push(`———— PDF : ${filename} (${pdf.pages} pages, ${pdf.textSize}c) ————\n${pdf.text}`)
          pdfStats.push(`${pdf.textSize}c`)
        }

        // 2bis. Page candidature secondaire si détectée
        let followupStat = ''
        if (page.followupUrl) {
          const followupPage = await extractPageText(page.followupUrl, {
            maxChars: 8000,
            minUsefulChars: 200,
          })
          if (followupPage) {
            pdfTexts.push(`———— Page candidature : ${page.followupUrl} (${followupPage.textSize}c) ————\n${followupPage.text}`)
            followupStat = `, followup ${followupPage.textSize}c`
          }
        }

        if (pdfTexts.length > 0) {
          combinedDescription = `${page.text}\n\n${pdfTexts.join('\n\n')}`
        }
        pdfStat = (pdfStats.length > 0 ? `, pdfs ${pdfStats.join('+')}` : '') + followupStat
      }

      // 3. Construit un payload enrichi (page + PDF si trouvé)
      const enrichedPayload: RawItemPayload = {
        title: opp.title,
        description: combinedDescription,
        emitter: opp.emitter,
        url: opp.source_url,
        deadline: null,
      }

      // 4. Appel LLM (Gemma seul + retries sur 429)
      const out = await classifyWithCascade(enrichedPayload, opp.emitter)
      const newConditions = out.conditions ?? []
      const newCalendrier = out.calendrier ?? []
      const newDossier = out.dossier ?? []
      const totalItems = newConditions.length + newCalendrier.length + newDossier.length

      if (totalItems === 0) {
        console.log(`  · ${label} → 0 sections extraites (page ${pageSize}c${pdfStat}), skip`)
        skippedNoExtract += 1
      } else if (!flags.apply) {
        console.log(
          `  ✓ ${label} → ${newConditions.length}c · ${newCalendrier.length}cal · ${newDossier.length}d (page ${pageSize}c${pageTrunc ? ', tronqué' : ''}${pdfStat})`,
        )
        updated += 1
      } else {
        // 4. UPDATE - empty-or-better policy :
        //   - Section vide → fill avec new (cas standard)
        //   - Section non-vide :
        //     - new STRICTEMENT plus d'items que old → overwrite (amélioration
        //       genre PDF parsé qui ajoute des conditions manquantes)
        //     - new vide → préserve old (le LLM s'est planté ou page changée)
        //     - new <= old → préserve old (pas d'amélioration nette, évite régression)
        // Quand on aura curation manuelle, ajouter un check `manually_curated`
        // qui skip cette logique (= jamais d'auto-overwrite sur curation humaine).
        const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (shouldOverwrite(opp.conditions, newConditions)) updatePayload.conditions = newConditions
        if (shouldOverwrite(opp.calendrier, newCalendrier)) updatePayload.calendrier = newCalendrier
        if (shouldOverwrite(opp.dossier, newDossier)) updatePayload.dossier = newDossier

        if (Object.keys(updatePayload).length === 1) {
          // Rien à update (toutes les sections sont stables ou pas d'amélioration)
          console.log(`  · ${label} → rien à update (pas d'amélioration nette)`)
          continue
        }

        const { error: updateErr } = await supabase
          .from('opportunities')
          .update(updatePayload)
          .eq('id', opp.id)

        if (updateErr) {
          console.warn(`  ✗ ${label} - ${updateErr.message}`)
          errors += 1
          continue
        }
        const fields = ['conditions', 'calendrier', 'dossier'].filter((k) => k in updatePayload).join('+')
        console.log(
          `  ✓ ${label} → ${newConditions.length}c · ${newCalendrier.length}cal · ${newDossier.length}d (updated: ${fields})`,
        )
        updated += 1
      }
    } catch (err) {
      console.warn(`  ✗ ${label} - ${(err as Error).message.slice(0, 200)}`)
      errors += 1
    }

    if (i + 1 < opps.length) await sleep(flags.delayMs)
  }

  const durationS = ((Date.now() - startMs) / 1000).toFixed(1)
  console.log(`\n✓ Enrichissement terminé en ${durationS}s`)
  console.log(`  - ${updated} opps ${flags.apply ? 'mises à jour' : 'auraient été mises à jour'}`)
  console.log(`  - ${skippedNoText} skip (page non récupérable)`)
  console.log(`  - ${skippedNoExtract} skip (LLM 0 extractions sur texte enrichi)`)
  console.log(`  - ${errors} erreurs`)
  if (!flags.apply && updated > 0) console.log(`\n  Pour exécuter : npm run enrich:sections -- --apply`)
}

main().catch((err) => {
  console.error('❌ Fatal:', err)
  process.exit(1)
})
