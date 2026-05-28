import { describe, expect, it } from 'vitest'
import {
  renderDigestHtml,
  renderDigestText,
  renderGroupedDigestHtml,
  renderGroupedDigestText,
} from '../src/lib/digest/template'
import type { DigestOpportunity } from '../src/lib/digest/template'

function makeDigestOpportunity(): DigestOpportunity {
  return {
    id: 'opp-1',
    slug: 'opp-1',
    title: 'Bourse scenario',
    description: 'Une aide pour un premier court metrage.',
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
    disciplines_tags: ['scenario'],
    hors_reseau_friendly: true,
    requires_producer: false,
    min_films_produits: 0,
    age_max: null,
    matchScore: 0.94,
    matchReading: {
      level: 'strong',
      score: 94,
      decisionLabel: 'Tres adapte',
      reasons: ['Candidature possible sans producteur attache.'],
      warnings: [],
    },
  }
}

describe('digest template personalization', () => {
  it('renders personalized reading in html and plain text', () => {
    const ctx = {
      profileName: 'Veille scenario',
      opportunities: [makeDigestOpportunity()],
      siteUrl: 'https://example.com',
      unsubscribeUrl: 'https://example.com/mes-alertes',
    }

    expect(renderDigestHtml(ctx)).toContain('Très adapté')
    expect(renderDigestHtml(ctx)).not.toContain('Tres adapte')
    expect(renderDigestHtml(ctx)).toContain('Candidature possible sans producteur attache.')
    expect(renderDigestText(ctx)).toContain('TRÈS ADAPTÉ')
    expect(renderDigestText(ctx)).toContain('Candidature possible sans producteur attache.')
  })

  it('renders grouped digests by alert section', () => {
    const ctx = {
      sections: [
        {
          profileName: 'Long métrage',
          opportunities: [makeDigestOpportunity()],
        },
        {
          profileName: 'Série',
          opportunities: [{ ...makeDigestOpportunity(), id: 'opp-2', slug: 'opp-2' }],
        },
      ],
      siteUrl: 'https://example.com',
      unsubscribeUrl: 'https://example.com/mes-alertes',
    }

    expect(renderGroupedDigestHtml(ctx)).toContain('Long métrage')
    expect(renderGroupedDigestHtml(ctx)).toContain('Série')
    expect(renderGroupedDigestHtml(ctx)).toContain('2 nouvelles opportunités')
    expect(renderGroupedDigestText(ctx)).toContain('Long métrage')
    expect(renderGroupedDigestText(ctx)).toContain('Série')
  })

  it('positions the digest as a preview of /aujourdhui (single profile)', () => {
    const ctx = {
      profileName: 'Veille scenario',
      opportunities: [makeDigestOpportunity()],
      siteUrl: 'https://example.com',
      unsubscribeUrl: 'https://example.com/mes-alertes',
    }

    const html = renderDigestHtml(ctx)
    expect(html).toContain('La revue de la semaine')
    expect(html).not.toContain('Digest hebdomadaire')
    expect(html).toContain('https://example.com/aujourdhui')
    expect(html).toContain("Voir tout sur Aujourd'hui")

    const text = renderDigestText(ctx)
    expect(text).toContain('La revue de la semaine')
    expect(text).not.toContain('Digest :')
    expect(text).toContain('Vue complète : https://example.com/aujourdhui')
  })

  it('positions the digest as a preview of /aujourdhui (grouped)', () => {
    const ctx = {
      sections: [
        {
          profileName: 'Long métrage',
          opportunities: [makeDigestOpportunity()],
        },
      ],
      siteUrl: 'https://example.com',
      unsubscribeUrl: 'https://example.com/mes-alertes',
    }

    const html = renderGroupedDigestHtml(ctx)
    expect(html).toContain('La revue de la semaine')
    expect(html).not.toContain('Digest hebdomadaire')
    expect(html).toContain('https://example.com/aujourdhui')
    expect(html).toContain("Voir tout sur Aujourd'hui")

    const text = renderGroupedDigestText(ctx)
    expect(text).toContain('La revue de la semaine')
    expect(text).toContain('Vue complète : https://example.com/aujourdhui')
  })
})
