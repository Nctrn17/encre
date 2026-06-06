'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin, RestrictedAccessError } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/server'
import { validateLineLengths } from './validation'

/**
 * Server action : sauvegarde une édition curation pour une opp.
 *
 * Auth : requireAdmin garde l'accès. Une non-admin → throw, le client
 * voit une erreur générique.
 *
 * Validation : zod parse strict côté serveur. On NE FAIT PAS confiance
 * au payload. Les arrays sont normalisés (trim, drop empty, dedup).
 */
// Schéma structurel (uuid, enums, booleans, comptes). La longueur des lignes est
// validée à part (validateLineLengths) pour un message actionnable plutôt que le
// message Zod opaque « Too big: expected string to have <=280 characters ».
const InputSchema = z.object({
  id: z.string().uuid(),
  conditions: z.array(z.string()).max(20),
  calendrier: z.array(z.string()).max(20),
  dossier: z.array(z.string()).max(20),
  next_edition_status: z.enum(['open', 'awaiting_details']).nullable(),
  is_published: z.boolean(),
})

const QuickActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['mark_ok', 'awaiting_details', 'unpublish', 'reject']),
})

export type CurationSaveInput = z.input<typeof InputSchema>
export type CurationQuickActionInput = z.input<typeof QuickActionSchema>

function cleanArray(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter((s) => s.length > 0))]
}

export interface CurationSaveResult {
  ok: boolean
  error?: string
}

export async function saveCurationOpp(
  raw: CurationSaveInput,
): Promise<CurationSaveResult> {
  try {
    await requireAdmin()
  } catch (e) {
    if (e instanceof RestrictedAccessError) return { ok: false, error: 'forbidden' }
    throw e
  }

  const parsed = InputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ').slice(0, 200) }
  }
  const input = parsed.data

  // Validation de longueur séparée → message actionnable (champ · ligne · taille).
  const lengthError = validateLineLengths(input)
  if (lengthError) {
    return { ok: false, error: lengthError }
  }

  const sb = createServiceClient()
  const { error } = await sb
    .from('opportunities')
    .update({
      conditions: cleanArray(input.conditions),
      calendrier: cleanArray(input.calendrier),
      dossier: cleanArray(input.dossier),
      next_edition_status: input.next_edition_status,
      is_published: input.is_published,
      updated_at: new Date().toISOString(),
      // Sauvegarder depuis l'admin vaut validation humaine.
      human_review: false,
      // Marque la fiche comme traitée → sort des files molles de la curation.
      curated_at: new Date().toISOString(),
    })
    .eq('id', input.id)

  if (error) {
    console.error('[saveCurationOpp]', error)
    return { ok: false, error: error.message }
  }

  revalidatePath('/admin/curation')
  // L'opp publique change aussi
  revalidatePath('/aides')
  return { ok: true }
}

export async function applyCurationQuickAction(
  raw: CurationQuickActionInput,
): Promise<CurationSaveResult> {
  try {
    await requireAdmin()
  } catch (e) {
    if (e instanceof RestrictedAccessError) return { ok: false, error: 'forbidden' }
    throw e
  }

  const parsed = QuickActionSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ').slice(0, 200) }
  }

  const update = buildQuickActionUpdate(parsed.data.action)
  const sb = createServiceClient()
  const { error } = await sb
    .from('opportunities')
    .update(update)
    .eq('id', parsed.data.id)

  if (error) {
    console.error('[applyCurationQuickAction]', error)
    return { ok: false, error: error.message }
  }

  revalidatePath('/admin/curation')
  revalidatePath('/aides')
  return { ok: true }
}

function buildQuickActionUpdate(
  action: CurationQuickActionInput['action'],
): Record<string, unknown> {
  const base = {
    human_review: false,
    updated_at: new Date().toISOString(),
    // Toute action rapide vaut revue humaine → sort des files molles.
    curated_at: new Date().toISOString(),
  }

  if (action === 'awaiting_details') {
    // Awaiting = prochaine édition connue mais sans dates => HORS registre.
    // is_published=false (sinon contradiction interdite par la contrainte DB
    // opportunities_published_not_awaiting, migration 0041).
    return {
      ...base,
      is_published: false,
      next_edition_status: 'awaiting_details',
    }
  }

  if (action === 'unpublish') {
    return {
      ...base,
      is_published: false,
    }
  }

  // Rejet = pierre tombale (migration 0040). Distinct de `unpublish` :
  // l'annonce ne pourra plus jamais être ressuscitée par le scrape (le
  // pipeline court-circuite le revival sur `rejected=true`). Action terminale.
  if (action === 'reject') {
    return {
      ...base,
      is_published: false,
      rejected: true,
    }
  }

  return base
}
