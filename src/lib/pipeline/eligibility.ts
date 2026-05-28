export type EligibilityConfidence = 'explicit' | 'inferred' | 'unknown'

export interface EligibilityProfile {
  nationality: string | null
  residency: string | null
  gender: 'women' | 'gender_minorities' | 'women_and_gender_minorities' | null
  producer: 'required' | 'not_required' | 'unknown'
  editor: 'required' | 'not_required' | 'unknown'
  age: { max: number | null } | null
  experience: { minFilmsProduced: number | null } | null
  professionalStatus: string | null
  reservedAudience: string[]
  requiresProfileData: string[]
  hardRestrictions: string[]
}

export interface EligibilityExtraction {
  eligibility_profile: EligibilityProfile
  eligibility_summary: string | null
  eligibility_confidence: EligibilityConfidence
}

export function extractEligibility(params: {
  title: string
  description: string | null
  rawJson: Record<string, unknown>
  tags: readonly string[]
  requiresProducer: boolean
  requiresEditor: boolean
  ageMax: number | null
  minFilmsProduced: number | null
}): EligibilityExtraction {
  const {
    title,
    description,
    rawJson,
    tags,
    requiresProducer,
    requiresEditor,
    ageMax,
    minFilmsProduced,
  } = params
  const text = `${title}\n${description ?? ''}`.toLowerCase()
  const tagSet = new Set(tags)
  const reservedAudience = new Set<string>()
  const requiresProfileData = new Set<string>()
  const hardRestrictions = new Set<string>()

  const explicitHints = [
    'hint_disciplines_tags',
    'hint_requires_producer',
    'hint_requires_editor',
    'hint_age_max',
    'hint_min_films_produits',
  ].some((key) => rawJson[key] !== undefined)

  let nationality: string | null = null
  let residency: string | null = null
  let gender: EligibilityProfile['gender'] = null
  let professionalStatus: string | null = null
  let inferred = false

  if (tagSet.has('foreign-only') || /non\s+r[ée]sidents?\s+ni\s+citoyens?\s+fran[çc]ais|cin[ée]astes?\s+[ée]trangers?/i.test(text)) {
    nationality = 'foreign_only'
    reservedAudience.add('cinéastes étrangers')
    requiresProfileData.add('nationality')
    hardRestrictions.add('Réservé aux candidats non français ou non résidents français.')
    inferred = true
  }

  if (tagSet.has('pays-du-sud')) {
    nationality = nationality ?? 'pays_du_sud'
    reservedAudience.add('pays francophones du Sud')
    requiresProfileData.add('nationality')
    hardRestrictions.add('Réservé aux pays francophones du Sud.')
  }

  if (tagSet.has('outremer')) {
    residency = 'outremer'
    reservedAudience.add('Outre-mer')
    requiresProfileData.add('residency')
  }

  const hasWomen = tagSet.has('femmes') || /\bfemmes?\b|r[ée]alisatrices?|autrices?/i.test(text)
  const hasGenderMinorities =
    tagSet.has('minorites-de-genre') ||
    /minorit[ée]s?\s+de\s+genre|personnes?\s+(?:trans|non[-\s]?binaires?)/i.test(text)
  if (hasWomen || hasGenderMinorities) {
    gender = hasWomen && hasGenderMinorities
      ? 'women_and_gender_minorities'
      : hasWomen
        ? 'women'
        : 'gender_minorities'
    reservedAudience.add(
      gender === 'women'
        ? 'femmes'
        : gender === 'gender_minorities'
          ? 'minorités de genre'
          : 'femmes et minorités de genre',
    )
    requiresProfileData.add('gender')
    inferred = true
  }

  if (/soci[ée]taires?\s+(?:sacd|scam)|membres?\s+(?:de\s+)?(?:la\s+)?(?:sacd|scam)/i.test(text)) {
    professionalStatus = 'society_member'
    reservedAudience.add('sociétaires')
    requiresProfileData.add('professional_status')
    inferred = true
  }

  if (requiresProducer) requiresProfileData.add('producer')
  if (requiresEditor) requiresProfileData.add('editor')
  if (typeof ageMax === 'number') requiresProfileData.add('age')
  if (typeof minFilmsProduced === 'number' && minFilmsProduced > 0) {
    requiresProfileData.add('experience')
  }

  const profile: EligibilityProfile = {
    nationality,
    residency,
    gender,
    producer: requiresProducer ? 'required' : 'not_required',
    editor: requiresEditor ? 'required' : 'not_required',
    age: typeof ageMax === 'number' ? { max: ageMax } : null,
    experience: typeof minFilmsProduced === 'number' ? { minFilmsProduced } : null,
    professionalStatus,
    reservedAudience: Array.from(reservedAudience),
    requiresProfileData: Array.from(requiresProfileData),
    hardRestrictions: Array.from(hardRestrictions),
  }

  return {
    eligibility_profile: profile,
    eligibility_summary: summarizeEligibility(profile),
    eligibility_confidence:
      explicitHints || tagSet.size > 0 ? 'explicit' : inferred ? 'inferred' : 'unknown',
  }
}

function summarizeEligibility(profile: EligibilityProfile): string | null {
  const parts: string[] = []
  if (profile.reservedAudience.length > 0) {
    parts.push(`Réservé ou ciblé : ${profile.reservedAudience.join(', ')}.`)
  }
  if (profile.producer === 'required') parts.push('Producteur attaché requis.')
  if (profile.editor === 'required') parts.push('Éditeur attaché requis.')
  if (profile.age?.max) parts.push(`Âge limite : ${profile.age.max} ans.`)
  if (profile.experience?.minFilmsProduced) {
    parts.push(`${profile.experience.minFilmsProduced} film déjà produit demandé.`)
  }
  return parts.length > 0 ? parts.join(' ') : null
}
