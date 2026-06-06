import { describe, it, expect } from 'vitest'
import { slugify, formatAmount, humanDeadline, daysUntil, stripLongDashes } from '../src/lib/utils'

describe('stripLongDashes', () => {
  it('replaces em-dash, en-dash and minus sign with a short hyphen', () => {
    expect(stripLongDashes('CTG Guyane — Aide à l’écriture')).toBe('CTG Guyane - Aide à l’écriture')
    expect(stripLongDashes('2014–2020')).toBe('2014-2020')
    expect(stripLongDashes('J−5')).toBe('J-5')
  })
  it('leaves text without long dashes untouched', () => {
    expect(stripLongDashes('Bourse SCAM, premier court')).toBe('Bourse SCAM, premier court')
  })
})

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
    expect(slugify(' — Hello — ')).toBe('hello')
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
    expect(result).toContain(' à ')
    expect(result).not.toMatch(/[—–−]/) // jamais de tiret long
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
