import { describe, expect, it } from 'vitest'
import { selectNewOpportunities } from '../src/lib/digest/build-broadcast'
import type { Opportunity } from '../src/lib/supabase/types'

function makeOpp(id: string, publishedAt: string): Opportunity {
  return {
    id,
    slug: id,
    title: `Opp ${id}`,
    description: 'desc',
    emitter: 'Test',
    emitter_slug: 'test',
    type: 'bourse',
    disciplines: ['cinema'],
    audience: ['individuel'],
    geo_scope: 'national',
    region_code: null,
    amount_min: null,
    amount_max: 5000,
    currency: 'EUR',
    deadline: '2026-12-31T23:59:00+01:00',
    published_at: publishedAt,
    source_url: 'https://example.com',
    mirror_urls: [],
    fingerprint: 'a'.repeat(64),
    classify_confidence: 0.9,
    human_review: false,
    is_published: true,
    created_at: publishedAt,
    updated_at: publishedAt,
    disciplines_tags: ['scenario'],
    hors_reseau_friendly: true,
    requires_producer: false,
    min_films_produits: 0,
    age_max: null,
  } as unknown as Opportunity
}

const POOL: Opportunity[] = [
  makeOpp('a', '2026-05-01T10:00:00+02:00'),
  makeOpp('b', '2026-05-10T10:00:00+02:00'),
  makeOpp('c', '2026-05-20T10:00:00+02:00'),
]

describe('selectNewOpportunities', () => {
  it('returns everything (sorted desc) when since is null', () => {
    const out = selectNewOpportunities(POOL, null, 20)
    expect(out.map((o) => o.id)).toEqual(['c', 'b', 'a'])
  })

  it('keeps only opportunities published strictly after since', () => {
    const out = selectNewOpportunities(POOL, '2026-05-10T10:00:00+02:00', 20)
    // b (égal à since) est exclu, seul c est plus récent
    expect(out.map((o) => o.id)).toEqual(['c'])
  })

  it('returns nothing when since is after the most recent publication', () => {
    const out = selectNewOpportunities(POOL, '2026-06-01T00:00:00+02:00', 20)
    expect(out).toHaveLength(0)
  })

  it('respects the max cap, keeping the most recent', () => {
    const out = selectNewOpportunities(POOL, null, 2)
    expect(out.map((o) => o.id)).toEqual(['c', 'b'])
  })

  it('does not mutate the input pool', () => {
    const before = POOL.map((o) => o.id)
    selectNewOpportunities(POOL, null, 20)
    expect(POOL.map((o) => o.id)).toEqual(before)
  })

  it('drops items with an unparseable published_at when filtering by since', () => {
    const pool = [...POOL, makeOpp('bad', 'not-a-date')]
    const out = selectNewOpportunities(pool, '2026-05-01T00:00:00+02:00', 20)
    expect(out.map((o) => o.id)).not.toContain('bad')
  })
})
