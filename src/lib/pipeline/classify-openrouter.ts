/**
 * Classification d'une opportunité via OpenRouter (OpenAI-compatible API).
 *
 * Utilisé comme 3ᵉ étage de cascade dans `scripts/enrich-from-page.ts`
 * quand Gemini Flash + Gemma 4 31B sont tous deux KO (500/503/429).
 *
 * Modèle par défaut : `deepseek/deepseek-chat-v3.1` — function calling
 * natif, qualité comparable Gemini Flash, prix marginal (~$0.10 pour
 * un run complet enrich V1 de 32 opps).
 *
 * Réutilise le même `CLASSIFY_SYSTEM_PROMPT`, `CLASSIFY_FUNCTION_DECLARATION`
 * et `clampClassifyArgs` que la voie Gemini pour garantir une sortie
 * structurellement identique en aval (normalize, slug, DB writes).
 */

import {
  CLASSIFY_FUNCTION_DECLARATION,
  CLASSIFY_SYSTEM_PROMPT,
  clampClassifyArgs,
} from './classify'
import {
  ClassificationOutputSchema,
  type ClassificationOutput,
  type RawItemPayload,
} from './schemas'
import {
  detectCalendarPattern,
  applyContinuousFlowOverride,
  synthesizeFormatAFromProchaineList,
} from './calendar-pattern'
import { stripSuspectChars } from '../normalize/quality'
import { normalizeSectionList } from '@/lib/normalize/section-item'

export const DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-chat-v3.1'

export interface OpenRouterClassifyOptions {
  apiKey?: string
  model?: string
  fetchImpl?: typeof fetch
}

export async function classifyOpportunityOpenRouter(
  payload: RawItemPayload,
  emitterName: string,
  options: OpenRouterClassifyOptions = {},
): Promise<ClassificationOutput> {
  const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not configured')
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const model = options.model ?? DEFAULT_OPENROUTER_MODEL
  const dateFr = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const cleanedTitle = stripSuspectChars(payload.title).text
  const descStrip = payload.description ? stripSuspectChars(payload.description) : null
  if (descStrip && descStrip.removedCount > 0) {
    console.warn(
      `  [classify-or] strip input : ${descStrip.removedCount} chars retirés ` +
        `(${JSON.stringify(descStrip.removedByKind)})`,
    )
  }
  const cleanedDesc = descStrip?.text ?? null

  const userContent = [
    `Date du jour : ${dateFr}`,
    `Émetteur : ${emitterName}`,
    `Titre : ${cleanedTitle}`,
    cleanedDesc ? `Description : ${cleanedDesc.slice(0, 25000)}` : null,
    payload.region_hint ? `Indice géographique : ${payload.region_hint}` : null,
    payload.discipline_hints?.length
      ? `Indices disciplines : ${payload.discipline_hints.join(', ')}`
      : null,
    payload.amount_text ? `Montant : ${payload.amount_text}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  // Format OpenAI-compatible : `tools` + `tool_choice`. OpenRouter route
  // vers DeepSeek qui supporte le function calling natif.
  const body = {
    model,
    messages: [
      { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: CLASSIFY_FUNCTION_DECLARATION.name,
          description: CLASSIFY_FUNCTION_DECLARATION.description,
          parameters: CLASSIFY_FUNCTION_DECLARATION.parameters,
        },
      },
    ],
    tool_choice: {
      type: 'function',
      function: { name: CLASSIFY_FUNCTION_DECLARATION.name },
    },
    temperature: 0,
    max_tokens: 2048,
  }

  const response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      // Optional headers OpenRouter recommande pour analytics
      'HTTP-Referer': 'https://encre.io',
      'X-Title': 'Encre Enrichment Pipeline',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `OpenRouter API error ${response.status} (${model}): ${text.slice(0, 300)}`,
    )
  }

  const json = (await response.json()) as {
    choices?: Array<{
      message?: {
        tool_calls?: Array<{
          function?: { name?: string; arguments?: string }
        }>
        content?: string
      }
      finish_reason?: string
    }>
  }

  const choice = json.choices?.[0]
  const toolCall = choice?.message?.tool_calls?.find(
    (tc) => tc.function?.name === CLASSIFY_FUNCTION_DECLARATION.name,
  )

  if (!toolCall?.function?.arguments) {
    const finish = choice?.finish_reason ?? 'unknown'
    const content = choice?.message?.content?.slice(0, 200) ?? ''
    throw new Error(
      `No tool_call "${CLASSIFY_FUNCTION_DECLARATION.name}" in OpenRouter response (${model}) — finish=${finish}${content ? ` content="${content}"` : ''}`,
    )
  }

  let parsedArgs: unknown
  try {
    parsedArgs = JSON.parse(toolCall.function.arguments)
  } catch (err) {
    throw new Error(
      `Invalid JSON in OpenRouter tool_call arguments (${model}): ${(err as Error).message}`,
    )
  }

  const clampedArgs = clampClassifyArgs(parsedArgs)
  const parsed = ClassificationOutputSchema.safeParse(clampedArgs)
  if (!parsed.success) {
    throw new Error(
      `Classification schema invalid (${model}): ${JSON.stringify(parsed.error.flatten())}`,
    )
  }

  // Post-process identique à Gemini : synthèse Format A + pattern continu.
  if (parsed.data.calendrier.length === 0) {
    const synthesized = synthesizeFormatAFromProchaineList(payload.description)
    if (synthesized) {
      parsed.data.calendrier = normalizeSectionList(synthesized, 'calendrier')
    }
  }

  const calendarPattern = detectCalendarPattern(
    payload.description,
    parsed.data.calendrier,
  )
  if (calendarPattern.pattern === 'continuous') {
    parsed.data.calendrier = applyContinuousFlowOverride(
      parsed.data.calendrier,
      calendarPattern.pattern,
    )
  }

  return parsed.data
}
