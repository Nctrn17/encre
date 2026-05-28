/**
 * Helper /curate-paste : sauvegarde un patch validé en DB.
 *
 * Input : JSON sur stdin
 *   {
 *     id: 'uuid',
 *     conditions?: string[],
 *     calendrier?: string[],
 *     dossier?: string[],
 *     next_edition_status?: 'awaiting_details' | null,
 *     is_published?: boolean
 *   }
 *
 * Applique normalizeSectionList (grammaire éditoriale Encre) avant
 * l'update DB. Marque `human_review = true`. Update timestamp
 * `updated_at`.
 *
 * Output stdout : { ok: true, updated: [...fields] } ou { ok: false, error }
 */
import { config } from 'dotenv'
config({ path: '.env.local', override: true })
import { createClient } from '@supabase/supabase-js'
import { normalizeSectionList } from '../../src/lib/normalize/section-item'

interface PatchInput {
  id: string
  conditions?: string[]
  calendrier?: string[]
  dossier?: string[]
  next_edition_status?: 'awaiting_details' | null
  is_published?: boolean
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    process.stdin.on('data', (c) => { data += c.toString() })
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', reject)
  })
}

async function main() {
  const raw = await readStdin()
  let patch: PatchInput
  try {
    patch = JSON.parse(raw)
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: 'invalid JSON' }))
    process.exit(1)
  }

  if (!patch.id || typeof patch.id !== 'string') {
    console.log(JSON.stringify({ ok: false, error: 'missing id' }))
    process.exit(1)
  }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    human_review: true,
  }
  const updatedFields: string[] = []
  if (patch.conditions !== undefined) {
    update.conditions = normalizeSectionList(patch.conditions, 'conditions')
    updatedFields.push('conditions')
  }
  if (patch.calendrier !== undefined) {
    update.calendrier = normalizeSectionList(patch.calendrier, 'calendrier')
    updatedFields.push('calendrier')
  }
  if (patch.dossier !== undefined) {
    update.dossier = normalizeSectionList(patch.dossier, 'dossier')
    updatedFields.push('dossier')
  }
  if (patch.next_edition_status !== undefined) {
    update.next_edition_status = patch.next_edition_status
    updatedFields.push('next_edition_status')
  }
  if (patch.is_published !== undefined) {
    update.is_published = patch.is_published
    updatedFields.push('is_published')
  }

  if (updatedFields.length === 0) {
    console.log(JSON.stringify({ ok: false, error: 'no fields to update' }))
    process.exit(1)
  }

  const { error } = await sb.from('opportunities').update(update).eq('id', patch.id)
  if (error) {
    console.log(JSON.stringify({ ok: false, error: error.message }))
    process.exit(1)
  }

  console.log(JSON.stringify({ ok: true, updated: updatedFields }))
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: (e as Error).message }))
  process.exit(1)
})
