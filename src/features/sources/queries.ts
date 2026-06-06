import { createPublicClient } from '@/lib/supabase/server'

/**
 * Encre · queries sources.
 *
 * Sources = les émetteurs publics et privés que nous suivons (DRAC, CNC, CNL,
 * SCAM, SACD, fondations, etc.). Chaque source a un slug canonique aligné sur
 * `opportunities.emitter_slug`. Les pages détail `/sources/[slug]` exploitent
 * ces helpers pour lister les opportunités d'un émetteur précis.
 */

export interface SourceDetail {
  id: string
  slug: string
  name: string
  kind: string
  config: Record<string, unknown> | null
  is_active: boolean
  last_run_at: string | null
}

export async function getSourceBySlug(slug: string): Promise<SourceDetail | null> {
  const supabase = createPublicClient()
  const { data } = await supabase
    // Vue publique (config purgée des clés sensibles, cf. migration 0037).
    .from('sources_public')
    .select('id, slug, name, kind, config, is_active, last_run_at')
    .eq('slug', slug)
    .eq('is_active', true)
    .neq('kind', 'manual')
    .maybeSingle()
  return (data as SourceDetail | null) ?? null
}

export async function listActiveSourceSlugs(): Promise<string[]> {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('sources_public')
    .select('slug')
    .eq('is_active', true)
    .neq('kind', 'manual')
  return (data ?? []).map((r: { slug: string }) => r.slug)
}
