'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { AlertProfileInputSchema, type AlertProfileInput } from '@/lib/pipeline/schemas'
import { listOpportunities } from '@/features/opportunities/queries'
import { buildPersonalizedOpportunityList } from '@/features/personalization/rank'
import type { AlertProfile } from './queries'

export interface AlertProfilePreview {
  total: number
  counts: {
    strong: number
    possible: number
    difficult: number
  }
  examples: Array<{
    id: string
    slug: string
    title: string
    emitter: string
    deadline: string | null
    level: 'strong' | 'possible' | 'difficult' | 'not_recommended'
    score: number
    decisionLabel: string
    reasons: string[]
    warnings: string[]
  }>
}

/**
 * Création d'un profil d'alerte depuis l'onboarding ou /mes-alertes.
 * Nécessite un user authentifié (RLS bloque sinon).
 */
export async function createAlertProfile(input: AlertProfileInput) {
  const parsed = AlertProfileInputSchema.safeParse(input)
  if (!parsed.success) {
    return { error: 'Données invalides', details: parsed.error.flatten() }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Connexion requise pour créer une alerte' }
  }

  const { data, error } = await supabase
    .from('alert_profiles')
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      disciplines: parsed.data.disciplines,
      discipline_tags: parsed.data.discipline_tags,
      audience: parsed.data.audience,
      types: parsed.data.types,
      geo_scopes: parsed.data.geo_scopes,
      region_codes: parsed.data.region_codes,
      min_amount: parsed.data.min_amount ?? null,
      frequency: parsed.data.frequency,
      send_weekday: parsed.data.send_weekday,
      has_producer: parsed.data.has_producer ?? null,
      films_produced_count: parsed.data.films_produced_count ?? null,
      age_range: parsed.data.age_range ?? null,
      residency_context: parsed.data.residency_context,
      nationality_context: parsed.data.nationality_context,
      gender_context: parsed.data.gender_context,
      professional_status_tags: parsed.data.professional_status_tags,
      hors_reseau_only: parsed.data.hors_reseau_only,
      candidate_mode: parsed.data.candidate_mode,
      is_active: parsed.data.is_active,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[createAlertProfile]', error.message)
    return { error: "Impossible de créer l'alerte. Réessayez." }
  }

  revalidatePath('/mes-alertes')
  return { ok: true, id: (data as { id: string }).id }
}

/**
 * Mise à jour d'un profil existant. Contrôle de propriété via RLS.
 */
export async function updateAlertProfile(id: string, input: AlertProfileInput) {
  const parsed = AlertProfileInputSchema.safeParse(input)
  if (!parsed.success) {
    return { error: 'Données invalides' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Connexion requise' }

  const { error } = await supabase
    .from('alert_profiles')
    .update({
      name: parsed.data.name,
      disciplines: parsed.data.disciplines,
      discipline_tags: parsed.data.discipline_tags,
      audience: parsed.data.audience,
      types: parsed.data.types,
      geo_scopes: parsed.data.geo_scopes,
      region_codes: parsed.data.region_codes,
      min_amount: parsed.data.min_amount ?? null,
      frequency: parsed.data.frequency,
      send_weekday: parsed.data.send_weekday,
      has_producer: parsed.data.has_producer ?? null,
      films_produced_count: parsed.data.films_produced_count ?? null,
      age_range: parsed.data.age_range ?? null,
      residency_context: parsed.data.residency_context,
      nationality_context: parsed.data.nationality_context,
      gender_context: parsed.data.gender_context,
      professional_status_tags: parsed.data.professional_status_tags,
      hors_reseau_only: parsed.data.hors_reseau_only,
      candidate_mode: parsed.data.candidate_mode,
      is_active: parsed.data.is_active,
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    console.error('[updateAlertProfile]', error.message)
    return { error: 'Mise à jour échouée' }
  }

  revalidatePath('/mes-alertes')
  revalidatePath(`/mes-alertes/${id}/modifier`)
  revalidatePath(`/mes-alertes/${id}/aides`)
  return { ok: true }
}

export async function previewAlertProfile(input: AlertProfileInput) {
  const parsed = AlertProfileInputSchema.safeParse(input)
  if (!parsed.success) {
    return { error: 'Données invalides' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Connexion requise' }

  const { items } = await listOpportunities({
    limit: 1000,
    includeExpired: false,
  })

  const profile = inputToTransientProfile(parsed.data, user.id)
  const ranked = buildPersonalizedOpportunityList(items, profile)

  const preview: AlertProfilePreview = {
    total: ranked.length,
    counts: {
      strong: ranked.filter((row) => row.reading.level === 'strong').length,
      possible: ranked.filter((row) => row.reading.level === 'possible').length,
      difficult: ranked.filter((row) => row.reading.level === 'difficult').length,
    },
    examples: ranked.slice(0, 3).map(({ opportunity, reading }) => ({
      id: opportunity.id,
      slug: opportunity.slug,
      title: opportunity.title,
      emitter: opportunity.emitter,
      deadline: opportunity.deadline,
      level: reading.level,
      score: reading.score,
      decisionLabel: reading.decisionLabel,
      reasons: reading.reasons,
      warnings: reading.warnings,
    })),
  }

  return { ok: true, preview }
}

/**
 * Suppression. RLS garantit que l'utilisateur ne peut supprimer que les siens.
 */
export async function deleteAlertProfile(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Connexion requise' }

  const { error } = await supabase
    .from('alert_profiles')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: 'Suppression échouée' }

  revalidatePath('/mes-alertes')
  return { ok: true }
}

/**
 * Toggle actif / inactif (pause rapide depuis la liste).
 */
export async function toggleAlertProfileActive(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Connexion requise' }

  const { data: current } = await supabase
    .from('alert_profiles')
    .select('is_active')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!current) return { error: 'Profil introuvable' }

  const { error } = await supabase
    .from('alert_profiles')
    .update({ is_active: !(current as { is_active: boolean }).is_active })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: 'Toggle échoué' }

  revalidatePath('/mes-alertes')
  return { ok: true, is_active: !(current as { is_active: boolean }).is_active }
}

/**
 * Onboarding : crée un profil par défaut ("Mes opportunités")
 * avec les critères choisis, puis redirige vers la liste filtrée.
 */
export async function completeOnboarding(input: AlertProfileInput) {
  const result = await createAlertProfile({
    ...input,
    name: input.name || 'Mes opportunités',
  })

  if ('error' in result) {
    return result
  }

  redirect('/mes-alertes?welcome=1')
}

function inputToTransientProfile(input: AlertProfileInput, userId: string): AlertProfile {
  return {
    id: 'preview',
    user_id: userId,
    name: input.name,
    disciplines: input.disciplines,
    discipline_tags: input.discipline_tags,
    audience: input.audience,
    types: input.types,
    geo_scopes: input.geo_scopes,
    region_codes: input.region_codes,
    min_amount: input.min_amount ?? null,
    frequency: input.frequency,
    send_weekday: input.send_weekday,
    has_producer: input.has_producer ?? null,
    films_produced_count: input.films_produced_count ?? null,
    age_range: input.age_range ?? null,
    residency_context: input.residency_context,
    nationality_context: input.nationality_context,
    gender_context: input.gender_context,
    professional_status_tags: input.professional_status_tags,
    hors_reseau_only: input.hors_reseau_only,
    candidate_mode: input.candidate_mode,
    is_active: input.is_active,
    last_sent_at: null,
    created_at: new Date().toISOString(),
  }
}
