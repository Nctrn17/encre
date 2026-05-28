#!/usr/bin/env tsx
/**
 * Audit read-only du matching personnalise.
 *
 * Objectif : trouver rapidement les opportunites qui remontent trop haut ou
 * trop bas face a un profil donne, en particulier quand l'eligibilite contient
 * des signaux sensibles.
 *
 * Usage :
 *   npm run audit:matching
 *   npm run audit:matching -- --limit=40
 *   npm run audit:matching -- --profile=<alert_profile_id>
 *   npm run audit:matching -- --all-profiles
 */

import { loadEnv } from '../scrapers/lib/load-env'
loadEnv()

import { createClient } from '@supabase/supabase-js'
import type { AlertProfile } from '../src/features/alerts/queries'
import { matchOpportunity } from '../src/features/alerts/matchers'
import { readOpportunityForProfile } from '../src/features/personalization/match'
import type { Opportunity } from '../src/lib/supabase/types'

interface Finding {
  severity: 'high' | 'medium' | 'info'
  kind: string
  opportunity: Opportunity
  profile: AlertProfile
  strictMatch: ReturnType<typeof matchOpportunity>
  reading: ReturnType<typeof readOpportunityForProfile>
}

interface ReadingRow {
  opportunity: Opportunity
  profile: AlertProfile
  strictMatch: ReturnType<typeof matchOpportunity>
  reading: ReturnType<typeof readOpportunityForProfile>
}

async function main() {
  const limit = readNumberArg('--limit', 30)
  const profileId = readStringArg('--profile')
  const allProfiles = process.argv.includes('--all-profiles')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing Supabase credentials in .env.local')
    process.exit(1)
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const [{ data: oppRows, error: oppError }, { data: profileRows, error: profileError }] =
    await Promise.all([
      sb
        .from('opportunities')
        .select('*')
        .eq('is_published', true)
        .or(`deadline.is.null,deadline.gt.${new Date().toISOString()}`)
        .order('updated_at', { ascending: false })
        .limit(1000),
      sb
        .from('alert_profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
    ])

  if (oppError) {
    console.error('DB error opportunities:', oppError.message)
    process.exit(1)
  }
  if (profileError) {
    console.error('DB error alert_profiles:', profileError.message)
    process.exit(1)
  }

  const opportunities = (oppRows ?? []) as Opportunity[]
  const storedProfiles = (profileRows ?? []) as AlertProfile[]
  const profiles = selectProfiles(storedProfiles, { allProfiles, profileId })

  const rows = opportunities.flatMap((opportunity) =>
    profiles.map((profile) => buildReadingRow(opportunity, profile)),
  )
  const findings = rows
    .flatMap(inspectRow)
    .sort(compareFindings)

  const shown = findings.slice(0, limit)
  for (const finding of shown) {
    printFinding(finding)
  }

  console.log('\n=== Bilan ===')
  console.log(`  opportunites scannees : ${opportunities.length}`)
  console.log(`  profils testes        : ${profiles.length}`)
  console.log(`  cas suspects          : ${findings.length}`)
  if (shown.length < findings.length) {
    console.log(`  affiches              : ${shown.length}`)
  }

  const byKind = groupBy(findings, (finding) => finding.kind)
  for (const [kind, count] of Object.entries(byKind)) {
    console.log(`  ${kind}: ${count}`)
  }

  printScoreDistribution(rows)
  printTopReadings(rows, Math.min(10, limit))
}

function selectProfiles(
  storedProfiles: AlertProfile[],
  options: { allProfiles: boolean; profileId: string | null },
): AlertProfile[] {
  if (options.profileId) {
    const found = storedProfiles.find((profile) => profile.id === options.profileId)
    if (!found) {
      console.error(`Profil introuvable: ${options.profileId}`)
      process.exit(1)
    }
    return [found]
  }

  if (options.allProfiles && storedProfiles.length > 0) {
    return storedProfiles
  }

  return [makeDefaultScenarioProfile()]
}

function buildReadingRow(opportunity: Opportunity, profile: AlertProfile): ReadingRow {
  const strictMatch = matchOpportunity(opportunity, profile)
  const reading = readOpportunityForProfile(opportunity, profile)
  return { opportunity, profile, strictMatch, reading }
}

function inspectRow(row: ReadingRow): Finding[] {
  const { opportunity, profile, strictMatch, reading } = row
  const findings: Finding[] = []
  const hasSensitiveEligibility = isSensitiveOpportunity(opportunity)
  const hasEligibilityWarning = reading.warnings.some((warning) =>
    warning.toLowerCase().includes('eligibilite') ||
    warning.toLowerCase().includes('éligibilité') ||
    warning.toLowerCase().includes('situation personnelle'),
  )

  if (hasSensitiveEligibility && reading.level === 'strong' && hasEligibilityWarning) {
    findings.push({
      severity: 'high',
      kind: 'strong_with_eligibility_warning',
      opportunity,
      profile,
      strictMatch,
      reading,
    })
  }

  if (hasSensitiveEligibility && reading.score >= 85 && hasEligibilityWarning) {
    findings.push({
      severity: 'medium',
      kind: 'high_score_with_eligibility_warning',
      opportunity,
      profile,
      strictMatch,
      reading,
    })
  }

  if (strictMatch.match && strictMatch.reasons.includes('personalization')) {
    findings.push({
      severity: 'medium',
      kind: 'personalization_rejection',
      opportunity,
      profile,
      strictMatch,
      reading,
    })
  }

  if (hasSensitiveEligibility && reading.level !== 'not_recommended') {
    const profileData = asRecord(opportunity.eligibility_profile)?.requiresProfileData
    const requiresProfileData = Array.isArray(profileData) ? profileData : []
    if (requiresProfileData.length === 0 && !opportunity.eligibility_summary) {
      findings.push({
        severity: 'info',
        kind: 'sensitive_but_unstructured',
        opportunity,
        profile,
        strictMatch,
        reading,
      })
    }
  }

  return findings
}

function printScoreDistribution(rows: ReadingRow[]) {
  const buckets = {
    strong: rows.filter((row) => row.reading.level === 'strong').length,
    possible: rows.filter((row) => row.reading.level === 'possible').length,
    difficult: rows.filter((row) => row.reading.level === 'difficult').length,
    notRecommended: rows.filter((row) => row.reading.level === 'not_recommended').length,
    score95Plus: rows.filter((row) => row.reading.score >= 95).length,
    score100: rows.filter((row) => row.reading.score === 100).length,
  }

  console.log('\n=== Distribution scoring ===')
  console.log(`  strong            : ${buckets.strong}`)
  console.log(`  possible          : ${buckets.possible}`)
  console.log(`  difficult         : ${buckets.difficult}`)
  console.log(`  not_recommended   : ${buckets.notRecommended}`)
  console.log(`  score >= 95       : ${buckets.score95Plus}`)
  console.log(`  score = 100       : ${buckets.score100}`)
}

function printTopReadings(rows: ReadingRow[], limit: number) {
  const top = [...rows]
    .sort((a, b) => b.reading.score - a.reading.score)
    .slice(0, limit)

  if (top.length === 0) return

  console.log('\n=== Top lectures ===')
  for (const row of top) {
    console.log(
      `  ${row.reading.score}/100 ${row.reading.level.padEnd(15)} ${row.opportunity.emitter} - ${row.opportunity.title}`,
    )
    if (row.reading.warnings.length > 0) {
      console.log(`    warn: ${row.reading.warnings.join(' | ')}`)
    }
  }
}

function isSensitiveOpportunity(opportunity: Opportunity): boolean {
  const tags = opportunity.disciplines_tags ?? []
  const profile = asRecord(opportunity.eligibility_profile)
  const requiresProfileData = Array.isArray(profile?.requiresProfileData)
    ? profile.requiresProfileData
    : []
  const hardRestrictions = Array.isArray(profile?.hardRestrictions)
    ? profile.hardRestrictions
    : []

  return (
    tags.some((tag) =>
      ['foreign-only', 'pays-du-sud', 'outremer', 'femmes', 'minorites-de-genre'].includes(tag),
    ) ||
    requiresProfileData.length > 0 ||
    hardRestrictions.length > 0 ||
    Boolean(opportunity.eligibility_summary)
  )
}

function printFinding(finding: Finding) {
  const { opportunity, profile, reading, strictMatch } = finding
  console.log(`\n[${finding.severity.toUpperCase()}] ${finding.kind}`)
  console.log(`  opp:     ${opportunity.emitter} - ${opportunity.title}`)
  console.log(`  slug:    ${opportunity.slug}`)
  console.log(`  profile: ${profile.name}`)
  console.log(`  reading: ${reading.decisionLabel} (${reading.level}) - ${reading.score}/100`)
  console.log(`  strict:  ${strictMatch.match ? 'match' : 'reject'} - ${strictMatch.reasons.join(', ') || '-'}`)
  console.log(`  tags:    ${(opportunity.disciplines_tags ?? []).join(', ') || '-'}`)
  if (opportunity.eligibility_summary) {
    console.log(`  elig:    ${opportunity.eligibility_summary}`)
  }
  if (reading.warnings.length > 0) {
    console.log(`  warn:    ${reading.warnings.join(' | ')}`)
  }
  if (reading.reasons.length > 0) {
    console.log(`  why:     ${reading.reasons.join(' | ')}`)
  }
}

function compareFindings(a: Finding, b: Finding): number {
  const severity = severityWeight(b.severity) - severityWeight(a.severity)
  if (severity !== 0) return severity
  return b.reading.score - a.reading.score
}

function severityWeight(severity: Finding['severity']): number {
  if (severity === 'high') return 3
  if (severity === 'medium') return 2
  return 1
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = keyFn(item)
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readStringArg(name: string): string | null {
  const prefix = `${name}=`
  const arg = process.argv.find((item) => item.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : null
}

function readNumberArg(name: string, fallback: number): number {
  const value = readStringArg(name)
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function makeDefaultScenarioProfile(): AlertProfile {
  return {
    id: 'audit-default-scenario',
    user_id: 'audit',
    name: 'Audit - scenario hors reseau',
    disciplines: ['cinema', 'audiovisuel'],
    discipline_tags: ['scenario', 'court-metrage', 'long-metrage', 'serie', 'documentaire'],
    audience: [],
    types: [],
    geo_scopes: ['national', 'regional', 'metropole', 'europe', 'international'],
    region_codes: [],
    min_amount: null,
    frequency: 'weekly',
    send_weekday: 1,
    has_producer: false,
    films_produced_count: 0,
    age_range: 'not_specified',
    residency_context: 'france_metropole',
    nationality_context: 'france',
    gender_context: 'not_specified',
    professional_status_tags: [],
    hors_reseau_only: true,
    candidate_mode: 'balanced',
    is_active: true,
    last_sent_at: null,
    created_at: new Date().toISOString(),
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
