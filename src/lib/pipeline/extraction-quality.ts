import { detectCalendarPattern } from './calendar-pattern'

export type SectionKey = 'conditions' | 'calendrier' | 'dossier'

export interface ExtractedSections {
  conditions: readonly string[]
  calendrier: readonly string[]
  dossier: readonly string[]
}

export type ExtractionIssueSeverity = 'blocker' | 'warning'

export interface ExtractionQualityIssue {
  severity: ExtractionIssueSeverity
  code: string
  section: SectionKey | 'global'
  message: string
  evidence?: string
}

export interface ExtractionQualityResult {
  canSendDigest: boolean
  issues: ExtractionQualityIssue[]
}

const SECTION_MARKERS: Record<SectionKey, RegExp[]> = {
  conditions: [
    /\bconditions?\b/i,
    /\bcrit[èe]res?\b/i,
    /\b[ée]ligibilit[ée]\b/i,
    /\bouvert(?:e|s|es)?\s+(?:aux?|[àa])/i,
    /\br[ée]serv[ée](?:e|s|es)?\b/i,
    /\bmoins\s+de\s+\d{2}\s+ans\b/i,
    /\bsans\s+producteur\b/i,
    /\bproducteur\s+(?:attach[ée]\s+)?(?:requis|obligatoire)\b/i,
  ],
  calendrier: [
    /\bcalendrier\b/i,
    /\bdate\s+limite\b/i,
    /\bcl[ôo]ture\b/i,
    /\bd[ée]p[ôo]t\b/i,
    /\bcommission\b/i,
    /\bsession\b/i,
    /\baudition\b/i,
    /\br[ée]sultat/i,
  ],
  dossier: [
    /\bdossier\b/i,
    /\bpi[èe]ces?\s+(?:[àa]\s+)?fournir\b/i,
    /\bdocuments?\s+(?:demand[ée]s?|[àa]\s+joindre)\b/i,
    /\bCV\b/i,
    /\bnote\s+d['’]intention\b/i,
    /\bsynopsis\b/i,
    /\btraitement\b/i,
    /\bRIB\b/i,
  ],
}

const CALENDAR_SECONDARY_MARKERS: RegExp[] = [
  /\bcalendrier\b/i,
  /\bcommission\b/i,
  /\bsession\b/i,
  /\baudition\b/i,
  /\br[ée]sultat/i,
  /\bnotification\b/i,
  /\bpr[ée][-\s]s[ée]lection\b/i,
]

const RISKY_TERMS = [
  /\bRIB\b/i,
  /\bmoins\s+de\s+\d{2}\s+ans\b/i,
  /\b\d+\s*(?:pages?|films?|minutes?|ans)\b/i,
  /\b\d[\d\s]*(?:€|EUR|euros?)\b/i,
  /\bproducteur\s+(?:attach[ée]\s+)?(?:requis|obligatoire)\b/i,
  /\b[ée]diteur\s+(?:requis|obligatoire)\b/i,
]

export function gradeExtractionQuality(params: {
  sourceText: string | null | undefined
  sections: ExtractedSections
  classifyConfidence?: number | null
  deadlineKnown?: boolean
}): ExtractionQualityResult {
  const sourceText = params.sourceText ?? ''
  const issues: ExtractionQualityIssue[] = []

  if (params.classifyConfidence != null && params.classifyConfidence < 0.6) {
    issues.push({
      severity: 'blocker',
      code: 'low_classify_confidence',
      section: 'global',
      message: `Classification confidence is ${params.classifyConfidence}.`,
    })
  }

  for (const section of sectionKeys()) {
    if (params.sections[section].length === 0) {
      const markers =
        section === 'calendrier' && params.deadlineKnown
          ? CALENDAR_SECONDARY_MARKERS
          : SECTION_MARKERS[section]
      const evidence = firstMarkerEvidence(sourceText, markers)
      if (evidence) {
        issues.push({
          severity: 'blocker',
          code: `${section}_missing_despite_source_marker`,
          section,
          message: `${section} is empty but the source appears to mention it.`,
          evidence,
        })
      }
    }
  }

  const calendarPattern = detectCalendarPattern(sourceText, params.sections.calendrier)
  if (calendarPattern.pattern === 'partial_format_c') {
    issues.push({
      severity: 'blocker',
      code: 'calendar_partial_format_c',
      section: 'calendrier',
      message: 'Calendar looks like a recurrent-session header without closure dates.',
      evidence: calendarPattern.evidence ?? undefined,
    })
  }
  if (calendarPattern.pattern === 'awaiting_next') {
    issues.push({
      severity: 'blocker',
      code: 'calendar_awaiting_next_cycle',
      section: 'calendrier',
      message: 'Source says the next cycle details are still pending.',
      evidence: calendarPattern.evidence ?? undefined,
    })
  }
  if (looksLikeRecurrentCalendarTable(sourceText)) {
    const hasFormatSummary = params.sections.calendrier.some((item) =>
      /\d+\s+sessions?\s+par\s+an/i.test(item),
    )
    if (!hasFormatSummary) {
      issues.push({
        severity: 'blocker',
        code: 'calendar_recurrent_table_not_summarized',
        section: 'calendrier',
        message: 'Source looks like a recurrent calendar table but extraction lacks the canonical session summary.',
      })
    }
  }

  if (
    params.sections.dossier.length > 0 &&
    !firstMarkerEvidence(sourceText, SECTION_MARKERS.dossier)
  ) {
    issues.push({
      severity: 'blocker',
      code: 'dossier_extracted_without_source_marker',
      section: 'dossier',
      message: 'Dossier items were extracted but the source does not appear to list application documents.',
      evidence: params.sections.dossier.join(' | '),
    })
  }

  for (const section of sectionKeys()) {
    for (const item of params.sections[section]) {
      const unsupportedNumbers = extractMeaningfulNumbers(item).filter(
        (num) => !sourceContainsNumber(sourceText, num),
      )
      if (unsupportedNumbers.length > 0) {
        issues.push({
          severity: 'blocker',
          code: 'unsupported_number',
          section,
          message: `Item contains number(s) absent from source: ${unsupportedNumbers.join(', ')}.`,
          evidence: item,
        })
      }

      for (const risky of RISKY_TERMS) {
        const match = item.match(risky)
        if (match && !matchesAny(sourceText, [new RegExp(escapeRegExp(match[0]), 'i')])) {
          issues.push({
            severity: 'blocker',
            code: 'unsupported_risky_term',
            section,
            message: `Risky extracted term is absent from source: ${match[0]}.`,
            evidence: item,
          })
        }
      }
    }
  }

  return {
    canSendDigest: !issues.some((issue) => issue.severity === 'blocker'),
    issues,
  }
}

function sectionKeys(): SectionKey[] {
  return ['conditions', 'calendrier', 'dossier']
}

function firstMarkerEvidence(text: string, markers: readonly RegExp[]): string | null {
  for (const marker of markers) {
    const match = text.match(marker)
    if (match) return snippetAround(text, match.index ?? 0)
  }
  return null
}

function matchesAny(text: string, markers: readonly RegExp[]): boolean {
  return markers.some((marker) => marker.test(text))
}

function snippetAround(text: string, index: number): string {
  const start = Math.max(0, index - 80)
  const end = Math.min(text.length, index + 160)
  return text.slice(start, end).replace(/\s+/g, ' ').trim()
}

function extractMeaningfulNumbers(text: string): string[] {
  return [...text.matchAll(/\b\d{1,4}\b/g)]
    .map((match) => match[0])
    .filter((num) => {
      const value = Number.parseInt(num, 10)
      return value > 1 || num.length >= 4
    })
}

function sourceContainsNumber(sourceText: string, num: string): boolean {
  const compactSource = sourceText.replace(/\s+/g, '')
  return compactSource.includes(num)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function looksLikeRecurrentCalendarTable(text: string): boolean {
  const hasClosureHeader = /cl[ôo]ture\s+du\s+d[ée]p[ôo]t|date\s+limite|deadline/i.test(text)
  const sessionRows = text
    .split('\n')
    .filter((line) => /^\s*\d+\s*\|/.test(line) || /\bsession\s+\d+\b/i.test(line))
  return hasClosureHeader && sessionRows.length >= 3
}
