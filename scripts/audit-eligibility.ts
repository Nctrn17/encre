#!/usr/bin/env tsx
/**
 * Audit read-only : repère les opportunités avec signaux d'éligibilité
 * sensibles mais éligibilité structurée absente ou incomplète.
 *
 * Usage :
 *   npm run audit:eligibility
 *   npm run audit:eligibility -- --limit 20
 */

import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { createClient } from '@supabase/supabase-js'

interface Opp {
  id: string
  slug: string
  title: string
  emitter: string
  source_url: string
  description: string | null
  conditions: string[] | null
  disciplines_tags: string[] | null
  eligibility_summary: string | null
  eligibility_profile: Record<string, unknown> | null
}

const SIGNAL_RE =
  /(?:r[ée]serv[ée]e?s?|destin[ée]e?s?|ouverte?s?|priorit[ée])[^.\n]{0,100}(?:femmes?|minorit[ée]s?\s+de\s+genre|non\s+r[ée]sidents?|citoyens?\s+fran[çc]ais|pays\s+du\s+sud|outre[\s-]?mer|ultra[\s-]?marins?|[ée]trangers?|soci[ée]taires?)|soci[ée]taires?\s+(?:sacd|scam)|(?:producteur|[ée]diteur)\s+(?:attach[ée]\s+)?(?:requis|obligatoire)|moins\s+de\s+\d{2}\s+ans/i

const NEGATIVE_SIGNAL_RE =
  /pas\s+de\s+(?:producteur|[ée]diteur)\s+(?:requis|obligatoire)|sans\s+(?:producteur|[ée]diteur)\s+(?:requis|obligatoire)|(?:producteur|[ée]diteur)\s+non\s+(?:requis|obligatoire)/i

async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
  const limit = limitArg ? Number.parseInt(limitArg.split('=')[1] ?? '', 10) : null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing Supabase credentials in .env.local')
    process.exit(1)
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await sb
    .from('opportunities')
    .select('id,slug,title,emitter,source_url,description,conditions,disciplines_tags,eligibility_summary,eligibility_profile')
    .eq('is_published', true)
    .order('updated_at', { ascending: false })
    .limit(1000)

  if (error) {
    if (error.message.includes('eligibility_')) {
      console.error(
        'La migration 0034_opportunity_eligibility_profile.sql doit être appliquée avant cet audit.',
      )
      process.exit(1)
    }
    console.error('DB error:', error.message)
    process.exit(1)
  }

  const findings = ((data ?? []) as unknown as Opp[]).filter(needsEligibilityReview)
  const shown = typeof limit === 'number' && Number.isFinite(limit) ? findings.slice(0, limit) : findings

  for (const opp of shown) {
    const signal = firstSignal(`${opp.title}\n${opp.description ?? ''}\n${(opp.conditions ?? []).join('\n')}`)
    console.log(`\n▶ ${opp.emitter} : ${opp.title}`)
    console.log(`  slug: ${opp.slug}`)
    console.log(`  url:  ${opp.source_url}`)
    console.log(`  signal: ${signal ?? 'éligibilité sensible'}`)
    console.log(`  tags: ${(opp.disciplines_tags ?? []).join(', ') || '-'}`)
  }

  console.log('\n=== Bilan ===')
  console.log(`  ${findings.length} opportunité(s) à vérifier sur ${(data ?? []).length} scannée(s)`)
  if (shown.length < findings.length) {
    console.log(`  affichées : ${shown.length}`)
  }
}

function needsEligibilityReview(opp: Opp): boolean {
  const text = `${opp.title}\n${opp.description ?? ''}\n${(opp.conditions ?? []).join('\n')}`
  if (NEGATIVE_SIGNAL_RE.test(text)) return false
  if (!SIGNAL_RE.test(text)) return false

  const profile = isRecord(opp.eligibility_profile) ? opp.eligibility_profile : {}
  const requiresProfileData = Array.isArray(profile.requiresProfileData) ? profile.requiresProfileData : []
  const hardRestrictions = Array.isArray(profile.hardRestrictions) ? profile.hardRestrictions : []

  return !opp.eligibility_summary && requiresProfileData.length === 0 && hardRestrictions.length === 0
}

function firstSignal(text: string): string | null {
  return text.match(SIGNAL_RE)?.[0] ?? null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
