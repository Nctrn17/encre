/**
 * Orchestrateur de traitement des raw_items.
 *
 * Appelé par :
 *   - pg_cron toutes les 15 min (via Edge Function)
 *   - Route API `/api/cron/process-raw` (trigger manuel admin)
 *   - Script CLI en dev
 *
 * Flow par item :
 *   1. Fetch batch raw_items.status = 'pending' (limit 50)
 *   2. Pour chaque item :
 *      a. Vérifier hard cap quotidien (daily_counters)
 *      b. Classification (Gemma 4 31B → Gemini 3 Flash 2ᵉ passe → fallback local)
 *      c. Normalisation → OpportunityDraft
 *      d. Dedup fingerprint (SELECT WHERE fingerprint = ...)
 *      e. Si pas de match : générer embedding + dedup sémantique
 *      f. Si toujours pas de doublon : INSERT opportunities + embedding
 *      g. Mark raw_item.processed / duplicate / error
 */

import { createServiceClient } from '@/lib/supabase/server'
import { RawItemPayloadSchema } from './schemas'
import {
  classifyOpportunity,
  classifyLocalFallback,
  SECOND_PASS_MODEL,
} from './classify'
import { embedText, findSemanticDuplicate } from './similarity'
import { normalizeRawItem } from './normalize'
import { gradeExtractionQuality } from './extraction-quality'
import { deadlinesCompatible } from './dedup-rules'

export interface ProcessResult {
  processed: number
  duplicates: number
  errors: number
  throttled: number
  /**
   * Opportunités ressuscitées : un fingerprint déjà connu mais marqué
   * `is_published = false` (typiquement par l'audit URLs comme dead) a été
   * re-rencontré dans un nouveau scrape. La nouvelle source_url remplace
   * l'ancienne et l'opp repasse en `is_published = true`.
   */
  revived: number
}

const DAILY_CLASSIFY_CAP = 1000

export async function processRawBatch(batchSize = 50): Promise<ProcessResult> {
  const supabase = createServiceClient()
  const result: ProcessResult = { processed: 0, duplicates: 0, errors: 0, throttled: 0, revived: 0 }

  const { data: rawItems, error } = await supabase
    .from('raw_items')
    .select('id, source_id, external_id, payload, sources!inner(slug, name)')
    .eq('status', 'pending')
    .order('scraped_at', { ascending: true })
    .limit(batchSize)

  if (error) throw error
  if (!rawItems || rawItems.length === 0) return result

  for (const item of rawItems as any[]) {
    try {
      // 1. Vérifier hard cap quotidien
      const { data: count } = await supabase.rpc('increment_daily_counter', {
        counter_name_param: 'classify_calls',
        by_amount: 1,
      })
      if (count && count > DAILY_CLASSIFY_CAP) {
        await supabase
          .from('raw_items')
          .update({ status: 'throttled', processed_at: new Date().toISOString() })
          .eq('id', item.id)
        result.throttled++
        continue
      }

      const payloadParsed = RawItemPayloadSchema.safeParse(item.payload)
      if (!payloadParsed.success) {
        await markError(supabase, item.id, `Invalid payload: ${JSON.stringify(payloadParsed.error.flatten())}`)
        result.errors++
        continue
      }
      const payload = payloadParsed.data
      const emitterName = payload.emitter || item.sources.name

      // 2. Classification : Gemma 4 31B → 2ᵉ passe Gemini 3 Flash si confidence < 0.6
      //    → regex en filet final si l'API échoue ou pas de clé.
      const useLocalFallback = !process.env.GEMINI_API_KEY
      let classification = useLocalFallback
        ? classifyLocalFallback(payload, emitterName)
        : await classifyOpportunity(payload, emitterName).catch((err) => {
            console.warn('[process-raw] classify failed, fallback:', err.message)
            return classifyLocalFallback(payload, emitterName)
          })

      // 2ᵉ passe Gemini 3 Flash sur les items ambigus (quota free 20/jour suffit
      // largement pour les rares cas que Gemma ne tranche pas franchement).
      if (!useLocalFallback && classification.confidence < 0.6) {
        try {
          const secondPass = await classifyOpportunity(payload, emitterName, {
            model: SECOND_PASS_MODEL,
          })
          if (secondPass.confidence >= classification.confidence) {
            classification = secondPass
          }
        } catch (err) {
          // Quota Gemini 3 Flash épuisé ou erreur réseau : on garde la 1re passe Gemma.
          console.warn('[process-raw] 2nd pass failed, keeping 1st:', (err as Error).message)
        }
      }

      // 3. Normalisation
      const draft = normalizeRawItem({
        payload,
        classification,
        sourceSlug: item.sources.slug,
      })
      if (!draft) {
        await markError(supabase, item.id, 'Normalization returned null (missing required fields)')
        result.errors++
        continue
      }

      // 3b. Gate qualité de publication.
      //     Si une dimension (conditions / calendrier / dossier) est vide alors
      //     que la source la mentionne, ou si le calendrier n'est qu'un en-tête
      //     de sessions récurrentes sans date de clôture, on bloque la
      //     publication publique (human_review = true) au lieu de servir une
      //     fiche partielle. L'opp part alors en file de curation admin.
      //     Conforme au standard « aucune opp publiée avec donnée partielle ».
      const quality = gradeExtractionQuality({
        sourceText: payload.description,
        sections: {
          conditions: draft.conditions,
          calendrier: draft.calendrier,
          dossier: draft.dossier,
        },
        classifyConfidence: draft.classify_confidence,
        deadlineKnown: Boolean(draft.deadline),
      })
      const humanReview = draft.human_review || !quality.canSendDigest

      // 4. Dedup fingerprint strict
      //    On récupère aussi is_published + source_url pour détecter le cas
      //    d'une revivification (opp marquée dead par l'audit, mais le scraper
      //    la retrouve aujourd'hui à une URL valide → on republie).
      const { data: fpMatch } = await supabase
        .from('opportunities')
        .select('id, is_published, rejected, source_url, mirror_urls')
        .eq('fingerprint', draft.fingerprint)
        .maybeSingle()

      if (fpMatch) {
        const matched = fpMatch as {
          id: string
          is_published: boolean
          rejected: boolean
          source_url: string
          mirror_urls: string[] | null
        }
        if (matched.is_published) {
          await markDuplicate(supabase, item.id, matched.id, draft.source_url)
          result.duplicates++
          continue
        }
        // Pierre tombale : annonce écartée par curation humaine (migration 0040).
        // On NE ressuscite JAMAIS une fiche rejetée — sa ligne existe uniquement
        // pour que son fingerprint bloque toute recréation au scrape suivant.
        if (matched.rejected) {
          await markDuplicate(supabase, item.id, matched.id, draft.source_url)
          result.duplicates++
          continue
        }
        // Revival : l'opp avait été désactivée (audit URL morte). Le nouveau
        // scrape ramène le même fingerprint → l'opportunité existe encore,
        // juste à une URL potentiellement différente.
        await reviveOpportunity(supabase, item.id, matched, draft.source_url)
        result.revived++
        continue
      }

      // 5a. Dédup secondaire tolérante à la deadline.
      //     Couvre le cas : opp déjà publiée avec deadline absente (ou
      //     différente), puis re-scrapée avec une deadline (source mise à jour
      //     ou backfill) sous un nouvel external_id. Le fingerprint inclut la
      //     deadline : il diffère alors et on insérerait un doublon. On exige
      //     même émetteur + même titre exact et des deadlines compatibles
      //     (une absente, ou < 30 j d'écart) avant de fusionner. Les éditions
      //     dont les deadlines divergent de > 30 j restent des opps distinctes.
      const { data: titleMatches } = await supabase
        .from('opportunities')
        .select('id, deadline')
        .eq('emitter_slug', draft.emitter_slug)
        .eq('title', draft.title)
        .eq('is_published', true)
      const titleMatch = (
        (titleMatches as Array<{ id: string; deadline: string | null }> | null) ?? []
      ).find((m) => deadlinesCompatible(m.deadline, draft.deadline ?? null))
      if (titleMatch) {
        // Rafraîchit la deadline si l'existante était absente et qu'on en a
        // une désormais (évite une fiche figée sans date).
        if (!titleMatch.deadline && draft.deadline) {
          await supabase
            .from('opportunities')
            .update({ deadline: draft.deadline, updated_at: new Date().toISOString() })
            .eq('id', titleMatch.id)
        }
        await markDuplicate(supabase, item.id, titleMatch.id, draft.source_url)
        result.duplicates++
        continue
      }

      // 5. Embedding + dedup sémantique
      let embedding: number[] | null = null
      if (process.env.VOYAGE_API_KEY) {
        try {
          embedding = await embedText(
            `${draft.title}\n${draft.emitter}\n${draft.description ?? ''}`,
          )
          const semDupe = await findSemanticDuplicate({
            embedding,
            deadline: draft.deadline ?? null,
            emitterSlug: draft.emitter_slug,
          })
          if (semDupe) {
            await markDuplicate(supabase, item.id, semDupe.opportunityId, draft.source_url)
            result.duplicates++
            continue
          }
        } catch (err) {
          console.warn('[process-raw] embedding failed:', (err as Error).message)
        }
      }

      // 6. Insert opportunité + embedding
      const { data: inserted, error: insertErr } = await supabase
        .from('opportunities')
        .insert({
          slug: draft.slug,
          title: draft.title,
          description: draft.description,
          emitter: draft.emitter,
          emitter_slug: draft.emitter_slug,
          type: draft.type,
          disciplines: draft.disciplines,
          audience: draft.audience,
          geo_scope: draft.geo_scope,
          region_code: draft.region_code,
          amount_min: draft.amount_min,
          amount_max: draft.amount_max,
          currency: draft.currency,
          deadline: draft.deadline,
          source_url: draft.source_url,
          mirror_urls: draft.mirror_urls,
          fingerprint: draft.fingerprint,
          classify_confidence: draft.classify_confidence,
          human_review: humanReview,
          // ── Champs pilote scénariste (migration 0011) ────────────────
          hors_reseau_friendly: draft.hors_reseau_friendly,
          min_films_produits: draft.min_films_produits,
          requires_producer: draft.requires_producer,
          age_max: draft.age_max,
          disciplines_tags: draft.disciplines_tags,
          // ── Filtre auteurs littéraires (migration 0019) ──────────────
          requires_editor: draft.requires_editor,
          // ── Sections structurées (migration 0018) ────────────────────
          conditions: draft.conditions,
          calendrier: draft.calendrier,
          dossier: draft.dossier,
          eligibility_profile: draft.eligibility_profile,
          eligibility_summary: draft.eligibility_summary,
          eligibility_confidence: draft.eligibility_confidence,
        })
        .select('id')
        .single()

      if (insertErr) {
        await markError(supabase, item.id, `Insert failed: ${insertErr.message}`)
        result.errors++
        continue
      }

      if (embedding && inserted) {
        await supabase.from('opportunity_embeddings').insert({
          opportunity_id: (inserted as any).id,
          embedding,
        })
      }

      await supabase
        .from('raw_items')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('id', item.id)

      result.processed++
    } catch (err) {
      await markError(supabase, item.id, (err as Error).message)
      result.errors++
    }
  }

  return result
}

async function markError(supabase: any, rawId: number | bigint, msg: string) {
  await supabase
    .from('raw_items')
    .update({
      status: 'error',
      error_msg: msg.slice(0, 500),
      processed_at: new Date().toISOString(),
    })
    .eq('id', rawId)
}

async function markDuplicate(
  supabase: any,
  rawId: number | bigint,
  existingOppId: string,
  mirrorUrl: string,
) {
  await supabase
    .from('raw_items')
    .update({ status: 'duplicate', processed_at: new Date().toISOString() })
    .eq('id', rawId)

  // Append l'URL source au tableau mirror_urls de l'opportunité canonique.
  // (Ancien code utilisait un .rpc('exec_sql').catch() mort — supprimé car
  //  le client Supabase ne supporte pas .catch() sur les thenables et
  //  l'appel n'avait de toute façon pas de SQL à exécuter.)
  const { data: existing } = await supabase
    .from('opportunities')
    .select('mirror_urls')
    .eq('id', existingOppId)
    .single()

  if (existing) {
    const current = (existing as any).mirror_urls ?? []
    if (!current.includes(mirrorUrl)) {
      await supabase
        .from('opportunities')
        .update({ mirror_urls: [...current, mirrorUrl] })
        .eq('id', existingOppId)
    }
  }
}

/**
 * Ressuscite une opportunité précédemment marquée `is_published = false`
 * (typiquement par l'audit URLs qui l'avait classée dead).
 *
 * Politique :
 *  - Si la nouvelle URL diffère de l'ancienne, on la stocke comme nouvelle
 *    `source_url` canonique et l'ancienne file dans `mirror_urls` (au cas où
 *    le 404 était transitoire et qu'elle revienne à la vie plus tard).
 *  - On efface `human_review` à false (le mark-dead pouvait l'avoir mis à
 *    true) et on bump `updated_at`.
 *  - Le raw_item passe en `processed` (pas un duplicate, c'est bien un re-fetch
 *    utile).
 */
async function reviveOpportunity(
  supabase: any,
  rawId: number | bigint,
  existing: { id: string; source_url: string; mirror_urls: string[] | null },
  newSourceUrl: string,
) {
  const isNewUrl = newSourceUrl !== existing.source_url
  const mirrors = existing.mirror_urls ?? []
  const nextMirrors = isNewUrl && !mirrors.includes(existing.source_url)
    ? [...mirrors, existing.source_url]
    : mirrors

  await supabase
    .from('opportunities')
    // La machine ne publie JAMAIS (invariant 2026-06-01) : on rafraîchit
    // seulement l'URL source recouvrée, sans toucher à is_published / human_review
    // / next_edition_status. La fiche reste dans son état (candidate / awaiting /
    // dépubliée) ; seule la curation humaine peut (re)publier.
    .update({
      source_url: isNewUrl ? newSourceUrl : existing.source_url,
      mirror_urls: nextMirrors,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)

  await supabase
    .from('raw_items')
    .update({ status: 'processed', processed_at: new Date().toISOString() })
    .eq('id', rawId)

  console.log(
    `[process-raw] revived opp ${existing.id}` +
      (isNewUrl ? ` (URL ${existing.source_url} → ${newSourceUrl})` : ''),
  )
}
