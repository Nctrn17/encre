import { describe, it, expect } from 'vitest'
import {
  normalizeSectionItem,
  normalizeSectionList,
} from '@/lib/normalize/section-item'

describe('normalizeSectionItem', () => {
  describe('common rules', () => {
    it('capitalizes first letter (idempotent if already cap)', () => {
      expect(normalizeSectionItem('être auteur', 'conditions')).toBe('Être auteur')
      expect(normalizeSectionItem('Être auteur', 'conditions')).toBe('Être auteur')
    })

    it('uses typographic apostrophe', () => {
      expect(normalizeSectionItem("L'auteur doit", 'conditions')).toBe('L’auteur doit')
    })

    it('strips trailing period but keeps ? and !', () => {
      expect(normalizeSectionItem('Soutien à la création.', 'conditions')).toBe(
        'Soutien à la création',
      )
      expect(normalizeSectionItem('Soutien ?', 'conditions')).toContain('?')
    })

    it('puts non-breaking space before : ; ? !', () => {
      const out = normalizeSectionItem('Synopsis: 5 pages', 'conditions')
      // Le NBSP est un caractère unicode  , pas un espace standard
      expect(out).toContain(' :')
    })

    it('collapses multi-spaces', () => {
      expect(normalizeSectionItem('Soutien   à   la   création', 'conditions')).toBe(
        'Soutien à la création',
      )
    })

    it('returns empty string for empty input', () => {
      expect(normalizeSectionItem('', 'conditions')).toBe('')
      expect(normalizeSectionItem('   ', 'conditions')).toBe('')
    })
  })

  describe('calendrier specifics', () => {
    it('lowercases month names', () => {
      expect(normalizeSectionItem('30 Octobre 2026 : clôture', 'calendrier')).toContain(
        '30 octobre 2026',
      )
      expect(normalizeSectionItem('30 Decembre 2026 : clôture', 'calendrier')).toContain(
        '30 decembre 2026',
      )
    })

    it('formats "1er" for the 1st of the month', () => {
      expect(normalizeSectionItem('1 janvier 2026 : ouverture', 'calendrier')).toContain(
        '1er janvier 2026',
      )
      // Pas de transformation si déjà 1er
      expect(normalizeSectionItem('1er janvier 2026 : ouverture', 'calendrier')).toContain(
        '1er janvier 2026',
      )
    })

    it('converts ISO YYYY-MM-DD to French date format', () => {
      // Cas réel : opp "Aide au développement de l'emploi pour l'exploitation
      // itinérante" avait `2026-03-09 : clôture` au lieu de `9 mars 2026 : clôture`
      expect(normalizeSectionItem('2026-03-09 : clôture des candidatures', 'calendrier')).toContain(
        '9 mars 2026',
      )
      expect(normalizeSectionItem('2026-05-07 : date limite', 'calendrier')).toContain(
        '7 mai 2026',
      )
    })

    it('uses "1er" when ISO day is 01', () => {
      expect(normalizeSectionItem('2026-01-01 : ouverture', 'calendrier')).toContain(
        '1er janvier 2026',
      )
    })

    it('handles all 12 months in ISO format', () => {
      const tests: Array<[string, string]> = [
        ['2026-01-15', '15 janvier 2026'],
        ['2026-02-15', '15 février 2026'],
        ['2026-03-15', '15 mars 2026'],
        ['2026-04-15', '15 avril 2026'],
        ['2026-05-15', '15 mai 2026'],
        ['2026-06-15', '15 juin 2026'],
        ['2026-07-15', '15 juillet 2026'],
        ['2026-08-15', '15 août 2026'],
        ['2026-09-15', '15 septembre 2026'],
        ['2026-10-15', '15 octobre 2026'],
        ['2026-11-15', '15 novembre 2026'],
        ['2026-12-15', '15 décembre 2026'],
      ]
      for (const [iso, fr] of tests) {
        expect(normalizeSectionItem(`${iso} : étape`, 'calendrier')).toContain(fr)
      }
    })

    it('leaves invalid ISO dates untouched (out of range)', () => {
      expect(normalizeSectionItem('2026-13-01 : etape', 'calendrier')).toContain('2026-13-01')
      expect(normalizeSectionItem('2026-00-15 : etape', 'calendrier')).toContain('2026-00-15')
      expect(normalizeSectionItem('2026-05-32 : etape', 'calendrier')).toContain('2026-05-32')
    })

    it('does NOT apply ISO transform to non-calendrier kinds', () => {
      // Conditions/dossier peuvent légitimement contenir des chiffres
      // qui ressemblent à du ISO (ex: numéros de loi). On ne touche pas.
      expect(normalizeSectionItem('Loi 2023-04-12 article 3', 'conditions')).toContain(
        '2023-04-12',
      )
    })

    it('handles multiple ISO dates in one item', () => {
      const out = normalizeSectionItem(
        'Sessions 2026 : 2026-03-09, 2026-05-07, 2026-09-21',
        'calendrier',
      )
      expect(out).toContain('9 mars 2026')
      expect(out).toContain('7 mai 2026')
      expect(out).toContain('21 septembre 2026')
      expect(out).not.toContain('2026-03-09')
    })
  })

  describe('dossier specifics', () => {
    it('strips parasite verb at start', () => {
      expect(normalizeSectionItem('Joindre une lettre de motivation', 'dossier')).toBe(
        'Lettre de motivation',
      )
      expect(normalizeSectionItem('Fournir un RIB', 'dossier')).toBe('RIB')
      expect(normalizeSectionItem('Déposer le synopsis', 'dossier')).toBe('Synopsis')
    })

    it('keeps content if no parasite verb', () => {
      expect(normalizeSectionItem('Lettre de motivation', 'dossier')).toBe(
        'Lettre de motivation',
      )
    })
  })

  describe('idempotence', () => {
    it('is idempotent on already-clean items', () => {
      const cases: Array<[string, 'conditions' | 'calendrier' | 'dossier']> = [
        ['Être auteur francophone', 'conditions'],
        ['30 octobre 2026 : clôture', 'calendrier'],
        ['Lettre de motivation', 'dossier'],
      ]
      for (const [input, kind] of cases) {
        const once = normalizeSectionItem(input, kind)
        const twice = normalizeSectionItem(once, kind)
        expect(twice).toBe(once)
      }
    })
  })
})

describe('normalizeSectionList', () => {
  it('returns empty array on null/undefined', () => {
    expect(normalizeSectionList(null, 'conditions')).toEqual([])
    expect(normalizeSectionList(undefined, 'conditions')).toEqual([])
  })

  it('filters out empty results after normalize', () => {
    expect(normalizeSectionList(['', '   ', 'Vraie condition'], 'conditions')).toEqual([
      'Vraie condition',
    ])
  })

  it('applies ISO conversion to all calendrier items', () => {
    const out = normalizeSectionList(
      ['2026-03-09 : clôture', '2026-05-07 : commission'],
      'calendrier',
    )
    expect(out[0]).toContain('9 mars 2026')
    expect(out[1]).toContain('7 mai 2026')
  })

  describe('suspect chars dropping', () => {
    it('drops items containing Arabic chars', () => {
      const out = normalizeSectionList(
        [
          'Janvier 2026 : examen des dossiers',
          'Mai 2026 : Examenينdes dossiers',
          'Septembre 2026 : examen des dossiers',
        ],
        'calendrier',
      )
      expect(out).toHaveLength(2)
      expect(out.every((i) => !i.includes('ي'))).toBe(true)
    })

    it('drops items containing Vietnamese chars', () => {
      const out = normalizeSectionList(
        ['Réunion d\'information', 'Réunion d\'information cứrtal documentaire'],
        'calendrier',
      )
      expect(out).toEqual(['Réunion d’information'])
    })

    it('drops items containing Devanagari chars', () => {
      const out = normalizeSectionList(
        ['25 février 2026 : dépôt des dossiers', '25 février 2026 : dépôt दरोंिोश dossiers'],
        'calendrier',
      )
      expect(out).toHaveLength(1)
    })

    it('drops items containing Swedish ä', () => {
      const out = normalizeSectionList(
        ['Réunion d\'information', 'Réunion särskilt documentary'],
        'calendrier',
      )
      expect(out).toHaveLength(1)
    })

    it('preserves all items in clean French', () => {
      const items = [
        'Clôtures 2026 : 26 janvier, 20 avril, 22 septembre',
        '30 octobre 2026 : date limite',
        'Réunion d\'information à 14h',
      ]
      const out = normalizeSectionList(items, 'calendrier')
      expect(out).toHaveLength(3)
    })
  })
})
