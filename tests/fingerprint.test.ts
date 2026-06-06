import { describe, it, expect } from 'vitest'
import { computeFingerprint, generateOpportunitySlug } from '../src/lib/pipeline/fingerprint'

describe('computeFingerprint', () => {
  it('produces stable hex sha256', () => {
    const fp = computeFingerprint({
      title: 'Résidence Villa Kujoyama',
      emitter: 'Institut français',
      deadline: '2026-06-30T23:59:00+02:00',
    })
    expect(fp).toMatch(/^[a-f0-9]{64}$/)
  })

  it('normalizes whitespace and case', () => {
    const a = computeFingerprint({
      title: '  Résidence Villa Kujoyama  ',
      emitter: 'Institut français',
      deadline: '2026-06-30T23:59:00+02:00',
    })
    const b = computeFingerprint({
      title: 'résidence villa kujoyama',
      emitter: 'Institut français',
      deadline: '2026-06-30T23:59:00+02:00',
    })
    expect(a).toBe(b)
  })

  it('handles null emitter and deadline', () => {
    const fp = computeFingerprint({
      title: 'Test',
      emitter: null,
      deadline: null,
    })
    expect(fp).toMatch(/^[a-f0-9]{64}$/)
  })

  it('produces different fingerprints for different deadlines', () => {
    const a = computeFingerprint({
      title: 'Résidence Villa Kujoyama',
      emitter: 'Institut français',
      deadline: '2026-06-30T23:59:00+02:00',
    })
    const b = computeFingerprint({
      title: 'Résidence Villa Kujoyama',
      emitter: 'Institut français',
      deadline: '2027-06-30T23:59:00+02:00',
    })
    expect(a).not.toBe(b)
  })

  it('produces same fingerprint for emitter slug variations', () => {
    const a = computeFingerprint({
      title: 'Test',
      emitter: 'Institut français',
      deadline: null,
    })
    const b = computeFingerprint({
      title: 'Test',
      emitter: 'institut francais',
      deadline: null,
    })
    expect(a).toBe(b)
  })
})

describe('generateOpportunitySlug', () => {
  it('generates URL-safe slug', () => {
    const slug = generateOpportunitySlug({
      title: 'Résidence d\'artistes — Villa Kujoyama 2026',
      emitter: 'Institut français',
    })
    expect(slug).toMatch(/^[a-z0-9-]+$/)
    expect(slug).toContain('residence')
    expect(slug).toContain('kujoyama')
  })

  it('truncates to 120 chars', () => {
    const slug = generateOpportunitySlug({
      title: 'x'.repeat(200),
      emitter: 'test',
    })
    expect(slug.length).toBeLessThanOrEqual(120)
  })

  it('handles null emitter', () => {
    const slug = generateOpportunitySlug({
      title: 'Résidence 2026',
      emitter: null,
    })
    expect(slug).toBe('residence-2026')
  })

  it('skips emitter suffix when title already contains it', () => {
    // Cas réel observé sur Moulin d'Andé : titre "Moulin d'Andé CÉCI —
    // Résidence Croisée (collège Suzanne Lipinska)" avec émetteur
    // "Moulin d'Andé — CÉCI". Avant fix, le slug dupliquait le préfixe.
    const slug = generateOpportunitySlug({
      title: "Moulin d'Andé CÉCI — Résidence Croisée (collège Suzanne Lipinska)",
      emitter: "Moulin d'Andé — CÉCI",
    })
    // Une seule occurrence du préfixe émetteur
    expect(slug.match(/moulin-d-ande-ceci/g)?.length).toBe(1)
    expect(slug).toContain('residence-croisee')
  })

  it('keeps emitter suffix when distinct from title', () => {
    const slug = generateOpportunitySlug({
      title: 'Résidence Villa Kujoyama',
      emitter: 'Institut français',
    })
    expect(slug).toContain('villa-kujoyama')
    expect(slug).toContain('institut-francais')
  })

  it('appends fingerprint suffix when provided', () => {
    const slug = generateOpportunitySlug({
      title: 'Aide à la création',
      emitter: 'CNC',
      fingerprint: 'abc123def456ghi789',
    })
    expect(slug.endsWith('-abc123de')).toBe(true)
  })
})
