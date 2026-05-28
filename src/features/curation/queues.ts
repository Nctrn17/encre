/**
 * Files de curation hebdomadaire - utilisées par :
 *   - /admin/curation (surface de travail)
 *   - scripts/curation-digest.ts (email samedi 8 h)
 *
 * 6 files (V1) :
 *   1. humanReview : opps bloquées avant diffusion dans les digests
 *      (`human_review=true`) jusqu'à validation admin
 *   2. awaitingDetails : opps flaggées `next_edition_status='awaiting_details'`
 *      à re-vérifier pour voir si la nouvelle édition est annoncée
 *   3. partialExtraction : opps publiées avec au moins une dimension vide
 *      (conditions, calendrier ou dossier = []) → curation manuelle
 *   4. expired : opps publiées dont la deadline est passée → désindexer
 *      ou flagger awaiting_details
 *   5. newThisWeek : opps publiées dans les 7 derniers jours → sanity
 *      check de la qualité du classifieur sur les nouvelles entrées
 *   6. eligibilityReview : opps avec signaux d'éligibilité sensible mais
 *      éligibilité structurée absente ou incomplète
 */
import { createServiceClient } from '@/lib/supabase/server'
import { PILOT_SCENARISTE_TAGS } from '@/lib/pilot-defaults'

export interface CurationOpp {
  id: string
  slug: string
  title: string
  emitter: string
  source_url: string
  deadline: string | null
  conditions: string[]
  calendrier: string[]
  dossier: string[]
  description: string | null
  disciplines_tags: string[]
  hors_reseau_friendly: boolean
  requires_producer: boolean
  eligibility_summary: string | null
  eligibility_profile: Record<string, unknown>
  next_edition_status: 'open' | 'awaiting_details' | null
  is_published: boolean
  human_review: boolean
  updated_at: string
  created_at: string
}

export interface CurationQueues {
  humanReview: CurationOpp[]
  awaitingDetails: CurationOpp[]
  partialExtraction: CurationOpp[]
  expired: CurationOpp[]
  newThisWeek: CurationOpp[]
  eligibilityReview: CurationOpp[]
  hiddenByBetaScope: CurationOpp[]
  generatedAt: string
}

export interface CurationQueueOptions {
  scope?: 'beta' | 'all'
}

const SELECT_COLS =
  'id,slug,title,description,emitter,source_url,deadline,conditions,calendrier,dossier,disciplines_tags,hors_reseau_friendly,requires_producer,eligibility_summary,eligibility_profile,next_edition_status,is_published,human_review,updated_at,created_at'

const BETA_EXCLUDED_TAGS = new Set(['non-scenariste', 'pays-du-sud', 'foreign-only'])
const BETA_LOW_SIGNAL_EMITTERS = new Set([
  'Centre national du livre',
  'Ministère de la Culture',
])

const BETA_STRONG_TAGS = new Set([
  'scenario',
  'cinema',
  'audiovisuel',
  'documentaire',
  'court-metrage',
  'long-metrage',
  'serie',
  'animation',
  'sonore',
  'web',
])

function normalizeOpp(raw: Record<string, unknown>): CurationOpp {
  return {
    id: String(raw.id),
    slug: String(raw.slug),
    title: String(raw.title),
    emitter: String(raw.emitter),
    source_url: String(raw.source_url),
    deadline: (raw.deadline as string | null) ?? null,
    conditions: (raw.conditions as string[] | null) ?? [],
    calendrier: (raw.calendrier as string[] | null) ?? [],
    dossier: (raw.dossier as string[] | null) ?? [],
    description: (raw.description as string | null) ?? null,
    disciplines_tags: (raw.disciplines_tags as string[] | null) ?? [],
    hors_reseau_friendly: Boolean(raw.hors_reseau_friendly),
    requires_producer: Boolean(raw.requires_producer),
    eligibility_summary: (raw.eligibility_summary as string | null) ?? null,
    eligibility_profile: isRecord(raw.eligibility_profile) ? raw.eligibility_profile : {},
    next_edition_status: (raw.next_edition_status as CurationOpp['next_edition_status']) ?? null,
    is_published: Boolean(raw.is_published),
    human_review: Boolean(raw.human_review),
    updated_at: String(raw.updated_at),
    created_at: String(raw.created_at),
  }
}

export async function getCurationQueues(options: CurationQueueOptions = {}): Promise<CurationQueues> {
  const scope = options.scope ?? 'beta'
  const sb = createServiceClient()
  const nowIso = new Date().toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [humanReviewResult, awaitingResult, partialResult, expiredResult, newWeekResult] = await Promise.all([
    sb
      .from('opportunities')
      .select(SELECT_COLS)
      .eq('is_published', true)
      .eq('human_review', true)
      .order('updated_at', { ascending: false }),

    sb
      .from('opportunities')
      .select(SELECT_COLS)
      .eq('is_published', true)
      .eq('next_edition_status', 'awaiting_details')
      .overlaps('disciplines_tags', [...PILOT_SCENARISTE_TAGS])
      .order('updated_at', { ascending: false }),

    // Partial = au moins 1 dimension vide. On ne peut pas exprimer ce OR
    // simplement en .or() sur arrays vides → on filtre côté client après
    // un select large.
    sb
      .from('opportunities')
      .select(SELECT_COLS)
      .eq('is_published', true)
      .overlaps('disciplines_tags', [...PILOT_SCENARISTE_TAGS])
      .or(`deadline.is.null,deadline.gt.${nowIso}`)
      .order('updated_at', { ascending: false }),

    sb
      .from('opportunities')
      .select(SELECT_COLS)
      .eq('is_published', true)
      .lt('deadline', nowIso)
      .order('deadline', { ascending: false })
      .limit(50),

    sb
      .from('opportunities')
      .select(SELECT_COLS)
      .eq('is_published', true)
      .gte('created_at', sevenDaysAgo)
      .overlaps('disciplines_tags', [...PILOT_SCENARISTE_TAGS])
      .order('created_at', { ascending: false }),
  ])

  if (humanReviewResult.error) throw humanReviewResult.error
  if (awaitingResult.error) throw awaitingResult.error
  if (partialResult.error) throw partialResult.error
  if (expiredResult.error) throw expiredResult.error
  if (newWeekResult.error) throw newWeekResult.error

  const humanReview = (humanReviewResult.data ?? []).map((r) => normalizeOpp(r as Record<string, unknown>))
  const awaiting = (awaitingResult.data ?? []).map((r) => normalizeOpp(r as Record<string, unknown>))
  const allActives = (partialResult.data ?? []).map((r) => normalizeOpp(r as Record<string, unknown>))
  const expired = (expiredResult.data ?? []).map((r) => normalizeOpp(r as Record<string, unknown>))
  const newThisWeek = (newWeekResult.data ?? []).map((r) => normalizeOpp(r as Record<string, unknown>))
  const eligibilityReview = allActives.filter(hasEligibilityReviewSignal)

  // Partial = au moins une dim vide ET pas déjà flaggé awaiting_details
  // (sinon doublons : awaiting_details signale déjà l'absence de pièces).
  const partial = allActives.filter(
    (o) =>
      o.next_edition_status !== 'awaiting_details' &&
      (o.conditions.length === 0 ||
        o.calendrier.length === 0 ||
        o.dossier.length === 0),
  )
  const rawQueues = {
    humanReview,
    awaitingDetails: awaiting,
    partialExtraction: partial,
    expired,
    newThisWeek,
    eligibilityReview,
  }
  const hiddenByBetaScope = scope === 'beta' ? uniqueOpps([
    ...rawQueues.humanReview,
    ...rawQueues.awaitingDetails,
    ...rawQueues.partialExtraction,
    ...rawQueues.expired,
    ...rawQueues.newThisWeek,
    ...rawQueues.eligibilityReview,
  ].filter((opp) => getBetaCurationExclusionReason(opp) !== null)) : []
  const visible = scope === 'beta' ? isBetaCurationRelevant : () => true

  return {
    humanReview: humanReview.filter(visible),
    awaitingDetails: awaiting.filter(visible),
    partialExtraction: partial.filter(visible),
    expired: expired.filter(visible),
    newThisWeek: newThisWeek.filter(visible),
    eligibilityReview: eligibilityReview.filter(visible),
    hiddenByBetaScope,
    generatedAt: nowIso,
  }
}

function isBetaCurationRelevant(o: CurationOpp): boolean {
  return getBetaCurationExclusionReason(o) === null
}

export function getBetaCurationExclusionReason(o: CurationOpp): string | null {
  const tags = new Set(o.disciplines_tags)
  if (o.requires_producer) return 'Aide producteur : candidature non ouverte directement aux auteurs.'
  const excludedTag = [...tags].find((tag) => BETA_EXCLUDED_TAGS.has(tag))
  if (excludedTag) return `Tag hors beta : ${excludedTag}.`

  if (BETA_LOW_SIGNAL_EMITTERS.has(o.emitter)) {
    if (![...tags].some((tag) => BETA_STRONG_TAGS.has(tag))) {
      return 'Source institutionnelle large sans tag auteur audiovisuel fort.'
    }
    if (looksLikeGenericInstitutionalCall(o)) {
      return 'Bruit institutionnel probable : structure, territoire, EAC, librairie, editeur, musique ou scene.'
    }
  }

  return null
}

function looksLikeGenericInstitutionalCall(o: CurationOpp): boolean {
  const text = `${o.title}\n${o.description ?? ''}`.toLowerCase()
  return /librair|[ée]diteur|traduction|revue|patrimoine|[ée]ducation artistique|eac|territoire|structure|association|institution|[ée]quipement|festival|musique|danse|orgue/.test(text)
}

function uniqueOpps(items: CurationOpp[]): CurationOpp[] {
  const seen = new Set<string>()
  const out: CurationOpp[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

function hasEligibilityReviewSignal(o: CurationOpp): boolean {
  const haystack = `${o.title}\n${o.description ?? ''}\n${o.conditions.join('\n')}`.toLowerCase()
  if (
    /pas\s+de\s+(?:producteur|[ée]diteur)\s+(?:requis|obligatoire)|sans\s+(?:producteur|[ée]diteur)\s+(?:requis|obligatoire)|(?:producteur|[ée]diteur)\s+non\s+(?:requis|obligatoire)/i.test(haystack)
  ) {
    return false
  }
  const hasSignal =
    /(?:r[ée]serv[ée]e?s?|destin[ée]e?s?|ouverte?s?|priorit[ée])[^.\n]{0,100}(?:femmes?|minorit[ée]s?\s+de\s+genre|non\s+r[ée]sidents?|citoyens?\s+fran[çc]ais|pays\s+du\s+sud|outre[\s-]?mer|ultra[\s-]?marins?|[ée]trangers?|soci[ée]taires?)|soci[ée]taires?\s+(?:sacd|scam)|(?:producteur|[ée]diteur)\s+(?:attach[ée]\s+)?(?:requis|obligatoire)|moins\s+de\s+\d{2}\s+ans/i.test(haystack)

  if (!hasSignal) return false

  const requiresProfileData = Array.isArray(o.eligibility_profile.requiresProfileData)
    ? o.eligibility_profile.requiresProfileData
    : []
  const hardRestrictions = Array.isArray(o.eligibility_profile.hardRestrictions)
    ? o.eligibility_profile.hardRestrictions
    : []

  return !o.eligibility_summary && requiresProfileData.length === 0 && hardRestrictions.length === 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Retourne true s'il y a au moins une opp dans n'importe quelle file
 * (= il y a quelque chose à curer cette semaine).
 */
export function queuesHaveContent(q: CurationQueues): boolean {
  return (
    q.awaitingDetails.length > 0 ||
    q.humanReview.length > 0 ||
    q.partialExtraction.length > 0 ||
    q.expired.length > 0 ||
    q.newThisWeek.length > 0 ||
    q.eligibilityReview.length > 0
  )
}
