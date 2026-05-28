import { matchOpportunity } from '@/features/alerts/matchers'
import type { AlertProfile } from '@/features/alerts/queries'
import type { Opportunity } from '@/lib/supabase/types'
import {
  readOpportunityForProfile,
  type PersonalizedReading,
} from './match'

export interface PersonalizedOpportunity {
  opportunity: Opportunity
  reading: PersonalizedReading
  matchScore: number
}

export interface PersonalizedRankingOptions {
  includeNotRecommended?: boolean
  limit?: number
  includeRestrictedAudience?: boolean
}

// Publics explicitement réservés : ils restent couverts par Encre, mais ne
// doivent pas remonter dans une veille personnalisée générale par accident.
const RESERVED_AUDIENCE_TAGS = ['pays-du-sud', 'foreign-only']

export function buildPersonalizedOpportunityList(
  opportunities: Opportunity[],
  profile: AlertProfile,
  options: PersonalizedRankingOptions = {},
): PersonalizedOpportunity[] {
  const rows = opportunities.flatMap((opportunity) => {
    if (!options.includeRestrictedAudience && shouldExcludeRestrictedAudience(opportunity, profile)) {
      return []
    }

    const reading = readOpportunityForProfile(opportunity, profile)
    const strictMatch = matchOpportunity(opportunity, profile)

    if (!strictMatch.match && !options.includeNotRecommended) return []
    if (reading.level === 'not_recommended' && !options.includeNotRecommended) return []

    return [
      {
        opportunity,
        reading,
        matchScore: reading.score / 100,
      },
    ]
  })

  const sorted = rows.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore
    return deadlineTime(a.opportunity.deadline) - deadlineTime(b.opportunity.deadline)
  })

  return typeof options.limit === 'number' ? sorted.slice(0, options.limit) : sorted
}

export function hasRestrictedAudienceTag(opportunity: Opportunity): boolean {
  const tags = opportunity.disciplines_tags ?? []
  return RESERVED_AUDIENCE_TAGS.some((tag) => tags.includes(tag))
}

function shouldExcludeRestrictedAudience(
  opportunity: Opportunity,
  profile: AlertProfile,
): boolean {
  const tags = opportunity.disciplines_tags ?? []
  if (
    tags.includes('pays-du-sud') &&
    (profile.nationality_context === 'pays_du_sud' || profile.residency_context === 'pays_du_sud')
  ) {
    return false
  }
  if (tags.includes('foreign-only') && profile.nationality_context === 'foreign') {
    return false
  }
  return hasRestrictedAudienceTag(opportunity)
}

function deadlineTime(deadline: string | null): number {
  if (!deadline) return Number.POSITIVE_INFINITY
  const time = new Date(deadline).getTime()
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY
}
