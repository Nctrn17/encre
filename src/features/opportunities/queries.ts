import { createPublicClient } from '@/lib/supabase/server'
import type { Opportunity } from '@/lib/supabase/types'

export interface OpportunityFilters {
  disciplines?: string[]
  /**
   * Filtre sur les tags fins (disciplines_tags) ajoutés par le pilote scénariste :
   * 'scenario', 'documentaire', 'court-metrage', 'long-metrage', 'serie',
   * 'animation', 'sonore', 'web', etc. Plus granulaire que `disciplines` qui
   * se limite à la taxonomie macro (cinema / audiovisuel / litterature…).
   * Overlap logique : renvoie les opps dont au moins un tag matche.
   */
  disciplinesTagsAny?: string[]
  /**
   * Liste de tags à EXCLURE - typiquement ['non-scenariste'] sur la
   * page publique V1 pour cacher les aides producteurs/distributeurs/
   * exploitants/techniques que le matcher remonte sinon (CNC industriel).
   */
  disciplinesTagsExclude?: string[]
  horsReseauOnly?: boolean
  /**
   * Filtre auteurs littéraires (migration 0019) : ne renvoie que les opps
   * dont `requires_editor = false` (candidatables sans maison d'édition
   * attachée). Distinct de `horsReseauOnly` qui agrège producteur+éditeur+agent.
   */
  withoutEditor?: boolean
  types?: string[]
  regionCodes?: string[]
  /**
   * Filtre par `emitter_slug` (slug canonique de l'émetteur). Utilisé par les
   * pages détail `/sources/[slug]` pour lister toutes les aides d'un émetteur.
   */
  emitterSlugs?: string[]
  minAmount?: number | null
  maxDaysUntilDeadline?: number | null
  includeExpired?: boolean
  search?: string | null
  limit?: number
  offset?: number
}

export async function listOpportunities(
  filters: OpportunityFilters = {},
): Promise<{ items: Opportunity[]; total: number }> {
  const supabase = createPublicClient()
  const limit = filters.limit ?? 20
  const offset = filters.offset ?? 0

  let query = supabase
    .from('opportunities')
    .select('*', { count: 'exact' })
    .eq('is_published', true)
    .eq('human_review', false)

  if (!filters.includeExpired) {
    query = query.or('deadline.is.null,deadline.gt.' + new Date().toISOString())
  }

  if (filters.disciplines?.length) {
    query = query.overlaps('disciplines', filters.disciplines)
  }
  if (filters.disciplinesTagsAny?.length) {
    query = query.overlaps('disciplines_tags', filters.disciplinesTagsAny)
  }
  if (filters.disciplinesTagsExclude?.length) {
    // PostgREST : not.ov(...) = NOT (disciplines_tags && ARRAY[...])
    // Renvoie uniquement les opps qui n'ont AUCUN des tags exclus.
    query = query.not(
      'disciplines_tags',
      'ov',
      `{${filters.disciplinesTagsExclude.join(',')}}`,
    )
  }
  if (filters.horsReseauOnly) {
    query = query.eq('hors_reseau_friendly', true)
  }
  if (filters.withoutEditor) {
    query = query.eq('requires_editor', false)
  }
  if (filters.types?.length) {
    query = query.in('type', filters.types as never[])
  }
  if (filters.regionCodes?.length) {
    query = query.in('region_code', filters.regionCodes)
  }
  if (filters.emitterSlugs?.length) {
    query = query.in('emitter_slug', filters.emitterSlugs)
  }
  if (typeof filters.minAmount === 'number') {
    query = query.gte('amount_max', filters.minAmount)
  }
  if (filters.search?.trim()) {
    // Recherche tolérante : RPC search_opportunities_fuzzy combine FTS,
    // ILIKE sur colonne unaccent, et similarité trigramme. Renvoie
    // les ids matchants ; on les injecte ensuite via .in('id', ...) pour
    // conserver les autres filtres et la pagination.
    const fuzzyIds = await fetchFuzzyMatchIds(supabase, filters.search.trim())
    if (fuzzyIds.length === 0) {
      return { items: [], total: 0 }
    }
    query = query.in('id', fuzzyIds)
  }

  query = query.order('deadline', { ascending: true, nullsFirst: false }).range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) {
    console.error('[listOpportunities]', error.message)
    return { items: [], total: 0 }
  }
  return { items: (data ?? []) as Opportunity[], total: count ?? 0 }
}

/**
 * Strip diacritics + lowercase, pour aligner la query côté JS sur la
 * colonne `searchable_text` (générée via immutable_unaccent + lower).
 * `é` → `e`, `Ê` → `e`, etc.
 */
function normalizeSearch(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

/**
 * Appelle la RPC fuzzy et renvoie les ids triés par score décroissant.
 * Tolère accents, sous-chaînes, et fautes de frappe (similarité trigramme).
 * Plafond 200 ids pour éviter une URL .in() trop longue avec PostgREST.
 */
async function fetchFuzzyMatchIds(
  supabase: ReturnType<typeof createPublicClient>,
  rawQuery: string,
): Promise<string[]> {
  const q = normalizeSearch(rawQuery)
  if (!q) return []

  const result = await supabase.rpc('search_opportunities_fuzzy', { q })
  if (result.error) {
    console.error('[fetchFuzzyMatchIds]', result.error.message)
    return []
  }
  const rows = (result.data ?? []) as unknown as Array<{ id: string; score: number }>
  return rows
    .sort((a, b) => b.score - a.score)
    .slice(0, 200)
    .map((r) => r.id)
}

export async function getOpportunityBySlug(slug: string): Promise<Opportunity | null> {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .eq('human_review', false)
    .maybeSingle()
  if (error) {
    console.error('[getOpportunityBySlug]', error.message)
    return null
  }
  return (data as Opportunity) ?? null
}

export interface ListInPeriodeFilters {
  /** Restreint aux opps dont au moins une discipline matche (ex: ['cinema']). */
  disciplines?: string[]
  /** Inclure les opps sans deadline (ex: candidatures spontanées) - exclu par défaut. */
  includeNullDeadline?: boolean
}

/**
 * Liste les opps dont la `deadline` tombe dans l'intervalle `[start, end]` UTC.
 * Utilisé par les routes `/calendrier/[periode]`, `/api/calendar.ics`, `/api/feed.xml`.
 *
 * Tri chronologique ascendant. Pas de pagination (la borne période est déjà
 * un filtre fort : ~10-100 items max, jamais 5000).
 */
export async function listOpportunitiesInPeriode(
  start: Date,
  end: Date,
  filters: ListInPeriodeFilters = {},
): Promise<Opportunity[]> {
  const supabase = createPublicClient()

  let query = supabase
    .from('opportunities')
    .select('*')
    .eq('is_published', true)
    .eq('human_review', false)
    .gte('deadline', start.toISOString())
    .lte('deadline', end.toISOString())
    .order('deadline', { ascending: true })
    .limit(500)

  if (filters.disciplines?.length) {
    query = query.overlaps('disciplines', filters.disciplines)
  }

  const { data, error } = await query
  if (error) {
    console.error('[listOpportunitiesInPeriode]', error.message)
    return []
  }

  let items = (data ?? []) as Opportunity[]
  if (filters.includeNullDeadline) {
    const { data: nullData } = await supabase
      .from('opportunities')
      .select('*')
      .eq('is_published', true)
      .eq('human_review', false)
      .is('deadline', null)
      .limit(100)
    items = items.concat((nullData ?? []) as Opportunity[])
  }

  return items
}

/**
 * Compte le nombre de deadlines par mois pour une année donnée. Utilisé par
 * la minimap annuelle de `/calendrier/[annee]` et la nav "mois précédent /
 * suivant" sur la page mois. Une seule requête, agrégation en mémoire.
 */
export async function countDeadlinesByMonth(
  year: number,
): Promise<Record<string, number>> {
  const supabase = createPublicClient()
  const start = new Date(Date.UTC(year, 0, 1)).toISOString()
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)).toISOString()

  const { data, error } = await supabase
    .from('opportunities')
    .select('deadline')
    .eq('is_published', true)
    .eq('human_review', false)
    .gte('deadline', start)
    .lte('deadline', end)
    .limit(5000)

  if (error) {
    console.error('[countDeadlinesByMonth]', error.message)
    return {}
  }

  const counts: Record<string, number> = {}
  for (const row of (data ?? []) as Array<{ deadline: string | null }>) {
    if (!row.deadline) continue
    const d = new Date(row.deadline)
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

export async function listOpportunitySlugsForSitemap(): Promise<string[]> {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('opportunities')
    .select('slug')
    .eq('is_published', true)
    .eq('human_review', false)
    .limit(5000)
  return (data ?? []).map((r: { slug: string }) => r.slug)
}

export interface SitemapOpportunityEntry {
  slug: string
  updatedAt: string | null
}

export async function listOpportunityEntriesForSitemap(): Promise<SitemapOpportunityEntry[]> {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('opportunities')
    .select('slug, updated_at')
    .eq('is_published', true)
    .eq('human_review', false)
    .limit(5000)
  return (data ?? []).map((r: { slug: string; updated_at: string | null }) => ({
    slug: r.slug,
    updatedAt: r.updated_at,
  }))
}
