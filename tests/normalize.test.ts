import { describe, it, expect } from 'vitest'
import { normalizeRawItem } from '../src/lib/pipeline/normalize'
import type { RawItemPayload, ClassificationOutput } from '../src/lib/pipeline/schemas'

const baseClassification: ClassificationOutput = {
  type: 'residence',
  disciplines: ['arts_visuels'],
  audience: ['individuel'],
  geo_scope: 'national',
  confidence: 0.9,
  conditions: [],
  calendrier: [],
  dossier: [],
}

const basePayload: RawItemPayload = {
  title: 'Résidence Villa Kujoyama 2027',
  description: 'Résidence de 6 mois à Kyoto pour artistes confirmés.',
  emitter: 'Institut français',
  url: 'https://www.villakujoyama.jp/candidater',
  deadline: '2026-04-30',
  amount_text: null,
  region_hint: null,
}

describe('normalizeRawItem', () => {
  it('produces a valid draft from a well-formed payload', () => {
    const draft = normalizeRawItem({
      payload: basePayload,
      classification: baseClassification,
      sourceSlug: 'arts-en-residence',
    })
    expect(draft).not.toBeNull()
    expect(draft?.type).toBe('residence')
    expect(draft?.disciplines).toEqual(['arts_visuels'])
    expect(draft?.slug).toContain('residence')
    expect(draft?.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(draft?.human_review).toBe(false) // confidence 0.9
  })

  it('returns null when title is too short', () => {
    const result = normalizeRawItem({
      payload: { ...basePayload, title: 'x' },
      classification: baseClassification,
      sourceSlug: 'test',
    })
    expect(result).toBeNull()
  })

  it('parses ISO deadline correctly', () => {
    const draft = normalizeRawItem({
      payload: { ...basePayload, deadline: '2026-04-30T23:59:00+02:00' },
      classification: baseClassification,
      sourceSlug: 'test',
    })
    expect(draft?.deadline).toContain('2026-04-30')
  })

  it('parses French date format "31/05/2026"', () => {
    const draft = normalizeRawItem({
      payload: { ...basePayload, deadline: '31/05/2026' },
      classification: baseClassification,
      sourceSlug: 'test',
    })
    expect(draft?.deadline).toBeTruthy()
    expect(new Date(draft!.deadline!).getFullYear()).toBe(2026)
    expect(new Date(draft!.deadline!).getUTCMonth()).toBe(4) // mai = index 4
  })

  it('parses French text date "15 juin 2026"', () => {
    const draft = normalizeRawItem({
      payload: { ...basePayload, deadline: '15 juin 2026' },
      classification: baseClassification,
      sourceSlug: 'test',
    })
    expect(draft?.deadline).toBeTruthy()
    expect(new Date(draft!.deadline!).getFullYear()).toBe(2026)
  })

  it('sets deadline to null when unparseable', () => {
    const draft = normalizeRawItem({
      payload: { ...basePayload, deadline: 'bientôt' },
      classification: baseClassification,
      sourceSlug: 'test',
    })
    expect(draft?.deadline).toBeNull()
  })

  it('parses amount range "5000 à 30000€"', () => {
    const draft = normalizeRawItem({
      payload: { ...basePayload, amount_text: '5000 à 30000€' },
      classification: baseClassification,
      sourceSlug: 'test',
    })
    expect(draft?.amount_min).toBe(5000)
    expect(draft?.amount_max).toBe(30000)
  })

  it('parses single amount "5000€"', () => {
    const draft = normalizeRawItem({
      payload: { ...basePayload, amount_text: '5000€' },
      classification: baseClassification,
      sourceSlug: 'test',
    })
    expect(draft?.amount_min).toBe(5000)
    expect(draft?.amount_max).toBe(5000)
  })

  it('parses amount with spaces "5 000 €"', () => {
    const draft = normalizeRawItem({
      payload: { ...basePayload, amount_text: '5 000 €' },
      classification: baseClassification,
      sourceSlug: 'test',
    })
    expect(draft?.amount_min).toBe(5000)
  })

  it('maps region hint "Grand Est" to FR-GES', () => {
    const draft = normalizeRawItem({
      payload: { ...basePayload, region_hint: 'Grand Est' },
      classification: baseClassification,
      sourceSlug: 'test',
    })
    expect(draft?.region_code).toBe('FR-GES')
  })

  it('flags low-confidence classification for human review', () => {
    const draft = normalizeRawItem({
      payload: basePayload,
      classification: { ...baseClassification, confidence: 0.4 },
      sourceSlug: 'test',
    })
    expect(draft?.human_review).toBe(true)
  })

  it('adds structured eligibility from pilot hints', () => {
    const draft = normalizeRawItem({
      payload: {
        ...basePayload,
        title: 'Boost Program',
        description: 'Programme pour cinéastes femmes et minorités de genre.',
        raw_json: {
          hint_disciplines_tags: ['scenario', 'femmes', 'minorites-de-genre'],
          hint_min_films_produits: 1,
        },
      },
      classification: { ...baseClassification, disciplines: ['cinema'] },
      sourceSlug: 'collectif-5050',
    })

    expect(draft?.eligibility_confidence).toBe('explicit')
    expect(draft?.eligibility_summary).toContain('femmes et minorités de genre')
    expect(draft?.eligibility_profile).toMatchObject({
      gender: 'women_and_gender_minorities',
      experience: { minFilmsProduced: 1 },
    })
  })

  it('infers emitter from source slug when absent', () => {
    const draft = normalizeRawItem({
      payload: { ...basePayload, emitter: null },
      classification: baseClassification,
      sourceSlug: 'drac-grand-est',
    })
    expect(draft?.emitter).toBe('DRAC Grand Est')
  })
})
