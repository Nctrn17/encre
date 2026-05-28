import { describe, expect, it } from 'vitest'
import { buildPersonalizedOpportunityList } from '../src/features/personalization/rank'
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
    disciplines: [],
    discipline_tags: [],
    audience: [],
    types: [],
    geo_scopes: [],
    region_codes: [],
    min_amount: null,
    frequency: 'weekly',
    send_weekday: 1,
    has_producer: null,
    films_produced_count: null,
    age_range: 'not_specified',
    residency_context: 'france_metropole',
    nationality_context: 'france',
    gender_context: 'not_specified',
    professional_status_tags: [],
    hors_reseau_only: false,
    candidate_mode: 'balanced',
    is_active: true,
    last_sent_at: null,
    created_at: '2026-05-01T10:00:00+02:00',
    ...overrides,
  }
}

describe('buildPersonalizedOpportunityList', () => {
  it('keeps open opportunities for an empty profile', () => {
    const rows = buildPersonalizedOpportunityList(
      [
        makeOpp({ id: 'late', slug: 'late', deadline: '2026-09-30T23:59:00+02:00' }),
        makeOpp({ id: 'early', slug: 'early', deadline: '2026-06-30T23:59:00+02:00' }),
      ],
      makeProfile(),
    )

    expect(rows.map((row) => row.opportunity.id)).toEqual(['early', 'late'])
    expect(rows.every((row) => row.reading.level !== 'not_recommended')).toBe(true)
  })

  it('ranks accessible no-producer opportunities above producer-gated ones', () => {
    const rows = buildPersonalizedOpportunityList(
      [
        makeOpp({ id: 'producer-required', slug: 'producer-required', requires_producer: true }),
        makeOpp({ id: 'no-producer', slug: 'no-producer', requires_producer: false }),
      ],
      makeProfile({
        disciplines: ['cinema'],
        discipline_tags: ['court-metrage'],
        has_producer: false,
        films_produced_count: 0,
        hors_reseau_only: true,
      }),
    )

    expect(rows.map((row) => row.opportunity.id)).toEqual(['no-producer'])
    expect(rows[0].reading.reasons).toContain('Candidature possible sans producteur attaché.')
  })

  it('can include not recommended rows for diagnostics', () => {
    const rows = buildPersonalizedOpportunityList(
      [makeOpp({ id: 'blocked', slug: 'blocked', requires_producer: true })],
      makeProfile({
        has_producer: false,
        hors_reseau_only: true,
      }),
      { includeNotRecommended: true },
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].reading.level).toBe('not_recommended')
    expect(rows[0].reading.warnings).toContain('Producteur attaché requis.')
  })

  it('excludes opportunities reserved to restricted audiences by default', () => {
    const rows = buildPersonalizedOpportunityList(
      [
        makeOpp({ id: 'foreign-only', slug: 'foreign-only', disciplines_tags: ['scenario', 'foreign-only'] }),
        makeOpp({ id: 'open', slug: 'open', disciplines_tags: ['scenario'] }),
      ],
      makeProfile({ disciplines: ['cinema'], discipline_tags: ['scenario'] }),
    )

    expect(rows.map((row) => row.opportunity.id)).toEqual(['open'])
  })

  it('can include restricted audience rows for diagnostics', () => {
    const rows = buildPersonalizedOpportunityList(
      [makeOpp({ id: 'foreign-only', slug: 'foreign-only', disciplines_tags: ['scenario', 'foreign-only'] })],
      makeProfile({ disciplines: ['cinema'], discipline_tags: ['scenario'] }),
      { includeRestrictedAudience: true, includeNotRecommended: true },
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].reading.level).toBe('not_recommended')
  })

  it('keeps restricted audience rows when the profile matches the restriction', () => {
    const rows = buildPersonalizedOpportunityList(
      [makeOpp({ id: 'foreign-only', slug: 'foreign-only', disciplines_tags: ['scenario', 'foreign-only'] })],
      makeProfile({
        disciplines: ['cinema'],
        discipline_tags: ['scenario'],
        nationality_context: 'foreign',
      }),
    )

    expect(rows.map((row) => row.opportunity.id)).toEqual(['foreign-only'])
  })

  it('keeps outremer rows in general personalized lists', () => {
    const rows = buildPersonalizedOpportunityList(
      [makeOpp({ id: 'outremer', slug: 'outremer', disciplines_tags: ['scenario', 'outremer'] })],
      makeProfile({ disciplines: ['cinema'], discipline_tags: ['scenario'] }),
    )

    expect(rows.map((row) => row.opportunity.id)).toEqual(['outremer'])
  })

  it('keeps declarative eligibility rows visible until the profile captures them', () => {
    const rows = buildPersonalizedOpportunityList(
      [makeOpp({ id: 'women-program', slug: 'women-program', disciplines_tags: ['scenario', 'femmes'] })],
      makeProfile({ disciplines: ['cinema'], discipline_tags: ['scenario'] }),
    )

    expect(rows.map((row) => row.opportunity.id)).toEqual(['women-program'])
    expect(rows[0].reading.level).not.toBe('strong')
  })
})
