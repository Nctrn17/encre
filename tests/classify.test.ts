import { describe, it, expect } from 'vitest'
import { classifyLocalFallback, guessTypeFromText } from '../src/lib/pipeline/classify'
import type { RawItemPayload } from '../src/lib/pipeline/schemas'

describe('guessTypeFromText', () => {
  it('detects residence', () => {
    expect(guessTypeFromText('Résidence d\'artistes Kyoto')).toBe('residence')
  })

  it('detects subvention', () => {
    expect(guessTypeFromText('Aide à la création théâtrale')).toBe('subvention')
  })

  it('detects bourse', () => {
    expect(guessTypeFromText('Bourse d\'écriture 2026')).toBe('bourse')
  })

  it('detects prix', () => {
    expect(guessTypeFromText('Prix COAL Art et Écologie')).toBe('prix')
  })

  it('detects concours', () => {
    expect(guessTypeFromText('Concours national photographie')).toBe('concours')
  })

  it('detects commande via 1% artistique', () => {
    expect(guessTypeFromText('Commande publique 1% artistique')).toBe('commande')
  })

  it('returns null when ambiguous', () => {
    expect(guessTypeFromText('Appel à manifestation')).toBeNull()
  })
})

describe('classifyLocalFallback', () => {
  const payload: RawItemPayload = {
    title: 'Résidence théâtre Bretagne',
    description: 'Résidence de création théâtrale ouverte aux compagnies professionnelles.',
    emitter: 'DRAC Bretagne',
    url: 'https://example.com/x',
  }

  it('returns a complete classification', () => {
    const result = classifyLocalFallback(payload, 'DRAC Bretagne')
    expect(result.type).toBe('residence')
    expect(result.disciplines).toContain('theatre')
    expect(result.audience.length).toBeGreaterThan(0)
    expect(result.geo_scope).toBeDefined()
    expect(result.confidence).toBeLessThan(0.6)
  })

  it('always flags fallback as low-confidence for human review', () => {
    const result = classifyLocalFallback(payload, 'DRAC Bretagne')
    expect(result.confidence).toBeLessThan(0.6)
  })

  it('detects compagnie audience from description', () => {
    const result = classifyLocalFallback(payload, 'DRAC Bretagne')
    expect(result.audience).toContain('compagnie')
  })

  it('detects europe scope from "Creative Europe"', () => {
    const result = classifyLocalFallback(
      { ...payload, description: 'Appel Creative Europe pour compagnies.' },
      'Commission européenne',
    )
    expect(result.geo_scope).toBe('europe')
  })

  it('defaults to transdisciplinaire when no discipline matches', () => {
    const result = classifyLocalFallback(
      { ...payload, title: 'Un appel générique', description: 'sans mention particulière' },
      'Fondation X',
    )
    expect(result.disciplines).toContain('transdisciplinaire')
  })
})
