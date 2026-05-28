import { describe, it, expect } from 'vitest'
import { buildIcalCalendar, buildRssFeed, disciplineSlugFromUrlSlug } from '../src/lib/calendar-feeds'
import type { Opportunity } from '../src/lib/supabase/types'

function makeOpp(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: 'op-1',
    slug: 'test-opp',
    title: 'Résidence d\'écriture en Bretagne',
    description: 'Une résidence pour les auteurs francophones, durée 6 semaines.',
    emitter: 'Maison des Écrivains',
    emitter_slug: 'maison-des-ecrivains',
    type: 'residence',
    disciplines: ['litterature'],
    audience: ['auteurs'],
    geo_scope: 'regional',
    region_code: 'BRE',
    amount_min: 4500,
    amount_max: 4500,
    currency: 'EUR',
    deadline: '2026-06-15T22:59:00.000Z',
    published_at: '2026-04-01T00:00:00.000Z',
    source_url: 'https://example.com/aap',
    mirror_urls: [],
    fingerprint: 'fp-1',
    classify_confidence: 0.95,
    human_review: false,
    is_published: true,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  } as Opportunity
}

describe('buildIcalCalendar', () => {
  const config = {
    siteUrl: 'https://encre.xyz',
    name: 'Encre · Test',
    description: 'Test calendar',
  }

  it('génère un calendrier iCal valide', () => {
    const cal = buildIcalCalendar([makeOpp()], config)
    const text = cal.toString()
    expect(text).toContain('BEGIN:VCALENDAR')
    expect(text).toContain('END:VCALENDAR')
    expect(text).toContain('VERSION:2.0')
    expect(text).toContain('BEGIN:VEVENT')
    expect(text).toContain('END:VEVENT')
  })

  it('inclut le titre de l\'opportunité dans SUMMARY', () => {
    const cal = buildIcalCalendar([makeOpp()], config)
    const text = cal.toString()
    expect(text).toContain('Résidence d')
    expect(text).toContain('Bretagne')
  })

  it('inclut l\'URL canonique de la fiche', () => {
    const cal = buildIcalCalendar([makeOpp()], config)
    const text = cal.toString()
    expect(text).toContain('https://encre.xyz/aides/test-opp')
  })

  it('utilise le fuseau Europe/Paris', () => {
    const cal = buildIcalCalendar([makeOpp()], config)
    expect(cal.toString()).toContain('Europe/Paris')
  })

  it('ignore les opps sans deadline', () => {
    const cal = buildIcalCalendar([makeOpp({ deadline: null })], config)
    const text = cal.toString()
    expect(text).not.toContain('BEGIN:VEVENT')
  })

  it('ignore les opps avec deadline invalide', () => {
    const cal = buildIcalCalendar([makeOpp({ deadline: 'not a date' })], config)
    expect(cal.toString()).not.toContain('BEGIN:VEVENT')
  })

  it('génère un VALARM par événement', () => {
    const cal = buildIcalCalendar([makeOpp()], config)
    expect(cal.toString()).toContain('BEGIN:VALARM')
  })

  it('gère plusieurs opps sans collision d\'UID', () => {
    const cal = buildIcalCalendar(
      [makeOpp({ id: 'a', slug: 'a' }), makeOpp({ id: 'b', slug: 'b' })],
      config,
    )
    const text = cal.toString()
    expect(text).toContain('opp-a@encre.io')
    expect(text).toContain('opp-b@encre.io')
    // 2 événements
    expect(text.match(/BEGIN:VEVENT/g)?.length).toBe(2)
  })
})

describe('buildRssFeed', () => {
  const config = {
    siteUrl: 'https://encre.xyz',
    name: 'Encre · Test',
    description: 'Test feed',
  }

  it('génère un flux RSS 2.0 valide', () => {
    const feed = buildRssFeed([makeOpp()], config)
    const xml = feed.rss2()
    expect(xml).toContain('<?xml version="1.0"')
    expect(xml).toContain('<rss')
    expect(xml).toContain('<channel>')
    expect(xml).toContain('</channel>')
  })

  it('inclut un item par opportunité', () => {
    const feed = buildRssFeed(
      [makeOpp({ id: 'a', slug: 'a' }), makeOpp({ id: 'b', slug: 'b' })],
      config,
    )
    const xml = feed.rss2()
    expect(xml.match(/<item>/g)?.length).toBe(2)
  })

  it('inclut le titre + le lien canonique', () => {
    const feed = buildRssFeed([makeOpp()], config)
    const xml = feed.rss2()
    expect(xml).toContain('Résidence d')
    expect(xml).toContain('https://encre.xyz/aides/test-opp')
  })

  it('ignore les opps sans deadline', () => {
    const feed = buildRssFeed([makeOpp({ deadline: null })], config)
    const xml = feed.rss2()
    expect(xml).not.toContain('<item>')
  })

  it('langue = fr', () => {
    const feed = buildRssFeed([makeOpp()], config)
    expect(feed.rss2()).toContain('<language>fr</language>')
  })
})

describe('disciplineSlugFromUrlSlug', () => {
  it('convertit slug-tiret → slug_underscore', () => {
    expect(disciplineSlugFromUrlSlug('arts-visuels')).toBe('arts_visuels')
    expect(disciplineSlugFromUrlSlug('cinema')).toBe('cinema')
    expect(disciplineSlugFromUrlSlug('spectacle-vivant')).toBe('spectacle_vivant')
  })

  it('rejette les slugs inconnus', () => {
    expect(disciplineSlugFromUrlSlug('inconnu')).toBeNull()
    expect(disciplineSlugFromUrlSlug('')).toBeNull()
  })

  it('insensible à la casse', () => {
    expect(disciplineSlugFromUrlSlug('CINEMA')).toBe('cinema')
  })
})
