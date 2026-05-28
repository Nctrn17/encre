import { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/types'

const MAX_QUERY_LENGTH = 160

export interface SearchLogInput {
  query: string | null | undefined
  resultCount: number
  filters: Record<string, unknown>
  pagePath?: string
}

export async function logSearchQuery({
  query,
  resultCount,
  filters,
  pagePath = '/aides',
}: SearchLogInput): Promise<void> {
  const trimmed = query?.trim()
  if (!trimmed) return

  const safeQuery = trimmed.slice(0, MAX_QUERY_LENGTH)
  const normalizedQuery = normalizeSearchLogQuery(safeQuery)
  if (!normalizedQuery) return

  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from('search_queries').insert({
      query: safeQuery,
      normalized_query: normalizedQuery,
      result_count: Math.max(0, Math.trunc(resultCount)),
      filters: sanitizeFilters(filters),
      page_path: pagePath,
    })
    if (error) {
      console.error('[logSearchQuery]', error.message)
    }
  } catch (error) {
    console.error(
      '[logSearchQuery]',
      error instanceof Error ? error.message : String(error),
    )
  }
}

function normalizeSearchLogQuery(query: string): string {
  return query
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitizeFilters(filters: Record<string, unknown>): Record<string, Json> {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => {
      if (value === null || value === undefined) return false
      if (Array.isArray(value)) return value.length > 0
      if (typeof value === 'string') return value.trim() !== ''
      return true
    }).map(([key, value]) => [key, toJsonValue(value)]),
  ) as Record<string, Json>
}

function toJsonValue(value: unknown): Json {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string' && item.trim() !== '')
      .map((item) => (item as string).trim())
  }
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return value
  return String(value)
}
