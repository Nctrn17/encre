import { describe, it, expect } from 'vitest'
import {
  RawItemPayloadSchema,
  OpportunityDraftSchema,
  ClassificationOutputSchema,
  WaitlistSignupSchema,
  AlertProfileInputSchema,
} from '../src/lib/pipeline/schemas'

describe('RawItemPayloadSchema', () => {
  it('accepts minimal valid payload', () => {
    const result = RawItemPayloadSchema.safeParse({
      title: 'Test',
      url: 'https://example.com',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing title', () => {
    const result = RawItemPayloadSchema.safeParse({ url: 'https://example.com' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid url', () => {
    const result = RawItemPayloadSchema.safeParse({ title: 'Test', url: 'not-a-url' })
    expect(result.success).toBe(false)
  })
})

describe('ClassificationOutputSchema', () => {
  it('accepts valid classification', () => {
    const result = ClassificationOutputSchema.safeParse({
      type: 'residence',
      disciplines: ['arts_visuels'],
      audience: ['individuel'],
      geo_scope: 'national',
      confidence: 0.9,
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid type', () => {
    const result = ClassificationOutputSchema.safeParse({
      type: 'not_a_type',
      disciplines: ['arts_visuels'],
      audience: ['individuel'],
      geo_scope: 'national',
      confidence: 0.9,
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty disciplines', () => {
    const result = ClassificationOutputSchema.safeParse({
      type: 'residence',
      disciplines: [],
      audience: ['individuel'],
      geo_scope: 'national',
      confidence: 0.9,
    })
    expect(result.success).toBe(false)
  })

  it('rejects confidence out of range', () => {
    const result = ClassificationOutputSchema.safeParse({
      type: 'residence',
      disciplines: ['arts_visuels'],
      audience: ['individuel'],
      geo_scope: 'national',
      confidence: 1.5,
    })
    expect(result.success).toBe(false)
  })
})

describe('WaitlistSignupSchema', () => {
  it('accepts email + defaults', () => {
    const result = WaitlistSignupSchema.safeParse({ email: 'test@example.com' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.disciplines).toEqual([])
      expect(result.data.region_codes).toEqual([])
    }
  })

  it('lowercases email', () => {
    const result = WaitlistSignupSchema.safeParse({ email: 'Test@Example.COM' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe('test@example.com')
    }
  })

  it('rejects invalid email', () => {
    const result = WaitlistSignupSchema.safeParse({ email: 'not-an-email' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid discipline slug', () => {
    const result = WaitlistSignupSchema.safeParse({
      email: 'test@example.com',
      disciplines: ['not_a_discipline'],
    })
    expect(result.success).toBe(false)
  })
})

describe('AlertProfileInputSchema', () => {
  it('accepts minimal valid profile', () => {
    const result = AlertProfileInputSchema.safeParse({ name: 'Mes résidences' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.discipline_tags).toEqual([])
      expect(result.data.frequency).toBe('weekly')
      expect(result.data.send_weekday).toBe(1)
      expect(result.data.hors_reseau_only).toBe(true)
      expect(result.data.candidate_mode).toBe('balanced')
      expect(result.data.is_active).toBe(true)
    }
  })

  it('rejects empty name', () => {
    const result = AlertProfileInputSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid frequency', () => {
    const result = AlertProfileInputSchema.safeParse({
      name: 'Test',
      frequency: 'monthly',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid personalization values', () => {
    const result = AlertProfileInputSchema.safeParse({
      name: 'Test',
      send_weekday: 8,
      films_produced_count: 21,
      age_range: 'teenager',
      candidate_mode: 'closed',
    })
    expect(result.success).toBe(false)
  })
})

describe('OpportunityDraftSchema', () => {
  const base = {
    slug: 'test-slug',
    title: 'Test title',
    emitter: 'Test Emitter',
    emitter_slug: 'test-emitter',
    type: 'residence',
    geo_scope: 'national',
    source_url: 'https://example.com',
    fingerprint: 'a'.repeat(64),
  }

  it('accepts valid draft with defaults', () => {
    const result = OpportunityDraftSchema.safeParse(base)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.currency).toBe('EUR')
      expect(result.data.mirror_urls).toEqual([])
    }
  })

  it('rejects fingerprint of wrong length', () => {
    const result = OpportunityDraftSchema.safeParse({ ...base, fingerprint: 'short' })
    expect(result.success).toBe(false)
  })

  it('rejects title too short', () => {
    const result = OpportunityDraftSchema.safeParse({ ...base, title: 'X' })
    expect(result.success).toBe(false)
  })
})
