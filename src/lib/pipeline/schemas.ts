/**
 * Schemas Zod partagés pipeline d'ingestion.
 * Utilisés par :
 *   - scrapers/ (construction des RawItem)
 *   - src/app/api/ (validation API routes)
 *   - src/lib/pipeline/normalize.ts (validation sortie)
 *   - src/lib/pipeline/classify.ts (validation réponse Gemini)
 */

import { z } from 'zod'
import { DISCIPLINE_SLUGS, AUDIENCE_SLUGS, OPPORTUNITY_TYPES, GEO_SCOPES } from '@/lib/discipline-taxonomy'

// ==========================================================================
// RawItem - payload brut pushé par les scrapers dans raw_items
// ==========================================================================

export const RawItemPayloadSchema = z.object({
  // Champs bruts, format libre selon source
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  emitter: z.string().optional().nullable(),
  url: z.string().url(),
  deadline: z.string().optional().nullable(), // ISO ou texte libre
  amount_text: z.string().optional().nullable(),
  discipline_hints: z.array(z.string()).optional(),
  region_hint: z.string().optional().nullable(),
  raw_html: z.string().optional().nullable(),
  raw_json: z.unknown().optional(),
})

export type RawItemPayload = z.infer<typeof RawItemPayloadSchema>

const RawItemInputSchema = z.object({
  source_slug: z.string().min(1),
  external_id: z.string().min(1),
  payload: RawItemPayloadSchema,
})

type RawItemInput = z.infer<typeof RawItemInputSchema>

// ==========================================================================
// Opportunity - schéma canonique (miroir de la table opportunities)
// ==========================================================================

export const OpportunityDraftSchema = z.object({
  slug: z.string().min(3).max(220),
  title: z.string().min(3).max(300),
  description: z.string().max(10000).optional().nullable(),
  emitter: z.string().min(1).max(200),
  emitter_slug: z.string().min(1).max(120),
  type: z.enum(OPPORTUNITY_TYPES),
  disciplines: z.array(z.enum(DISCIPLINE_SLUGS)).default([]),
  audience: z.array(z.enum(AUDIENCE_SLUGS)).default([]),
  geo_scope: z.enum(GEO_SCOPES),
  region_code: z.string().max(10).optional().nullable(),
  amount_min: z.number().int().nonnegative().optional().nullable(),
  amount_max: z.number().int().nonnegative().optional().nullable(),
  currency: z.string().length(3).default('EUR'),
  deadline: z.string().datetime({ offset: true }).optional().nullable(),
  source_url: z.string().url(),
  mirror_urls: z.array(z.string().url()).default([]),
  fingerprint: z.string().length(64),
  classify_confidence: z.number().min(0).max(1).optional().nullable(),
  human_review: z.boolean().default(false),
  // ── Champs pilote scénariste (migration 0011) ─────────────────────────
  hors_reseau_friendly: z.boolean().default(false),
  min_films_produits: z.number().int().min(0).max(10).optional().nullable(),
  requires_producer: z.boolean().default(false),
  age_max: z.number().int().min(16).max(99).optional().nullable(),
  disciplines_tags: z.array(z.string()).default([]),
  // ── Sections structurées de la fiche détail (migration 0018) ──────────
  // Listes courtes, items extraits littéralement de la source officielle.
  // Empty array si la section n'est pas mentionnée. Pas d'invention LLM.
  conditions: z.array(z.string().min(1).max(280)).max(12).default([]),
  calendrier: z.array(z.string().min(1).max(200)).max(10).default([]),
  dossier: z.array(z.string().min(1).max(280)).max(15).default([]),
  // ── Filtre auteurs littéraires (migration 0019) ───────────────────────
  // TRUE si la source précise qu'une maison d'édition doit être attachée
  // au dossier de candidature. Default false (cf. doc migration).
  requires_editor: z.boolean().default(false),
  eligibility_profile: z.record(z.string(), z.unknown()).default({}),
  eligibility_summary: z.string().max(600).optional().nullable(),
  eligibility_confidence: z.enum(['explicit', 'inferred', 'unknown']).default('unknown'),
})

export type OpportunityDraft = z.infer<typeof OpportunityDraftSchema>

// ==========================================================================
// Classification IA : sortie structurée forcée par function calling (tool use)
// ==========================================================================

export const ClassificationOutputSchema = z.object({
  type: z.enum(OPPORTUNITY_TYPES),
  disciplines: z.array(z.enum(DISCIPLINE_SLUGS)).min(1).max(5),
  audience: z.array(z.enum(AUDIENCE_SLUGS)).min(1).max(4),
  geo_scope: z.enum(GEO_SCOPES),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(500).optional(),
  // ── Sections structurées (migration 0018) ────────────────────────────
  // Strict : extraits littéralement du texte source. Empty si non présent.
  conditions: z.array(z.string().min(1).max(280)).max(12).default([]),
  calendrier: z.array(z.string().min(1).max(200)).max(10).default([]),
  dossier: z.array(z.string().min(1).max(280)).max(15).default([]),
})

export type ClassificationOutput = z.infer<typeof ClassificationOutputSchema>

// ==========================================================================
// Waitlist signup
// ==========================================================================

export const WaitlistSignupSchema = z.object({
  email: z.string().email().toLowerCase(),
  disciplines: z.array(z.enum(DISCIPLINE_SLUGS)).default([]),
  region_codes: z.array(z.string()).default([]),
  source: z.string().max(100).optional(),
})

export type WaitlistSignup = z.infer<typeof WaitlistSignupSchema>

// ==========================================================================
// Alert profile (CRUD)
// ==========================================================================

export const AlertProfileInputSchema = z.object({
  name: z.string().min(1).max(100),
  disciplines: z.array(z.enum(DISCIPLINE_SLUGS)).default([]),
  discipline_tags: z.array(z.string().min(1).max(60)).default([]),
  audience: z.array(z.enum(AUDIENCE_SLUGS)).default([]),
  types: z.array(z.enum(OPPORTUNITY_TYPES)).default([]),
  geo_scopes: z.array(z.enum(GEO_SCOPES)).default([]),
  region_codes: z.array(z.string()).default([]),
  min_amount: z.number().int().nonnegative().optional().nullable(),
  frequency: z.enum(['daily', 'weekly', 'deadline_only']).default('weekly'),
  send_weekday: z.number().int().min(1).max(7).default(1),
  has_producer: z.boolean().optional().nullable(),
  films_produced_count: z.number().int().min(0).max(20).optional().nullable(),
  age_range: z.enum(['under_30', '30_45', 'over_45', 'not_specified']).optional().nullable(),
  residency_context: z.enum(['france_metropole', 'outremer', 'pays_du_sud', 'international', 'not_specified']).default('france_metropole'),
  nationality_context: z.enum(['france', 'foreign', 'pays_du_sud', 'not_specified']).default('france'),
  gender_context: z.enum(['woman', 'gender_minority', 'woman_or_gender_minority', 'not_specified']).default('not_specified'),
  professional_status_tags: z.array(z.string().min(1).max(60)).default([]),
  hors_reseau_only: z.boolean().default(true),
  candidate_mode: z.enum(['strict', 'balanced', 'wide']).default('balanced'),
  is_active: z.boolean().default(true),
})

export type AlertProfileInput = z.infer<typeof AlertProfileInputSchema>
