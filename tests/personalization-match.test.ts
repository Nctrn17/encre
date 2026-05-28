import { describe, expect, it } from 'vitest'
import { readOpportunityForProfile } from '../src/features/personalization/match'
import type { AlertProfile } from '../src/features/alerts/queries'
import type { Opportunity } from '../src/lib/supabase/types'

function makeOpp(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'opp-1',
    slug: 'opp-1',
    title: 'Bourse scenario',
    description: null,
    emitter: 'Test',
    emitter_slug: 'test',
    type: 'bourse',
    disciplines: ['cinema', 'audiovisuel'],
    audience: ['individuel'],
    geo_scope: 'national',
    region_code: null,
    amount_min: null,
    amount_max: 5000,
    currency: 'EUR',
    deadline: '2026-06-30T23:59:00+02:00',
    published_at: '2026-05-01T10:00:00+02:00',
    source_url: 'https://example.com',
    mirror_urls: [],
    fingerprint: 'a'.repeat(64),
    classify_confidence: 0.9,
    human_review: false,
    is_published: true,
    created_at: '2026-05-01T10:00:00+02:00',
    updated_at: '2026-05-01T10:00:00+02:00',
    disciplines_tags: ['scenario', 'court-metrage'],
    hors_reseau_friendly: true,
    requires_producer: false,
    min_films_produits: 0,
    age_max: null,
    ...overrides,
  }
}

function makeProfile(overrides: Partial<AlertProfile> = {}): AlertProfile {
  return {
    id: 'profile-1',
    user_id: 'user-1',
    name: 'Veille scenario',
    disciplines: ['cinema', 'audiovisuel'],
    discipline_tags: ['court-metrage'],
    audience: [],
    types: [],
    geo_scopes: ['national', 'regional', 'metropole'],
    region_codes: [],
    min_amount: null,
    frequency: 'weekly',
    send_weekday: 1,
    has_producer: false,
    films_produced_count: 0,
    age_range: 'not_specified',
    residency_context: 'france_metropole',
    nationality_context: 'france',
    gender_context: 'not_specified',
    professional_status_tags: [],
    hors_reseau_only: true,
    candidate_mode: 'balanced',
    is_active: true,
    last_sent_at: null,
    created_at: '2026-05-01T10:00:00+02:00',
    ...overrides,
  }
}

describe('readOpportunityForProfile', () => {
  it('marks an accessible first-project opportunity as strong', () => {
    const reading = readOpportunityForProfile(makeOpp(), makeProfile())

    expect(reading.level).toBe('strong')
    expect(reading.score).toBe(94)
    expect(reading.reasons).toContain('Candidature possible sans producteur attaché.')
    expect(reading.reasons).toContain('Compatible avec un premier projet.')
  })

  it('warns when a producer is required but the profile has none', () => {
    const reading = readOpportunityForProfile(
      makeOpp({ requires_producer: true, hors_reseau_friendly: false }),
      makeProfile({ has_producer: false }),
    )

    expect(reading.level).toBe('not_recommended')
    expect(reading.warnings).toContain('Producteur attaché requis.')
  })

  it('downgrades opportunities requiring more produced films than declared', () => {
    const reading = readOpportunityForProfile(
      makeOpp({ min_films_produits: 2 }),
      makeProfile({ films_produced_count: 0 }),
    )

    expect(reading.level).not.toBe('strong')
    expect(reading.warnings).toContain('2 films déjà produits semblent demandés.')
  })

  it('flags an incompatible age limit', () => {
    const reading = readOpportunityForProfile(
      makeOpp({ age_max: 30 }),
      makeProfile({ age_range: 'over_45' }),
    )

    expect(reading.warnings).toContain("Limite d'âge probablement incompatible.")
  })

  it('rejects a regional opportunity outside selected regions', () => {
    const reading = readOpportunityForProfile(
      makeOpp({ geo_scope: 'regional', region_code: 'FR-IDF' }),
      makeProfile({ region_codes: ['FR-ARA'] }),
    )

    expect(reading.level).toBe('not_recommended')
    expect(reading.warnings).toContain('Région probablement non compatible.')
  })

  it('keeps strict mode from surfacing a low-confidence reading', () => {
    const reading = readOpportunityForProfile(
      makeOpp({ hors_reseau_friendly: false, min_films_produits: null }),
      makeProfile({
        disciplines: [],
        discipline_tags: [],
        geo_scopes: [],
        has_producer: null,
        films_produced_count: null,
        hors_reseau_only: true,
        candidate_mode: 'strict',
      }),
    )

    expect(reading.score).toBe(34)
    expect(reading.level).toBe('not_recommended')
  })

  it('lets wide mode keep the same borderline reading as difficult', () => {
    const reading = readOpportunityForProfile(
      makeOpp({
        age_max: 35,
        hors_reseau_friendly: false,
        min_films_produits: null,
      }),
      makeProfile({
        disciplines: [],
        discipline_tags: [],
        geo_scopes: ['national'],
        has_producer: null,
        films_produced_count: null,
        age_range: 'under_30',
        hors_reseau_only: true,
        candidate_mode: 'wide',
      }),
    )

    expect(reading.score).toBe(41)
    expect(reading.level).toBe('difficult')
  })

  it('reserves strong for high-confidence readings in balanced mode', () => {
    const reading = readOpportunityForProfile(
      makeOpp({ hors_reseau_friendly: false }),
      makeProfile({ discipline_tags: ['scenario'] }),
    )

    expect(reading.score).toBe(70)
    expect(reading.level).toBe('possible')
  })

  it('does not mark declarative identity eligibility as strongly adapted by default', () => {
    const reading = readOpportunityForProfile(
      makeOpp({ disciplines_tags: ['scenario', 'femmes'] }),
      makeProfile({ discipline_tags: ['scenario'] }),
    )

    expect(reading.level).toBe('possible')
    expect(reading.score).toBe(72)
    expect(reading.warnings).toContain('Éligibilité liée à une situation personnelle à vérifier.')
  })

  it('uses structured eligibility to block hard reserved audiences', () => {
    const reading = readOpportunityForProfile(
      makeOpp({
        disciplines_tags: ['scenario'],
        eligibility_profile: {
          nationality: 'foreign_only',
          requiresProfileData: ['nationality'],
          hardRestrictions: ['Réservé aux candidats non français ou non résidents français.'],
        },
      }),
      makeProfile({ discipline_tags: ['scenario'] }),
    )

    expect(reading.level).toBe('not_recommended')
    expect(reading.score).toBe(20)
    expect(reading.warnings).toContain('Réservé aux candidats non français ou non résidents français.')
  })

  it('keeps unspecified personal eligibility below strong', () => {
    const reading = readOpportunityForProfile(
      makeOpp({
        disciplines_tags: ['scenario'],
        eligibility_profile: {
          requiresProfileData: ['gender'],
          hardRestrictions: [],
        },
      }),
      makeProfile({ discipline_tags: ['scenario'], gender_context: 'woman' }),
    )

    expect(reading.level).toBe('possible')
    expect(reading.score).toBe(72)
    expect(reading.warnings.some((warning) => warning.includes('situation personnelle'))).toBe(true)
  })

  it('accepts declarative gender eligibility when the profile matches the structured signal', () => {
    const reading = readOpportunityForProfile(
      makeOpp({
        disciplines_tags: ['scenario'],
        eligibility_profile: {
          gender: 'women',
          requiresProfileData: ['gender'],
          hardRestrictions: [],
        },
      }),
      makeProfile({ discipline_tags: ['scenario'], gender_context: 'woman' }),
    )

    expect(reading.level).toBe('strong')
    expect(reading.warnings.some((warning) => warning.includes('situation personnelle'))).toBe(false)
  })
})
