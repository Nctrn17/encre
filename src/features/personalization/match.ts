import type { Opportunity } from '@/lib/supabase/types'
import type { AlertProfile } from '@/features/alerts/queries'
import { daysUntil } from '@/lib/utils'

export type PersonalizationLevel =
  | 'strong'
  | 'possible'
  | 'difficult'
  | 'not_recommended'

export interface PersonalizedReading {
  level: PersonalizationLevel
  score: number
  decisionLabel: string
  reasons: string[]
  warnings: string[]
}

const LEVEL_LABELS: Record<PersonalizationLevel, string> = {
  strong: 'Très adapté',
  possible: 'Possible, mais à vérifier',
  difficult: 'Possible, mais exigeant',
  not_recommended: 'Peu adapté à cette situation',
}

const BROAD_SCOPES = ['national', 'metropole', 'europe', 'international']
const LOCAL_SCOPES = ['regional', 'local']
const BASE_SCORE = 50
const RESERVED_AUDIENCE_TAGS = ['pays-du-sud', 'foreign-only']
const DECLARATIVE_ELIGIBILITY_TAGS = ['femmes', 'minorites-de-genre']

/**
 * Produit une lecture explicable pour un profil donne. Le score sert au tri,
 * mais le niveau et les messages restent la vraie valeur produit.
 */
export function readOpportunityForProfile(
  opportunity: Opportunity,
  profile: AlertProfile,
): PersonalizedReading {
  const reasons: string[] = []
  const warnings: string[] = []
  let score = BASE_SCORE
  let scoreCap = 100

  const fineTags = opportunity.disciplines_tags ?? []
  const profileTags = profile.discipline_tags ?? []
  const macroHits = profile.disciplines.filter((d) =>
    opportunity.disciplines.includes(d),
  )
  const fineHits = profileTags.filter((tag) => fineTags.includes(tag))

  const eligibilityRisk = readEligibilityRisk(opportunity, profile)
  if (eligibilityRisk.kind === 'hard') {
    score -= 60
    scoreCap = Math.min(scoreCap, 20)
    warnings.push(eligibilityRisk.warning)
  }

  if (eligibilityRisk.kind === 'declarative') {
    score -= 10
    scoreCap = Math.min(scoreCap, 72)
    warnings.push(eligibilityRisk.warning)
  }

  if (profileTags.length > 0) {
    if (fineHits.length > 0) {
      score += 18
      reasons.push(labelFineTags(fineHits))
    } else if (macroHits.length > 0) {
      score += 7
      warnings.push('Format proche, mais pas parfaitement aligné avec la veille.')
    } else {
      score -= 30
      warnings.push('Format éloigné de la veille configurée.')
    }
  } else if (profile.disciplines.length > 0) {
    if (macroHits.length > 0) {
      score += 10
      reasons.push('Discipline principale alignée.')
    } else {
      score -= 24
      warnings.push('Discipline éloignée de la veille configurée.')
    }
  }

  const requiresProducer = opportunity.requires_producer === true
  if (profile.has_producer === false && requiresProducer) {
    score -= 38
    scoreCap = Math.min(scoreCap, 35)
    warnings.push('Producteur attaché requis.')
  } else if (profile.has_producer === false && !requiresProducer) {
    score += 8
    reasons.push('Candidature possible sans producteur attaché.')
  } else if (profile.has_producer === true && requiresProducer) {
    score += 6
    reasons.push('Producteur requis, compatible avec la situation déclarée.')
  }

  if (profile.hors_reseau_only) {
    if (opportunity.hors_reseau_friendly === true) {
      score += 8
      reasons.push('Repéré comme accessible sans réseau établi.')
    } else {
      score -= 16
      warnings.push('Accès potentiellement plus fermé ou plus institutionnel.')
    }
  }

  const requiredFilms = opportunity.min_films_produits
  const filmsDone = profile.films_produced_count
  if (typeof requiredFilms === 'number') {
    if (typeof filmsDone === 'number' && filmsDone < requiredFilms) {
      score -= 32
      scoreCap = Math.min(scoreCap, 58)
      warnings.push(
        requiredFilms === 1
          ? 'Au moins un film déjà produit semble demandé.'
          : `${requiredFilms} films déjà produits semblent demandés.`,
      )
    } else if (requiredFilms === 0) {
      score += 6
      reasons.push('Compatible avec un premier projet.')
    } else if (typeof filmsDone === 'number') {
      score += 5
      reasons.push('Expérience déclarée compatible avec le niveau demandé.')
    }
  }

  const ageWarning = readAgeLimit(opportunity.age_max, profile.age_range)
  if (ageWarning === 'blocked') {
    score -= 34
    scoreCap = Math.min(scoreCap, 35)
    warnings.push("Limite d'âge probablement incompatible.")
  } else if (ageWarning === 'check') {
    score -= 8
    warnings.push("Limite d'âge à vérifier dans le règlement.")
  } else if (ageWarning === 'ok') {
    score += 3
    reasons.push("Condition d'âge compatible avec le profil.")
  }

  const geo = readGeoCompatibility(opportunity, profile)
  if (geo === 'match') {
    score += 4
    reasons.push('Portée géographique compatible.')
  } else if (geo === 'check') {
    score -= 8
    warnings.push('Ancrage territorial à vérifier.')
  } else if (geo === 'miss') {
    score -= 30
    scoreCap = Math.min(scoreCap, 35)
    warnings.push('Région probablement non compatible.')
  }

  const days = opportunity.deadline ? daysUntil(opportunity.deadline) : null
  if (days !== null && days >= 0 && days <= 10) {
    score -= 5
    warnings.push('Date limite très proche.')
  }

  const clampedScore = Math.max(0, Math.min(scoreCap, Math.round(score)))
  const level = levelFromScore(clampedScore, profile.candidate_mode)

  return {
    level,
    score: clampedScore,
    decisionLabel: LEVEL_LABELS[level],
    reasons: unique(reasons).slice(0, 4),
    warnings: unique(warnings).slice(0, 4),
  }
}

export function shouldSurfaceReading(reading: PersonalizedReading): boolean {
  return reading.level !== 'not_recommended'
}

function levelFromScore(score: number, mode: AlertProfile['candidate_mode']): PersonalizationLevel {
  if (mode === 'strict') {
    if (score >= 84) return 'strong'
    if (score >= 64) return 'possible'
    if (score >= 50) return 'difficult'
    return 'not_recommended'
  }
  if (mode === 'wide') {
    if (score >= 80) return 'strong'
    if (score >= 54) return 'possible'
    if (score >= 38) return 'difficult'
    return 'not_recommended'
  }
  if (score >= 88) return 'strong'
  if (score >= 60) return 'possible'
  if (score >= 45) return 'difficult'
  return 'not_recommended'
}

function readGeoCompatibility(
  opportunity: Opportunity,
  profile: AlertProfile,
): 'match' | 'check' | 'miss' | 'neutral' {
  if (profile.region_codes.length === 0 && profile.geo_scopes.length === 0) {
    return 'neutral'
  }

  if (profile.region_codes.length > 0) {
    if (BROAD_SCOPES.includes(opportunity.geo_scope)) return 'match'
    if (LOCAL_SCOPES.includes(opportunity.geo_scope)) {
      if (!opportunity.region_code) return 'check'
      return profile.region_codes.includes(opportunity.region_code) ? 'match' : 'miss'
    }
  }

  if (profile.geo_scopes.length > 0) {
    return profile.geo_scopes.includes(opportunity.geo_scope) ? 'match' : 'miss'
  }

  return 'neutral'
}

function readEligibilityRisk(
  opportunity: Opportunity,
  alertProfile: AlertProfile,
): { kind: 'hard' | 'declarative' | 'none'; warning: string } {
  const tags = opportunity.disciplines_tags ?? []
  const profile = asEligibilityProfile(opportunity.eligibility_profile)
  const requiresProfileData = profile?.requiresProfileData ?? []
  const hardRestrictions = profile?.hardRestrictions ?? []
  const nationality = profile?.nationality
  const residency = profile?.residency
  const gender = profile?.gender
  const professionalStatus = profile?.professionalStatus

  if (
    (hardRestrictions.length > 0 && !matchesKnownEligibility(profile, tags, alertProfile)) ||
    !matchesNationality(nationality, tags, alertProfile)
  ) {
    return {
      kind: 'hard',
      warning: hardRestrictions[0] ?? 'Éligibilité réservée à un public géographique ou nationalité spécifique.',
    }
  }

  const needsUnprofiledData =
    ((requiresProfileData.includes('gender') ||
      DECLARATIVE_ELIGIBILITY_TAGS.some((tag) => tags.includes(tag))) &&
      (!hasSpecificGenderSignal(gender, tags) || !matchesGender(gender, tags, alertProfile))) ||
    (requiresProfileData.includes('residency') &&
      (!hasSpecificResidencySignal(residency, tags) || !matchesResidency(residency, tags, alertProfile))) ||
    (requiresProfileData.includes('nationality') &&
      (!hasSpecificNationalitySignal(nationality, tags) || !matchesNationality(nationality, tags, alertProfile))) ||
    (requiresProfileData.includes('professional_status') &&
      (!hasSpecificProfessionalStatusSignal(professionalStatus) ||
        !matchesProfessionalStatus(professionalStatus, alertProfile)))

  if (needsUnprofiledData) {
    return {
      kind: 'declarative',
      warning: 'Éligibilité liée à une situation personnelle à vérifier.',
    }
  }

  return { kind: 'none', warning: '' }
}

function asEligibilityProfile(value: unknown): {
  nationality?: string | null
  residency?: string | null
  gender?: string | null
  professionalStatus?: string | null
  requiresProfileData?: string[]
  hardRestrictions?: string[]
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  return {
    nationality: typeof record.nationality === 'string' ? record.nationality : null,
    residency: typeof record.residency === 'string' ? record.residency : null,
    gender: typeof record.gender === 'string' ? record.gender : null,
    professionalStatus: typeof record.professionalStatus === 'string' ? record.professionalStatus : null,
    requiresProfileData: Array.isArray(record.requiresProfileData)
      ? record.requiresProfileData.filter((item): item is string => typeof item === 'string')
      : [],
    hardRestrictions: Array.isArray(record.hardRestrictions)
      ? record.hardRestrictions.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

function matchesKnownEligibility(
  profile: ReturnType<typeof asEligibilityProfile>,
  tags: string[],
  alertProfile: AlertProfile,
): boolean {
  return Boolean(
    ((profile?.nationality || RESERVED_AUDIENCE_TAGS.some((tag) => tags.includes(tag))) &&
      matchesNationality(profile?.nationality, tags, alertProfile)) ||
    ((profile?.residency || tags.includes('outremer')) &&
      matchesResidency(profile?.residency, tags, alertProfile)) ||
    ((profile?.gender || DECLARATIVE_ELIGIBILITY_TAGS.some((tag) => tags.includes(tag))) &&
      matchesGender(profile?.gender, tags, alertProfile)) ||
    (profile?.professionalStatus !== undefined &&
      matchesProfessionalStatus(profile.professionalStatus, alertProfile))
  )
}

function matchesNationality(
  nationality: string | null | undefined,
  tags: string[],
  profile: AlertProfile,
): boolean {
  if (nationality === 'foreign_only' || tags.includes('foreign-only')) {
    return profile.nationality_context === 'foreign'
  }
  if (nationality === 'pays_du_sud' || tags.includes('pays-du-sud')) {
    return (
      profile.nationality_context === 'pays_du_sud' ||
      profile.residency_context === 'pays_du_sud'
    )
  }
  return true
}

function hasSpecificNationalitySignal(
  nationality: string | null | undefined,
  tags: string[],
): boolean {
  return Boolean(
    nationality === 'foreign_only' ||
      nationality === 'pays_du_sud' ||
      tags.includes('foreign-only') ||
      tags.includes('pays-du-sud'),
  )
}

function matchesResidency(
  residency: string | null | undefined,
  tags: string[],
  profile: AlertProfile,
): boolean {
  if (residency === 'outremer' || tags.includes('outremer')) {
    return profile.residency_context === 'outremer'
  }
  if (residency === 'pays_du_sud' || tags.includes('pays-du-sud')) {
    return profile.residency_context === 'pays_du_sud'
  }
  return true
}

function hasSpecificResidencySignal(
  residency: string | null | undefined,
  tags: string[],
): boolean {
  return Boolean(
    residency === 'outremer' ||
      residency === 'pays_du_sud' ||
      tags.includes('outremer') ||
      tags.includes('pays-du-sud'),
  )
}

function matchesGender(
  gender: string | null | undefined,
  tags: string[],
  profile: AlertProfile,
): boolean {
  if (gender === 'women' || tags.includes('femmes')) {
    return profile.gender_context === 'woman' || profile.gender_context === 'woman_or_gender_minority'
  }
  if (gender === 'gender_minorities' || tags.includes('minorites-de-genre')) {
    return (
      profile.gender_context === 'gender_minority' ||
      profile.gender_context === 'woman_or_gender_minority'
    )
  }
  if (gender === 'women_and_gender_minorities') {
    return profile.gender_context !== 'not_specified'
  }
  return true
}

function hasSpecificGenderSignal(
  gender: string | null | undefined,
  tags: string[],
): boolean {
  return Boolean(
    gender === 'women' ||
      gender === 'gender_minorities' ||
      gender === 'women_and_gender_minorities' ||
      DECLARATIVE_ELIGIBILITY_TAGS.some((tag) => tags.includes(tag)),
  )
}

function matchesProfessionalStatus(
  professionalStatus: string | null | undefined,
  profile: AlertProfile,
): boolean {
  if (professionalStatus !== 'society_member') return true
  return (
    profile.professional_status_tags.includes('sacd_member') ||
    profile.professional_status_tags.includes('scam_member')
  )
}

function hasSpecificProfessionalStatusSignal(
  professionalStatus: string | null | undefined,
): boolean {
  return professionalStatus === 'society_member'
}

function readAgeLimit(
  ageMax: number | null | undefined,
  ageRange: AlertProfile['age_range'],
): 'ok' | 'check' | 'blocked' | 'neutral' {
  if (!ageMax || !ageRange || ageRange === 'not_specified') return 'neutral'
  if (ageRange === 'under_30') return ageMax >= 29 ? 'ok' : 'check'
  if (ageRange === '30_45') return ageMax < 30 ? 'blocked' : 'check'
  if (ageRange === 'over_45') return ageMax <= 45 ? 'blocked' : 'check'
  return 'neutral'
}

function labelFineTags(tags: string[]): string {
  const labels: Record<string, string> = {
    scenario: 'Écriture scénario alignée.',
    documentaire: 'Format documentaire aligné.',
    'court-metrage': 'Format court métrage aligné.',
    'long-metrage': 'Format long métrage aligné.',
    serie: 'Format série aligné.',
    animation: 'Animation alignée avec la veille.',
    sonore: 'Création sonore alignée avec la veille.',
    web: 'Format web narratif aligné.',
  }
  return labels[tags[0]] ?? 'Format aligné avec la veille.'
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items))
}
