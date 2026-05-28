/**
 * Source-level extraction smoke test.
 *
 * Samples raw_items from each source and runs a conservative Gemini cascade:
 * gemini-3.1-flash-lite -> gemini-2.5-flash -> gemini-3-flash-preview.
 *
 * The goal is not to maximize API usage. It is to see, source by source,
 * what the extraction produces and whether the digest gate would block it.
 *
 * Usage:
 *   npm run eval:sources:extraction -- --dry-list
 *   npm run eval:sources:extraction -- --source-limit=5
 *   npm run eval:sources:extraction -- --offset=5 --source-limit=5
 *   npm run eval:sources:extraction -- --source=cnc
 *   npm run eval:sources:extraction -- --include-inactive --source=cnm
 */

import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { createClient } from '@supabase/supabase-js'
import { classifyOpportunity } from '../src/lib/pipeline/classify'
import {
  applyContinuousFlowOverride,
  detectCalendarPattern,
} from '../src/lib/pipeline/calendar-pattern'
import { gradeExtractionQuality } from '../src/lib/pipeline/extraction-quality'
import { RawItemPayloadSchema, type ClassificationOutput } from '../src/lib/pipeline/schemas'

interface SampledRawItem {
  id: number
  scraped_at: string
  payload: unknown
  sources:
    | {
    slug: string
    name: string
    is_active: boolean
      }
    | Array<{
        slug: string
        name: string
        is_active: boolean
      }>
}

interface SourceSample {
  sourceSlug: string
  sourceName: string
  rawId: number
  title: string
  url: string
  emitterName: string
  deadlineKnown: boolean
  descriptionLength: number
  payload: ReturnType<typeof RawItemPayloadSchema.parse>
}

const args = process.argv.slice(2)
const dryList = args.includes('--dry-list')
const includeInactive = args.includes('--include-inactive')
const onlySource = readArg('--source')
const sourceLimit = readPositiveIntArg('--source-limit') ?? 8
const offset = readPositiveIntArg('--offset') ?? 0
const perSource = readPositiveIntArg('--per-source') ?? 1

const GEMINI_CASCADE = [
  { model: 'gemini-3.1-flash-lite', maxCallsPerRun: 30, minDelayMs: 6500 },
  { model: 'gemini-2.5-flash', maxCallsPerRun: 4, minDelayMs: 15000 },
  { model: 'gemini-3-flash-preview', maxCallsPerRun: 4, minDelayMs: 15000 },
] as const

const geminiUsage = new Map<string, { calls: number; lastCallAt: number }>()

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error('NEXT_PUBLIC_SUPABASE_URL missing.')
  process.exit(1)
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY missing.')
  process.exit(1)
}
if (!dryList && !process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY missing.')
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

async function main() {
  const samples = await loadSamples()

  if (dryList) {
    console.log(`Source samples (${samples.length})`)
    for (const sample of samples) {
      console.log(
        `${sample.sourceSlug} | raw#${sample.rawId} | ${sample.title.slice(0, 90)} | ${sample.descriptionLength} chars`,
      )
    }
    return
  }

  console.log(`Source extraction eval · ${samples.length} sample(s)`)
  console.log(`Cascade: ${GEMINI_CASCADE.map((s) => s.model).join(' -> ')}`)

  let sendable = 0
  let blocked = 0
  let errors = 0

  for (const sample of samples) {
    const result = await runCascade(sample)
    if (result.error) errors++
    else if (result.quality.canSendDigest) sendable++
    else blocked++

    printResult(sample, result)
  }

  console.log('\nSummary')
  console.log(`  sendable: ${sendable}`)
  console.log(`  blocked : ${blocked}`)
  console.log(`  errors  : ${errors}`)
}

async function loadSamples(): Promise<SourceSample[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  let query = supabase
    .from('raw_items')
    .select('id,scraped_at,payload,sources!inner(slug,name,is_active)')
    .eq('status', 'processed')
    .order('scraped_at', { ascending: false })
    .limit(1500)

  if (!includeInactive) {
    query = query.eq('sources.is_active', true)
  }

  const { data, error } = await query

  if (error) throw error

  const grouped = new Map<string, SourceSample[]>()
  for (const row of (data ?? []) as unknown as SampledRawItem[]) {
    const source = Array.isArray(row.sources) ? row.sources[0] : row.sources
    if (!source) continue
    const sourceSlug = source.slug
    if (onlySource && sourceSlug !== onlySource) continue

    const parsed = RawItemPayloadSchema.safeParse(row.payload)
    if (!parsed.success) continue
    if (!parsed.data.description || parsed.data.description.length < 80) continue

    const sample: SourceSample = {
      sourceSlug,
      sourceName: source.name,
      rawId: row.id,
      title: parsed.data.title,
      url: parsed.data.url,
      emitterName: parsed.data.emitter ?? source.name,
      deadlineKnown: Boolean(parsed.data.deadline),
      descriptionLength: parsed.data.description.length,
      payload: parsed.data,
    }

    const bucket = grouped.get(sourceSlug) ?? []
    if (bucket.length < perSource) bucket.push(sample)
    grouped.set(sourceSlug, bucket)
  }

  return [...grouped.values()]
    .map((items) => items[0])
    .filter(Boolean)
    .sort((a, b) => a.sourceSlug.localeCompare(b.sourceSlug))
    .slice(onlySource ? 0 : offset, onlySource ? undefined : offset + sourceLimit)
}

async function runCascade(sample: SourceSample): Promise<{
  output: ClassificationOutput | null
  quality: ReturnType<typeof gradeExtractionQuality>
  attempts: Array<{ model: string; status: 'pass' | 'blocked' | 'error'; detail?: string }>
  error?: string
}> {
  const attempts: Array<{ model: string; status: 'pass' | 'blocked' | 'error'; detail?: string }> = []
  let lastOutput: ClassificationOutput | null = null
  let lastQuality = gradeExtractionQuality({
    sourceText: sample.payload.description,
    sections: { conditions: [], calendrier: [], dossier: [] },
    classifyConfidence: 0,
    deadlineKnown: sample.deadlineKnown,
  })
  let lastError: string | undefined

  for (const step of GEMINI_CASCADE) {
    const usage = geminiUsage.get(step.model) ?? { calls: 0, lastCallAt: 0 }
    if (usage.calls >= step.maxCallsPerRun) {
      attempts.push({
        model: step.model,
        status: 'error',
        detail: `safe budget exhausted (${usage.calls}/${step.maxCallsPerRun})`,
      })
      continue
    }

    await waitForGeminiSlot(step.model, step.minDelayMs)

    try {
      usage.calls++
      usage.lastCallAt = Date.now()
      geminiUsage.set(step.model, usage)

      const raw = await classifyOpportunity(sample.payload, sample.emitterName, {
        model: step.model,
      })
      const calendarPattern = detectCalendarPattern(
        sample.payload.description,
        raw.calendrier,
      )
      const output = {
        ...raw,
        calendrier: applyContinuousFlowOverride(raw.calendrier, calendarPattern.pattern),
      }
      const quality = gradeExtractionQuality({
        sourceText: sample.payload.description,
        sections: output,
        classifyConfidence: output.confidence,
        deadlineKnown: sample.deadlineKnown,
      })

      lastOutput = output
      lastQuality = quality

      if (quality.canSendDigest) {
        attempts.push({ model: step.model, status: 'pass' })
        return { output, quality, attempts }
      }

      attempts.push({
        model: step.model,
        status: 'blocked',
        detail: quality.issues.map((issue) => issue.code).join(', '),
      })
    } catch (err) {
      lastError = (err as Error).message
      attempts.push({
        model: step.model,
        status: 'error',
        detail: lastError.slice(0, 160),
      })
    }
  }

  return {
    output: lastOutput,
    quality: lastQuality,
    attempts,
    error: lastOutput ? undefined : lastError,
  }
}

function printResult(
  sample: SourceSample,
  result: Awaited<ReturnType<typeof runCascade>>,
) {
  const verdict = result.error
    ? 'ERROR'
    : result.quality.canSendDigest
      ? 'SENDABLE'
      : 'BLOCKED'

  console.log(`\n[${verdict}] ${sample.sourceSlug} · raw#${sample.rawId}`)
  console.log(`  ${sample.title}`)
  console.log(`  ${sample.url}`)
  console.log(
    `  attempts: ${result.attempts.map((a) => `${a.model}:${a.status}${a.detail ? `(${a.detail})` : ''}`).join(' -> ')}`,
  )

  if (result.error) {
    console.log(`  error: ${result.error}`)
    return
  }

  if (!result.quality.canSendDigest) {
    console.log(`  blockers: ${result.quality.issues.map((issue) => issue.code).join(', ')}`)
  }

  const out = result.output
  if (!out) return
  console.log(`  type/scope/conf: ${out.type} · ${out.geo_scope} · ${out.confidence}`)
  console.log(`  conditions (${out.conditions.length}): ${out.conditions.slice(0, 3).join(' | ')}`)
  console.log(`  calendrier (${out.calendrier.length}): ${out.calendrier.slice(0, 3).join(' | ')}`)
  console.log(`  dossier (${out.dossier.length}): ${out.dossier.slice(0, 3).join(' | ')}`)
}

async function waitForGeminiSlot(modelName: string, minDelayMs: number): Promise<void> {
  const usage = geminiUsage.get(modelName)
  if (!usage?.lastCallAt) return

  const elapsed = Date.now() - usage.lastCallAt
  const waitMs = minDelayMs - elapsed
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }
}

function readArg(name: string): string | null {
  const prefix = `${name}=`
  const match = args.find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : null
}

function readPositiveIntArg(name: string): number | null {
  const raw = readArg(name)
  if (!raw) return null
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) && value > 0 ? value : null
}
