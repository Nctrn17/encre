import { describe, it, expect } from 'vitest'
import { deadlinesCompatible } from '../src/lib/pipeline/dedup-rules'

describe('deadlinesCompatible', () => {
  it('considère compatibles deux opps si une deadline est absente', () => {
    expect(deadlinesCompatible(null, '2026-10-04T00:00:00Z')).toBe(true)
    expect(deadlinesCompatible('2026-10-04T00:00:00Z', null)).toBe(true)
    expect(deadlinesCompatible(null, null)).toBe(true)
    expect(deadlinesCompatible(undefined, '2026-10-04')).toBe(true)
  })

  it('compatibles si les deadlines sont à moins de 30 jours', () => {
    expect(deadlinesCompatible('2026-10-01T00:00:00Z', '2026-10-20T00:00:00Z')).toBe(true)
    expect(deadlinesCompatible('2026-10-01T00:00:00Z', '2026-10-31T00:00:00Z')).toBe(true)
  })

  it('incompatibles si les deadlines diffèrent de plus de 30 jours (éditions distinctes)', () => {
    expect(deadlinesCompatible('2025-10-04T00:00:00Z', '2026-10-04T00:00:00Z')).toBe(false)
    expect(deadlinesCompatible('2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z')).toBe(false)
  })

  it('seuil personnalisable', () => {
    expect(deadlinesCompatible('2026-10-01', '2026-10-10', 5)).toBe(false)
    expect(deadlinesCompatible('2026-10-01', '2026-10-04', 5)).toBe(true)
  })

  it('date non parsable traitée comme absente (compatible)', () => {
    expect(deadlinesCompatible('au fil de l\'eau', '2026-10-04')).toBe(true)
  })
})
