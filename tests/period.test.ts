import { describe, it, expect } from 'vitest'
import {
  parsePeriodSlug,
  listStaticPeriodSlugs,
  currentMonthSlug,
  siblingMonthSlug,
  isPeriodFullyPast,
} from '../src/lib/period'

describe('parsePeriodSlug — mois', () => {
  it('parse un mois standard', () => {
    const p = parsePeriodSlug('2026-06')
    expect(p).not.toBeNull()
    expect(p!.kind).toBe('month')
    expect(p!.year).toBe(2026)
    expect(p!.month).toBe(6)
    expect(p!.label).toBe('Juin 2026')
  })

  it('borne basse = 1er du mois 00:00 UTC', () => {
    const p = parsePeriodSlug('2026-06')!
    expect(p.start.toISOString()).toBe('2026-06-01T00:00:00.000Z')
  })

  it('borne haute = dernier jour du mois 23:59:59.999 UTC', () => {
    expect(parsePeriodSlug('2026-06')!.end.toISOString()).toBe('2026-06-30T23:59:59.999Z')
    expect(parsePeriodSlug('2026-02')!.end.toISOString()).toBe('2026-02-28T23:59:59.999Z')
    // Année bissextile
    expect(parsePeriodSlug('2024-02')!.end.toISOString()).toBe('2024-02-29T23:59:59.999Z')
    expect(parsePeriodSlug('2026-12')!.end.toISOString()).toBe('2026-12-31T23:59:59.999Z')
  })

  it('rejette les mois invalides', () => {
    expect(parsePeriodSlug('2026-13')).toBeNull()
    expect(parsePeriodSlug('2026-00')).toBeNull()
    expect(parsePeriodSlug('2026-6')).toBeNull() // pas zéro-paddé
    expect(parsePeriodSlug('2199-06')).toBeNull() // hors range
  })
})

describe('parsePeriodSlug — année', () => {
  it('parse une année', () => {
    const p = parsePeriodSlug('2026')!
    expect(p.kind).toBe('year')
    expect(p.year).toBe(2026)
    expect(p.label).toBe('2026')
    expect(p.start.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(p.end.toISOString()).toBe('2026-12-31T23:59:59.999Z')
  })

  it('rejette les années hors range', () => {
    expect(parsePeriodSlug('1999')).toBeNull()
    expect(parsePeriodSlug('2200')).toBeNull()
  })
})

describe('parsePeriodSlug — saisons', () => {
  it('printemps = mars-avril-mai', () => {
    const p = parsePeriodSlug('printemps-2026')!
    expect(p.kind).toBe('season')
    expect(p.season).toBe('printemps')
    expect(p.label).toBe('Printemps 2026')
    expect(p.start.toISOString()).toBe('2026-03-01T00:00:00.000Z')
    expect(p.end.toISOString()).toBe('2026-05-31T23:59:59.999Z')
  })

  it('été = juin-juillet-août', () => {
    const p = parsePeriodSlug('ete-2026')!
    expect(p.label).toBe('Été 2026')
    expect(p.start.toISOString()).toBe('2026-06-01T00:00:00.000Z')
    expect(p.end.toISOString()).toBe('2026-08-31T23:59:59.999Z')
  })

  it('automne = septembre-octobre-novembre', () => {
    const p = parsePeriodSlug('automne-2026')!
    expect(p.start.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    expect(p.end.toISOString()).toBe('2026-11-30T23:59:59.999Z')
  })

  it('hiver chevauche deux années (déc N → fév N+1)', () => {
    const p = parsePeriodSlug('hiver-2026')!
    expect(p.start.toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(p.end.toISOString()).toBe('2027-02-28T23:59:59.999Z')
  })

  it('hiver d\'année bissextile', () => {
    const p = parsePeriodSlug('hiver-2023')!
    // Hiver 2023 = déc 2023 → fév 2024 (bissextile)
    expect(p.end.toISOString()).toBe('2024-02-29T23:59:59.999Z')
  })

  it('rejette les saisons inconnues', () => {
    expect(parsePeriodSlug('summer-2026')).toBeNull()
    expect(parsePeriodSlug('printemps-')).toBeNull()
    expect(parsePeriodSlug('-2026')).toBeNull()
  })
})

describe('parsePeriodSlug — entrée invalide', () => {
  it('retourne null sur entrées vides ou inattendues', () => {
    expect(parsePeriodSlug('')).toBeNull()
    expect(parsePeriodSlug('   ')).toBeNull()
    expect(parsePeriodSlug('2026/06')).toBeNull()
    expect(parsePeriodSlug('hello')).toBeNull()
    // @ts-expect-error test runtime
    expect(parsePeriodSlug(null)).toBeNull()
    // @ts-expect-error test runtime
    expect(parsePeriodSlug(undefined)).toBeNull()
  })

  it('normalise la casse', () => {
    expect(parsePeriodSlug('ETE-2026')!.season).toBe('ete')
    expect(parsePeriodSlug('  2026-06  ')!.month).toBe(6)
  })
})

describe('listStaticPeriodSlugs', () => {
  it('génère tous les slugs nécessaires (12 mois + 3 années + 8 saisons)', () => {
    const slugs = listStaticPeriodSlugs(new Date('2026-06-15T00:00:00Z'))
    expect(slugs).toHaveLength(12 + 3 + 8)
    expect(slugs).toContain('2026-06')
    expect(slugs).toContain('2026-11') // +5 mois depuis juin
    expect(slugs).toContain('2025-12') // -6 mois depuis juin
    expect(slugs).toContain('2026')
    expect(slugs).toContain('ete-2026')
    expect(slugs).toContain('hiver-2027')
  })

  it('chaque slug est parsable', () => {
    const slugs = listStaticPeriodSlugs(new Date('2026-06-15T00:00:00Z'))
    for (const slug of slugs) {
      expect(parsePeriodSlug(slug), `slug ${slug} non parsable`).not.toBeNull()
    }
  })
})

describe('currentMonthSlug', () => {
  it('retourne le mois courant zéro-paddé', () => {
    expect(currentMonthSlug(new Date('2026-06-15T00:00:00Z'))).toBe('2026-06')
    expect(currentMonthSlug(new Date('2026-01-15T00:00:00Z'))).toBe('2026-01')
  })
})

describe('siblingMonthSlug', () => {
  it('retourne le mois suivant', () => {
    const p = parsePeriodSlug('2026-06')!
    expect(siblingMonthSlug(p, 1)).toBe('2026-07')
  })
  it('retourne le mois précédent (passe l\'année)', () => {
    const p = parsePeriodSlug('2026-01')!
    expect(siblingMonthSlug(p, -1)).toBe('2025-12')
  })
  it('retourne null pour année / saison', () => {
    expect(siblingMonthSlug(parsePeriodSlug('2026')!, 1)).toBeNull()
    expect(siblingMonthSlug(parsePeriodSlug('ete-2026')!, 1)).toBeNull()
  })
})

describe('isPeriodFullyPast', () => {
  it('détecte un mois passé', () => {
    const p = parsePeriodSlug('2025-01')!
    expect(isPeriodFullyPast(p, new Date('2026-06-15T00:00:00Z'))).toBe(true)
  })
  it('mois courant n\'est pas passé', () => {
    const p = parsePeriodSlug('2026-06')!
    expect(isPeriodFullyPast(p, new Date('2026-06-15T00:00:00Z'))).toBe(false)
  })
  it('mois futur n\'est pas passé', () => {
    const p = parsePeriodSlug('2026-12')!
    expect(isPeriodFullyPast(p, new Date('2026-06-15T00:00:00Z'))).toBe(false)
  })
})
