import type { Opportunity } from '@/lib/supabase/types'
import type { AlertProfile } from './queries'
import {
  readOpportunityForProfile,
  shouldSurfaceReading,
} from '@/features/personalization/match'

const STRICT_MATCH_WEIGHT = 0.6
const PERSONALIZATION_WEIGHT = 0.4

/**
 * Evalue si une opportunite correspond a un profil d'alerte.
 *
 * La premiere couche conserve les filtres stricts historiques
 * (discipline, type, geo, montant). La seconde ajoute une lecture
 * personnalisee: producteur, premier projet, age, hors-reseau.
 *
 * Invariants metier:
 * - tableau vide dans le profil = pas de filtre sur cette dimension ;
 * - discipline et audience fonctionnent par intersection ;
 * - type, geo_scope et montant restent bloquants quand ils sont renseignes ;
 * - une region ciblee garde les opps nationales/europeennes/internationales,
 *   puis filtre seulement les opps regionales/locales par region_code.
 */
export function matchOpportunity(
  opp: Opportunity,
  profile: AlertProfile,
): { match: boolean; score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0
  let maxScore = 0

  if (profile.disciplines.length > 0) {
    maxScore += 3
    const hit = profile.disciplines.filter((d) => opp.disciplines.includes(d))
    if (hit.length === 0) {
      return { match: false, score: 0, reasons: ['discipline'] }
    }
    score += 3 * (hit.length / profile.disciplines.length)
    reasons.push(`${hit.length}/${profile.disciplines.length} disciplines`)
  }

  if (profile.audience.length > 0 && opp.audience.length > 0) {
    maxScore += 2
    const hit = profile.audience.filter((a) => opp.audience.includes(a))
    if (hit.length === 0) {
      return { match: false, score: 0, reasons: ['audience'] }
    }
    score += 2 * (hit.length / profile.audience.length)
  }

  if (profile.types.length > 0) {
    maxScore += 2
    if (!profile.types.includes(opp.type)) {
      return { match: false, score: 0, reasons: ['type'] }
    }
    score += 2
  }

  // Une veille regionale doit aussi recevoir les opportunites accessibles
  // partout depuis la France ; seules les opportunites locales exigent un code region.
  const broadScopes = ['national', 'metropole', 'europe', 'international']
  const localScopes = ['regional', 'local']
  const hasRegionFilter = profile.region_codes.length > 0
  const hasGeoScopeFilter = profile.geo_scopes.length > 0

  if (hasRegionFilter) {
    maxScore += 1.5
    const isBroad = broadScopes.includes(opp.geo_scope)
    const isLocal = localScopes.includes(opp.geo_scope)
    const geoMatch =
      isBroad ||
      (isLocal &&
        Boolean(opp.region_code && profile.region_codes.includes(opp.region_code)))

    if (!geoMatch) {
      return { match: false, score: 0, reasons: ['geo'] }
    }
    score += 1.5
  } else if (hasGeoScopeFilter) {
    maxScore += 1.5
    if (!profile.geo_scopes.includes(opp.geo_scope)) {
      return { match: false, score: 0, reasons: ['geo_scope'] }
    }
    score += 1.5
  }

  if (profile.min_amount != null) {
    maxScore += 0.5
    const effectiveMax = opp.amount_max ?? opp.amount_min
    if (effectiveMax == null || effectiveMax < profile.min_amount) {
      return { match: false, score: 0, reasons: ['min_amount'] }
    }
    score += 0.5
  }

  const reading = readOpportunityForProfile(opp, profile)
  if (!shouldSurfaceReading(reading)) {
    return { match: false, score: 0, reasons: ['personalization'] }
  }

  if (maxScore === 0) {
    if (!hasPersonalizationCriteria(profile)) {
      return { match: true, score: 1, reasons: ['no-criteria'] }
    }
    return {
      match: true,
      score: reading.score / 100,
      reasons: ['no-criteria', ...reading.reasons],
    }
  }

  return {
    match: true,
    score:
      (score / maxScore) * STRICT_MATCH_WEIGHT +
      (reading.score / 100) * PERSONALIZATION_WEIGHT,
    reasons: [...reasons, ...reading.reasons],
  }
}

export function filterOpportunitiesByProfile(
  opportunities: Opportunity[],
  profile: AlertProfile,
  options: { logRejections?: boolean } = {},
): Array<Opportunity & { matchScore: number }> {
  const matched: Array<Opportunity & { matchScore: number }> = []
  const rejectionStats: Record<string, number> = {}

  for (const opp of opportunities) {
    const result = matchOpportunity(opp, profile)
    if (result.match) {
      matched.push({ ...opp, matchScore: result.score })
    } else {
      for (const reason of result.reasons) {
        rejectionStats[reason] = (rejectionStats[reason] ?? 0) + 1
      }
    }
  }

  if (options.logRejections) {
    console.log('[matcher] rejets par raison :', rejectionStats)
  }

  return matched.sort((a, b) => b.matchScore - a.matchScore)
}

export function filterOpportunitiesSinceLastSent(
  opportunities: Opportunity[],
  profile: AlertProfile,
  options: { logRejections?: boolean } = {},
): Array<Opportunity & { matchScore: number }> {
  const since = profile.last_sent_at ? new Date(profile.last_sent_at) : null

  const filtered = opportunities.filter((o) => {
    if (!since) return true
    return new Date(o.published_at) > since
  })

  return filterOpportunitiesByProfile(filtered, profile, options)
}

function hasPersonalizationCriteria(profile: AlertProfile): boolean {
  return (
    (profile.discipline_tags ?? []).length > 0 ||
    profile.has_producer !== null ||
    profile.films_produced_count !== null ||
    (profile.age_range !== null && profile.age_range !== 'not_specified') ||
    profile.hors_reseau_only === true ||
    Boolean(profile.candidate_mode && profile.candidate_mode !== 'balanced')
  )
}
