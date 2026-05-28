/**
 * Mini eval harness for LLM extraction quality.
 *
 * Runs classifyOpportunity on curated fixture cases, then grades:
 * - expected classification fields
 * - required section snippets
 * - forbidden empty sections
 * - deterministic digest gate from extraction-quality.ts
 *
 * Usage:
 *   npm run eval:llm:extraction
 *   npm run eval:llm:extraction -- --provider=gemini-cascade
 *   npm run eval:llm:extraction -- --provider=gemini --model=gemini-2.5-flash
 *   npm run eval:llm:extraction -- --provider=mistral --model=mistral-small-latest
 *   npm run eval:llm:extraction -- --case=cnc-format-c-recurring
 *   npm run eval:llm:extraction -- --max=3
 *   npm run eval:llm:extraction -- --json
 */

import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import { classifyOpportunity, DEFAULT_CLASSIFY_MODEL } from '../src/lib/pipeline/classify'
import { applyContinuousFlowOverride, detectCalendarPattern } from '../src/lib/pipeline/calendar-pattern'
import { gradeExtractionQuality } from '../src/lib/pipeline/extraction-quality'
import {
  ClassificationOutputSchema,
  type ClassificationOutput,
} from '../src/lib/pipeline/schemas'
import {
  AUDIENCE_SLUGS,
  DISCIPLINE_SLUGS,
  GEO_SCOPES,
  OPPORTUNITY_TYPES,
} from '../src/lib/discipline-taxonomy'
import {
  LLM_EXTRACTION_EVAL_CASES,
  type LlmExtractionEvalCase,
} from '../tests/fixtures/llm-extraction-cases'

interface CaseReport {
  id: string
  label: string
  pass: boolean
  checks: Array<{ name: string; pass: boolean; detail?: string }>
  output?: ClassificationOutput
  attempts?: Array<{ provider: Provider; model: string; pass: boolean; blocked: boolean; error?: string }>
  error?: string
}

const args = process.argv.slice(2)
const json = args.includes('--json')
type Provider = 'gemini' | 'gemini-cascade' | 'mistral'
const provider = (readArg('--provider') ?? 'gemini') as Provider
const model =
  readArg('--model') ??
  (provider === 'mistral' ? 'mistral-small-latest' : DEFAULT_CLASSIFY_MODEL)
const onlyCase = readArg('--case')
const maxCases = readPositiveIntArg('--max')

if ((provider === 'gemini' || provider === 'gemini-cascade') && !process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY missing. Add it to .env.local before running LLM evals.')
  process.exit(1)
}
if (provider === 'mistral' && !process.env.MISTRAL_API_KEY) {
  console.error('MISTRAL_API_KEY missing. Add it to .env.local before running Mistral evals.')
  process.exit(1)
}

const selectedCases = onlyCase
  ? LLM_EXTRACTION_EVAL_CASES.filter((c) => c.id === onlyCase)
  : LLM_EXTRACTION_EVAL_CASES
const cases = maxCases ? selectedCases.slice(0, maxCases) : selectedCases

const GEMINI_CASCADE = [
  // 500 RPD / 15 RPM in the free tier screenshot. Keep a wide margin.
  { model: 'gemini-3.1-flash-lite', maxCallsPerRun: 40, minDelayMs: 6500 },
  // 20 RPD / 5 RPM. Keep these for rare second-pass cases only.
  { model: 'gemini-2.5-flash', maxCallsPerRun: 6, minDelayMs: 15000 },
  { model: 'gemini-3-flash-preview', maxCallsPerRun: 6, minDelayMs: 15000 },
] as const

const geminiUsage = new Map<string, { calls: number; lastCallAt: number }>()

if (cases.length === 0) {
  console.error(`No eval case found for --case=${onlyCase}`)
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

async function main() {
  const reports: CaseReport[] = []

  for (const testCase of cases) {
    reports.push(await runCase(testCase))
  }

  const passed = reports.filter((r) => r.pass).length
  const failed = reports.length - passed

  if (json) {
    console.log(JSON.stringify({ provider, model, passed, failed, total: reports.length, reports }, null, 2))
  } else {
    const modelLabel =
      provider === 'gemini-cascade'
        ? GEMINI_CASCADE.map((step) => step.model).join(' -> ')
        : model
    console.log(`\nLLM extraction eval · ${provider} · ${modelLabel}`)
    console.log(`Result: ${passed}/${reports.length} passed`)
    for (const report of reports) {
      console.log(`\n${report.pass ? 'PASS' : 'FAIL'} ${report.id}`)
      console.log(`  ${report.label}`)
      if (report.error) {
        console.log(`  error: ${report.error}`)
      }
      if (report.attempts?.length) {
        for (const attempt of report.attempts) {
          const suffix = attempt.error ? ` · ${attempt.error}` : attempt.blocked ? ' · blocked' : ''
          console.log(`  attempt ${attempt.model}: ${attempt.pass ? 'PASS' : 'FAIL'}${suffix}`)
        }
      }
      for (const check of report.checks) {
        console.log(`  ${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` · ${check.detail}` : ''}`)
      }
    }
  }

  process.exitCode = failed === 0 ? 0 : 1
}

async function runCase(testCase: LlmExtractionEvalCase): Promise<CaseReport> {
  try {
    if (provider === 'gemini-cascade') {
      return await runCascadeCase(testCase)
    }

    const output = await classifyWithProvider(testCase, provider, model)
    const checks = gradeCase(testCase, output)
    return {
      id: testCase.id,
      label: testCase.label,
      pass: checks.every((check) => check.pass),
      checks,
      output,
    }
  } catch (err) {
    return {
      id: testCase.id,
      label: testCase.label,
      pass: false,
      checks: [],
      error: (err as Error).message,
    }
  }
}

async function runCascadeCase(testCase: LlmExtractionEvalCase): Promise<CaseReport> {
  const attempts: CaseReport['attempts'] = []
  let lastOutput: ClassificationOutput | undefined
  let lastChecks: CaseReport['checks'] = []
  let lastError: string | undefined

  for (const step of GEMINI_CASCADE) {
    const usage = geminiUsage.get(step.model) ?? { calls: 0, lastCallAt: 0 }
    if (usage.calls >= step.maxCallsPerRun) {
      attempts.push({
        provider: 'gemini',
        model: step.model,
        pass: false,
        blocked: true,
        error: `safe run budget exhausted (${usage.calls}/${step.maxCallsPerRun})`,
      })
      continue
    }

    await waitForGeminiSlot(step.model, step.minDelayMs)

    try {
      usage.calls++
      usage.lastCallAt = Date.now()
      geminiUsage.set(step.model, usage)

      const output = await classifyOpportunity(testCase.payload, testCase.emitterName, {
        model: step.model,
      })
      const checks = gradeCase(testCase, output)
      const pass = checks.every((check) => check.pass)
      const blocked = isDigestBlocked(checks)
      attempts.push({ provider: 'gemini', model: step.model, pass, blocked })
      lastOutput = output
      lastChecks = checks

      if (pass) {
        return {
          id: testCase.id,
          label: testCase.label,
          pass: true,
          checks,
          output,
          attempts,
        }
      }
    } catch (err) {
      lastError = (err as Error).message
      attempts.push({
        provider: 'gemini',
        model: step.model,
        pass: false,
        blocked: false,
        error: lastError,
      })
    }
  }

  return {
    id: testCase.id,
    label: testCase.label,
    pass: false,
    checks: lastChecks,
    output: lastOutput,
    attempts,
    error: lastOutput ? undefined : lastError,
  }
}

async function classifyWithProvider(
  testCase: LlmExtractionEvalCase,
  providerName: Exclude<Provider, 'gemini-cascade'>,
  modelName: string,
): Promise<ClassificationOutput> {
  return providerName === 'mistral'
    ? classifyWithMistral(testCase, modelName)
    : classifyOpportunity(testCase.payload, testCase.emitterName, { model: modelName })
}

function isDigestBlocked(checks: CaseReport['checks']): boolean {
  const gate = checks.find((check) => check.name === 'digest gate')
  return Boolean(gate?.detail?.startsWith('blocked'))
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

async function classifyWithMistral(
  testCase: LlmExtractionEvalCase,
  modelName: string,
): Promise<ClassificationOutput> {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      temperature: 0,
      max_tokens: 1600,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'classification_output',
          strict: true,
          schema: classificationJsonSchema(),
        },
      },
      messages: [
        {
          role: 'system',
          content: [
            'Tu extrais des appels culturels francais pour Encre.',
            'Reponds uniquement en JSON conforme au schema.',
            'N invente jamais de condition, date, seuil, montant ou piece de dossier.',
            'Si une information n est pas explicitement presente dans le texte source, renvoie une liste vide.',
            'Pour calendrier, n extrais pas la deadline principale seule sauf si elle est presente comme etape de calendrier.',
            'Pour les tableaux recurrentiels, lis les en-tetes et n extrais que la colonne cloture/date limite.',
            'confidence doit refleter la qualite reelle de ton extraction.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `Emetteur: ${testCase.emitterName}`,
            `Titre: ${testCase.payload.title}`,
            testCase.payload.region_hint ? `Indice geographique: ${testCase.payload.region_hint}` : null,
            testCase.payload.discipline_hints?.length
              ? `Indices disciplines: ${testCase.payload.discipline_hints.join(', ')}`
              : null,
            testCase.payload.amount_text ? `Montant: ${testCase.payload.amount_text}` : null,
            `Deadline brute: ${testCase.payload.deadline ?? 'non renseignee'}`,
            '',
            'Texte source:',
            testCase.payload.description ?? '',
          ]
            .filter((part): part is string => part !== null)
            .join('\n'),
        },
      ],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Mistral API error ${response.status} (${modelName}): ${text.slice(0, 500)}`)
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>
  }
  const content = json.choices?.[0]?.message?.content
  const text = typeof content === 'string' ? content : JSON.stringify(content)
  const parsedJson = JSON.parse(text)
  const parsed = ClassificationOutputSchema.safeParse(parsedJson)
  if (!parsed.success) {
    throw new Error(`Mistral schema invalid (${modelName}): ${JSON.stringify(parsed.error.flatten())}`)
  }
  const calendarPattern = detectCalendarPattern(
    testCase.payload.description,
    parsed.data.calendrier,
  )
  return {
    ...parsed.data,
    calendrier: applyContinuousFlowOverride(
      parsed.data.calendrier,
      calendarPattern.pattern,
    ),
  }
}

function classificationJsonSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'type',
      'disciplines',
      'audience',
      'geo_scope',
      'confidence',
      'reasoning',
      'conditions',
      'calendrier',
      'dossier',
    ],
    properties: {
      type: { type: 'string', enum: OPPORTUNITY_TYPES },
      disciplines: {
        type: 'array',
        minItems: 1,
        maxItems: 5,
        items: { type: 'string', enum: DISCIPLINE_SLUGS },
      },
      audience: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        items: { type: 'string', enum: AUDIENCE_SLUGS },
      },
      geo_scope: { type: 'string', enum: GEO_SCOPES },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      reasoning: { type: 'string', maxLength: 500 },
      conditions: {
        type: 'array',
        maxItems: 12,
        items: { type: 'string', minLength: 1, maxLength: 280 },
      },
      calendrier: {
        type: 'array',
        maxItems: 10,
        items: { type: 'string', minLength: 1, maxLength: 200 },
      },
      dossier: {
        type: 'array',
        maxItems: 15,
        items: { type: 'string', minLength: 1, maxLength: 280 },
      },
    },
  }
}

function gradeCase(testCase: LlmExtractionEvalCase, output: ClassificationOutput): CaseReport['checks'] {
  const checks: CaseReport['checks'] = []
  const expected = testCase.expected

  if (expected.type) {
    checks.push({
      name: 'type',
      pass: output.type === expected.type,
      detail: `${output.type} expected ${expected.type}`,
    })
  }

  if (expected.geoScope) {
    checks.push({
      name: 'geo_scope',
      pass: output.geo_scope === expected.geoScope,
      detail: `${output.geo_scope} expected ${expected.geoScope}`,
    })
  }

  for (const section of sectionKeys()) {
    const needles = expected.mustContain?.[section] ?? []
    for (const needle of needles) {
      checks.push({
        name: `${section} contains "${needle}"`,
        pass: sectionContains(output[section], needle),
      })
    }
  }

  for (const section of expected.mustBeEmpty ?? []) {
    checks.push({
      name: `${section} is empty`,
      pass: output[section].length === 0,
      detail: `${output[section].length} item(s)`,
    })
  }

  const quality = gradeExtractionQuality({
    sourceText: testCase.payload.description,
    sections: output,
    classifyConfidence: output.confidence,
    deadlineKnown: Boolean(testCase.payload.deadline),
  })
  const actualBlocked = !quality.canSendDigest
  checks.push({
    name: 'digest gate',
    pass: actualBlocked === expected.shouldBlockDigest,
    detail: actualBlocked
      ? `blocked (${quality.issues.map((issue) => issue.code).join(', ')})`
      : 'sendable',
  })

  return checks
}

function sectionKeys(): Array<'conditions' | 'calendrier' | 'dossier'> {
  return ['conditions', 'calendrier', 'dossier']
}

function sectionContains(items: readonly string[], needle: string): boolean {
  const haystack = normalizeText(items.join('\n'))
  return haystack.includes(normalizeText(needle))
}

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
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
