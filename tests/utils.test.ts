import { describe, it, expect } from 'vitest'
import { slugify, formatAmount, humanDeadline, daysUntil } from '../src/lib/utils'

describe('slugify', () => {
  it('lowercases and replaces spaces', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('strips diacritics', () => {
    expect(slugify('Résidence d\'artistes')).toBe('residence-d-artistes')
  })

  it('respects max length', () => {
    expect(slugify('a'.repeat(300), 50)).toHaveLength(50)
  })

  it('removes leading/trailing dashes', () => {
    expect(slugify(' - Hello - ')).toBe('hello')
  })
})

describe('formatAmount', () => {
  it('formats a single amount', () => {
    const result = formatAmount(5000, 5000)
    expect(result).toContain('5')
    expect(result).toContain('000')
  })

  it('formats a range', () => {
    const result = formatAmount(5000, 30000)
    expect(result).toContain('–')
  })

  it('uses "à partir de" for min only', () => {
    const result = formatAmount(1000, null)
    expect(result).toContain('à partir de')
  })

  it('returns null when both null', () => {
    expect(formatAmount(null, null)).toBeNull()
  })
})

describe('humanDeadline', () => {
  it('handles null/undefined', () => {
    expect(humanDeadline(null)).toBe('Sans échéance')
    expect(humanDeadline(undefined)).toBe('Sans échéance')
  })

  it('handles past deadlines', () => {
    const past = new Date()
    past.setDate(past.getDate() - 5)
    expect(humanDeadline(past)).toContain('Expirée')
  })

  it('handles near-future deadlines', () => {
    const future = new Date()
    future.setDate(future.getDate() + 3)
    expect(humanDeadline(future)).toContain('Dans')
  })
})

describe('daysUntil', () => {
  it('returns positive for future date', () => {
    const future = new Date()
    future.setDate(future.getDate() + 10)
    expect(daysUntil(future)).toBeGreaterThanOrEqual(9)
  })

  it('returns negative for past date', () => {
    const past = new Date()
    past.setDate(past.getDate() - 10)
    expect(daysUntil(past)).toBeLessThan(0)
  })
})
