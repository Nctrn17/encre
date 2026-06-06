import { describe, it, expect } from 'vitest'
import {
  matchOpportunity,
  filterOpportunitiesByProfile,
  filterOpportunitiesSinceLastSent,
} from '../src/features/alerts/matchers'
import type { AlertProfile } from '../src/features/alerts/queries'
import type { Opportunity } from '../src/lib/supabase/types'

function makeOpp(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'opp-1',
    slug: 'test-opp',
    title: 'Test opportunity',
    description: null,
    emitter: 'Test',
    emitter_slug: 'test',
    type: 'residence',
    disciplines: ['arts_visuels'],
    audience: ['individuel'],
    geo_scope: 'national',
    region_code: null,
    amount_min: 1000,
    amount_max: 5000,
    currency: 'EUR',
    deadline: '2026-06-30T23:59:00+02:00',
    published_at: '2026-04-18T10:00:00+02:00',
    source_url: 'https://example.com',
    mirror_urls: [],
    fingerprint: 'a'.repeat(64),
    classify_confidence: 0.9,
    human_review: false,
    is_published: true,
    created_at: '2026-04-18T10:00:00+02:00',
    updated_at: '2026-04-18T10:00:00+02:00',
    ...overrides,
  }
}

function makeProfile(overrides: Partial<AlertProfile> = {}): AlertProfile {
  return {
    id: 'profile-1',
    user_id: 'user-1',
    name: 'Test profile',
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
    age_range: null,
    residency_context: 'france_metropole',
    nationality_context: 'france',
    gender_context: 'not_specified',
    professional_status_tags: [],
    hors_reseau_only: false,
    candidate_mode: 'balanced',
    is_active: true,
    last_sent_at: null,
    created_at: '2026-04-18T10:00:00+02:00',
    ...overrides,
  }
}

describe('filterOpportunitiesSinceLastSent — rappel « ferme bientôt »', () => {
  const NOW = new Date('2026-06-20T12:00:00Z')
  // Publiée AVANT le dernier envoi → plus « nouvelle ».
  const oldPublished = { published_at: '2026-04-18T10:00:00+02:00' }
  const sentRecently = { last_sent_at: '2026-05-01T10:00:00+02:00' }

  it('hebdo : rappelle une fiche déjà envoyée dont la deadline est ≤ 14 j', () => {
    const opp = makeOpp({ ...oldPublished, deadline: '2026-06-25T23:59:00+02:00' })
    const profile = makeProfile({ frequency: 'weekly', ...sentRecently })
    const result = filterOpportunitiesSinceLastSent([opp], profile, { now: NOW })
    expect(result).toHaveLength(1)
  })

  it('hebdo : ne rappelle PAS une fiche dont la deadline est > 14 j', () => {
    const opp = makeOpp({ ...oldPublished, deadline: '2026-07-30T23:59:00+02:00' })
    const profile = makeProfile({ frequency: 'weekly', ...sentRecently })
    const result = filterOpportunitiesSinceLastSent([opp], profile, { now: NOW })
    expect(result).toHaveLength(0)
  })

  it('quotidien : pas de rappel deadline (anti-spam, réservé à l’hebdo)', () => {
    const opp = makeOpp({ ...oldPublished, deadline: '2026-06-25T23:59:00+02:00' })
    const profile = makeProfile({ frequency: 'daily', ...sentRecently })
    const result = filterOpportunitiesSinceLastSent([opp], profile, { now: NOW })
    expect(result).toHaveLength(0)
  })

  it('une fiche nouvelle depuis le dernier envoi passe quelle que soit la deadline', () => {
    const opp = makeOpp({
      published_at: '2026-06-19T10:00:00+02:00',
      deadline: '2026-12-30T23:59:00+02:00',
    })
    const profile = makeProfile({ frequency: 'weekly', ...sentRecently })
    const result = filterOpportunitiesSinceLastSent([opp], profile, { now: NOW })
    expect(result).toHaveLength(1)
  })
})

describe('matchOpportunity', () => {
  it('matches everything when profile has no criteria', () => {
    const result = matchOpportunity(makeOpp(), makeProfile())
    expect(result.match).toBe(true)
    expect(result.score).toBe(1)
  })

  it('matches when discipline intersects', () => {
    const result = matchOpportunity(
      makeOpp({ disciplines: ['arts_visuels', 'photographie'] }),
      makeProfile({ disciplines: ['arts_visuels'] }),
    )
    expect(result.match).toBe(true)
  })

  it('rejects when no discipline matches', () => {
    const result = matchOpportunity(
      makeOpp({ disciplines: ['theatre'] }),
      makeProfile({ disciplines: ['arts_visuels'] }),
    )
    expect(result.match).toBe(false)
  })

  it('rejects when type does not match', () => {
    const result = matchOpportunity(
      makeOpp({ type: 'residence' }),
      makeProfile({ types: ['bourse', 'prix'] }),
    )
    expect(result.match).toBe(false)
  })

  it('accepts when type is in the allowed list', () => {
    const result = matchOpportunity(
      makeOpp({ type: 'residence' }),
      makeProfile({ types: ['residence', 'bourse'] }),
    )
    expect(result.match).toBe(true)
  })

  it('rejects when geo_scope not in profile list', () => {
    const result = matchOpportunity(
      makeOpp({ geo_scope: 'international' }),
      makeProfile({ geo_scopes: ['national', 'regional'] }),
    )
    expect(result.match).toBe(false)
  })

  it('rejects regional opp when its region_code does not match profile', () => {
    const result = matchOpportunity(
      makeOpp({ geo_scope: 'regional', region_code: 'FR-IDF' }),
      makeProfile({ region_codes: ['FR-ARA'] }),
    )
    expect(result.match).toBe(false)
  })

  it('accepts national opp even if region_code differs from profile regions', () => {
    // Logique métier : une opp nationale est accessible depuis n'importe quelle région
    const result = matchOpportunity(
      makeOpp({ geo_scope: 'national', region_code: 'FR-IDF' }),
      makeProfile({ region_codes: ['FR-ARA'] }),
    )
    expect(result.match).toBe(true)
  })

  it('accepts european/international opps with regional profile', () => {
    for (const scope of ['europe', 'international', 'metropole'] as const) {
      const result = matchOpportunity(
        makeOpp({ geo_scope: scope, region_code: null }),
        makeProfile({ region_codes: ['FR-ARA'] }),
      )
      expect(result.match).toBe(true)
    }
  })

  it('ignores region when profile has no region_codes', () => {
    const result = matchOpportunity(
      makeOpp({ region_code: 'FR-IDF' }),
      makeProfile({ region_codes: [] }),
    )
    expect(result.match).toBe(true)
  })

  it('rejects when min_amount exceeds opportunity amount_max', () => {
    const result = matchOpportunity(
      makeOpp({ amount_min: 500, amount_max: 1000 }),
      makeProfile({ min_amount: 5000 }),
    )
    expect(result.match).toBe(false)
  })

  it('accepts when opportunity amount_max >= min_amount', () => {
    const result = matchOpportunity(
      makeOpp({ amount_min: 1000, amount_max: 10_000 }),
      makeProfile({ min_amount: 5000 }),
    )
    expect(result.match).toBe(true)
  })

  it('rejects when min_amount set but opportunity has no amount info', () => {
    const result = matchOpportunity(
      makeOpp({ amount_min: null, amount_max: null }),
      makeProfile({ min_amount: 1000 }),
    )
    expect(result.match).toBe(false)
  })

  it('combines multiple criteria (AND logic)', () => {
    const result = matchOpportunity(
      makeOpp({
        type: 'residence',
        disciplines: ['arts_visuels', 'photographie'],
        geo_scope: 'regional',
        region_code: 'FR-IDF',
      }),
      makeProfile({
        types: ['residence'],
        disciplines: ['arts_visuels'],
        geo_scopes: ['regional'],
        region_codes: ['FR-IDF'],
      }),
    )
    expect(result.match).toBe(true)
    expect(result.score).toBeGreaterThan(0.8)
  })
})

describe('filterOpportunitiesByProfile', () => {
  it('filters and sorts by match score', () => {
    const opps = [
      makeOpp({ id: 'opp-1', slug: 'opp-1', type: 'residence', disciplines: ['arts_visuels'] }),
      makeOpp({ id: 'opp-2', slug: 'opp-2', type: 'bourse', disciplines: ['arts_visuels'] }),
      makeOpp({ id: 'opp-3', slug: 'opp-3', type: 'residence', disciplines: ['theatre'] }),
    ]
    const profile = makeProfile({
      disciplines: ['arts_visuels'],
      types: ['residence'],
    })
    const filtered = filterOpportunitiesByProfile(opps, profile)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('opp-1')
  })

  it('returns all when profile is permissive', () => {
    const opps = [makeOpp({ id: 'opp-1', slug: 'opp-1' }), makeOpp({ id: 'opp-2', slug: 'opp-2' })]
    const filtered = filterOpportunitiesByProfile(opps, makeProfile())
    expect(filtered).toHaveLength(2)
  })
})
