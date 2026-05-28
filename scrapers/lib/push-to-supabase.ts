import { createClient } from '@supabase/supabase-js'
import type { RawScrapedItem } from './types'

/**
 * Pousse les items scrapés dans raw_items via service_role.
 * Gère l'UPSERT sur la contrainte (source_id, external_id).
 */
export async function pushToSupabase(
  sourceSlug: string,
  items: RawScrapedItem[],
): Promise<{ inserted: number; skipped: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase credentials')
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Récupérer le source_id
  const { data: source, error: sourceError } = await supabase
    .from('sources')
    .select('id')
    .eq('slug', sourceSlug)
    .single()

  if (sourceError || !source) {
    throw new Error(`Source not found: ${sourceSlug}`)
  }

  const sourceId = (source as { id: string }).id
  let inserted = 0
  let skipped = 0

  for (const item of items) {
    const { error } = await supabase
      .from('raw_items')
      .upsert(
        {
          source_id: sourceId,
          external_id: item.external_id,
          payload: item.payload,
          status: 'pending',
        },
        { onConflict: 'source_id,external_id', ignoreDuplicates: true },
      )

    if (error) {
      console.warn(`[push] Error for ${item.external_id}:`, error.message)
      skipped++
    } else {
      inserted++
    }
  }

  // Update last_run
  await supabase
    .from('sources')
    .update({
      last_run_at: new Date().toISOString(),
      last_run_metrics: { items_found: items.length, inserted, skipped },
    })
    .eq('id', sourceId)

  return { inserted, skipped }
}
