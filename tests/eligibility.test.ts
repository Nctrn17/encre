import { describe, expect, it } from 'vitest'
import { extractEligibility } from '../src/lib/pipeline/eligibility'

function call(overrides: Partial<Parameters<typeof extractEligibility>[0]> = {}) {
  return extractEligibility({
    title: 'Résidence test',
    description: null,
    rawJson: {},
    tags: [],
    requiresProducer: false,
    requiresEditor: false,
    ageMax: null,
    minFilmsProduced: null,
    ...overrides,
  })
}

describe('extractEligibility', () => {
  it('structures foreign-only eligibility as a hard restriction', () => {
    const result = call({
      tags: ['scenario', 'foreign-only'],
      description: 'Résidence pour jeunes cinéastes étrangers non résidents ni citoyens français.',
    })

    expect(result.eligibility_confidence).toBe('explicit')
    expect(result.eligibility_profile.nationality).toBe('foreign_only')
    expect(result.eligibility_profile.requiresProfileData).toContain('nationality')
    expect(result.eligibility_profile.hardRestrictions[0]).toContain('non français')
  })

  it('keeps women and gender minorities as declarative eligibility', () => {
    const result = call({
      rawJson: { hint_disciplines_tags: ['femmes', 'minorites-de-genre'] },
      tags: ['scenario', 'femmes', 'minorites-de-genre'],
    })

    expect(result.eligibility_profile.gender).toBe('women_and_gender_minorities')
    expect(result.eligibility_profile.requiresProfileData).toContain('gender')
    expect(result.eligibility_profile.hardRestrictions).toEqual([])
    expect(result.eligibility_summary).toContain('femmes et minorités de genre')
  })

  it('captures producer, editor, age and experience requirements', () => {
    const result = call({
      requiresProducer: true,
      requiresEditor: true,
      ageMax: 30,
      minFilmsProduced: 2,
    })

    expect(result.eligibility_profile.producer).toBe('required')
    expect(result.eligibility_profile.editor).toBe('required')
    expect(result.eligibility_profile.age).toEqual({ max: 30 })
    expect(result.eligibility_profile.experience).toEqual({ minFilmsProduced: 2 })
    expect(result.eligibility_profile.requiresProfileData).toEqual([
      'producer',
      'editor',
      'age',
      'experience',
    ])
  })

  it('returns unknown when no eligibility clue is present', () => {
    const result = call()

    expect(result.eligibility_confidence).toBe('unknown')
    expect(result.eligibility_summary).toBeNull()
    expect(result.eligibility_profile.requiresProfileData).toEqual([])
  })
})
