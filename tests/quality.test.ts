import { describe, it, expect } from 'vitest'
import {
  classifyChar,
  findSuspectChars,
  hasSuspectChars,
  stripSuspectChars,
} from '@/lib/normalize/quality'

describe('classifyChar', () => {
  it('returns null for clean French chars', () => {
    expect(classifyChar('a')).toBeNull()
    expect(classifyChar('A')).toBeNull()
    expect(classifyChar('é')).toBeNull()
    expect(classifyChar('è')).toBeNull()
    expect(classifyChar('œ')).toBeNull()
    expect(classifyChar('ç')).toBeNull()
    expect(classifyChar('à')).toBeNull()
    expect(classifyChar('ü')).toBeNull() // français, pas suspect (capharnaüm)
    expect(classifyChar('ï')).toBeNull()
  })

  it('flags non-French Latin-1 chars', () => {
    expect(classifyChar('ä')).toBe('latin-1-non-fr')
    expect(classifyChar('ö')).toBe('latin-1-non-fr')
    expect(classifyChar('å')).toBe('latin-1-non-fr')
    expect(classifyChar('ñ')).toBe('latin-1-non-fr')
    expect(classifyChar('ø')).toBe('latin-1-non-fr')
  })

  it('flags Vietnamese (Latin Extended Additional)', () => {
    expect(classifyChar('ứ')).toBe('latin-extended-additional')
    expect(classifyChar('ố')).toBe('latin-extended-additional')
    expect(classifyChar('ữ')).toBe('latin-extended-additional')
  })

  it('flags Polish/Czech (Latin Extended A)', () => {
    expect(classifyChar('ł')).toBe('latin-extended-a')
    expect(classifyChar('ą')).toBe('latin-extended-a')
    expect(classifyChar('ć')).toBe('latin-extended-a')
    expect(classifyChar('š')).toBe('latin-extended-a')
  })

  it('flags Arabic chars', () => {
    expect(classifyChar('ي')).toBe('arabic')
    expect(classifyChar('ن')).toBe('arabic')
    expect(classifyChar('د')).toBe('arabic')
  })

  it('flags Cyrillic chars', () => {
    expect(classifyChar('д')).toBe('cyrillic')
    expect(classifyChar('Д')).toBe('cyrillic')
  })

  it('flags CJK / Hangul / Kana', () => {
    expect(classifyChar('中')).toBe('cjk')
    expect(classifyChar('한')).toBe('hangul')
    expect(classifyChar('あ')).toBe('kana')
  })

  it('lets through punctuation and symbols', () => {
    expect(classifyChar('—')).toBeNull() // em dash
    expect(classifyChar('…')).toBeNull() // ellipsis
    expect(classifyChar('«')).toBeNull()
    expect(classifyChar('»')).toBeNull()
    expect(classifyChar('€')).toBeNull()
  })
})

describe('findSuspectChars', () => {
  it('finds Vietnamese intrusion mid-word', () => {
    // Cas réel observé : "cứrtal" dans une opp CNC documentaire
    const findings = findSuspectChars('Réunion d\'information cứrtal documentaire')
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].kind).toBe('latin-extended-additional')
    expect(findings[0].char).toBe('ứ')
  })

  it('finds Arabic combining marks mid-word', () => {
    // Cas réel observé : "Examenينdes" - Arabic chars insérés entre
    // "Examen" et "des" (ي + ن = 2 chars arabes)
    const findings = findSuspectChars('Examenينdes dossiers')
    expect(findings.length).toBe(2)
    expect(findings.every((f) => f.kind === 'arabic')).toBe(true)
  })

  it('finds Swedish character', () => {
    // Cas réel observé : "Réunion särskilt documentary"
    const findings = findSuspectChars('Réunion särskilt documentary')
    expect(findings.length).toBe(1)
    expect(findings[0].char).toBe('ä')
  })

  it('returns empty array on clean French text', () => {
    const findings = findSuspectChars('Réunion d\'information FSA documentaire')
    expect(findings).toEqual([])
  })

  it('returns empty array on text with only French chars + punctuation', () => {
    expect(
      findSuspectChars('Clôtures 2026 : 26 janvier, 20 avril, 22 septembre'),
    ).toEqual([])
  })

  it('captures context for debugging', () => {
    const text = 'Une condition normale puis cứrtal puis du français'
    const findings = findSuspectChars(text)
    expect(findings[0].context).toContain('cứrtal')
  })
})

describe('hasSuspectChars', () => {
  it('returns true when any suspect char present', () => {
    expect(hasSuspectChars('Examenينdes dossiers')).toBe(true)
    expect(hasSuspectChars('cứrtal')).toBe(true)
  })

  it('returns false on clean French', () => {
    expect(hasSuspectChars('Clôture des candidatures le 30 octobre 2026')).toBe(
      false,
    )
  })
})

describe('stripSuspectChars', () => {
  it('returns clean text untouched with removedCount=0', () => {
    const r = stripSuspectChars(
      'Clôture des candidatures le 30 octobre 2026 à minuit',
    )
    expect(r.text).toBe('Clôture des candidatures le 30 octobre 2026 à minuit')
    expect(r.removedCount).toBe(0)
    expect(r.removedByKind).toEqual({})
  })

  it('strips Arabic combining marks mid-word (collapses to French context)', () => {
    const r = stripSuspectChars('Examenينdes dossiers')
    expect(r.text).toBe('Examendes dossiers')
    expect(r.removedCount).toBe(2)
    expect(r.removedByKind).toEqual({ arabic: 2 })
  })

  it('strips Vietnamese intrusion', () => {
    const r = stripSuspectChars('Réunion d\'information cứrtal documentaire')
    expect(r.text).toBe("Réunion d'information crtal documentaire")
    expect(r.removedCount).toBe(1)
    expect(r.removedByKind).toEqual({ 'latin-extended-additional': 1 })
  })

  it('strips Swedish ä', () => {
    const r = stripSuspectChars('särskilt documentary')
    expect(r.text).toBe('srskilt documentary')
    expect(r.removedCount).toBe(1)
    expect(r.removedByKind).toEqual({ 'latin-1-non-fr': 1 })
  })

  it('strips Devanagari and reports by kind', () => {
    const r = stripSuspectChars('dépôt यसिन des dossiers')
    expect(r.text).toBe('dépôt  des dossiers')
    expect(r.removedCount).toBe(4)
    expect(r.removedByKind).toEqual({ devanagari: 4 })
  })

  it('strips multiple kinds and tallies per kind', () => {
    const r = stripSuspectChars('mixin dеs ينexamen')
    // "е" est cyrillique (U+0435), pas français "e"
    // "ي" et "ن" sont arabes
    expect(r.removedCount).toBe(3)
    expect(r.removedByKind.cyrillic).toBe(1)
    expect(r.removedByKind.arabic).toBe(2)
  })

  it('preserves all French chars, punctuation, and whitespace', () => {
    const text = 'Œuvre - clôture : 1er février 2026 ; cf. § 4.5 (l\'article)'
    const r = stripSuspectChars(text)
    expect(r.text).toBe(text)
    expect(r.removedCount).toBe(0)
  })

  it('handles null/undefined input gracefully', () => {
    expect(stripSuspectChars(null).text).toBe('')
    expect(stripSuspectChars(undefined).text).toBe('')
    expect(stripSuspectChars(null).removedCount).toBe(0)
  })

  it('preserves CJK strip even on long content', () => {
    const r = stripSuspectChars('Une description avec 中文字符 inséré')
    expect(r.text).toBe('Une description avec  inséré')
    expect(r.removedByKind.cjk).toBe(4)
  })
})
