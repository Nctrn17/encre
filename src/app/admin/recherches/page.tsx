import Link from 'next/link'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin, RestrictedAccessError } from '@/lib/auth/require-admin'

export const metadata: Metadata = {
  title: 'Admin · Recherches',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

interface SearchQueryRow {
  id: string
  query: string
  normalized_query: string
  result_count: number
  filters: Record<string, unknown>
  page_path: string
  created_at: string
}

export default async function AdminSearchQueriesPage() {
  try {
    await requireAdmin('/admin/recherches')
  } catch (error) {
    if (error instanceof RestrictedAccessError) {
      return <AdminAccessDenied />
    }
    throw error
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('search_queries')
    .select('id,query,normalized_query,result_count,filters,page_path,created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    throw error
  }

  const rows = ((data ?? []) as unknown as SearchQueryRow[])
  const topQueries = buildTopQueries(rows)
  const noResultCount = rows.filter((row) => row.result_count === 0).length

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8 flex items-start justify-between gap-6">
        <div>
          <Link href="/admin" className="text-sm text-muted hover:text-accent">
            ← Admin
          </Link>
          <h1 className="font-serif mt-3 mb-2">Recherches</h1>
          <p className="text-sm text-muted max-w-2xl">
            Requêtes anonymes saisies sur /aides. Aucun identifiant utilisateur,
            cookie, adresse IP ou user-agent n'est stocké.
          </p>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        <Stat label="Requêtes récentes" value={rows.length} />
        <Stat label="Sans résultat" value={noResultCount} variant="warning" />
        <Stat label="Requêtes uniques" value={topQueries.length} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-8">
        <div>
          <h2 className="font-serif mb-4">Top requêtes</h2>
          <div className="rounded-[var(--radius-lg)] border border-subtle overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-elevated">
                <tr>
                  <th className="text-left p-3 font-medium">Requête</th>
                  <th className="text-right p-3 font-medium">Nb</th>
                  <th className="text-right p-3 font-medium">0</th>
                </tr>
              </thead>
              <tbody>
                {topQueries.slice(0, 20).map((row) => (
                  <tr key={row.normalizedQuery} className="border-t border-subtle">
                    <td className="p-3">{row.label}</td>
                    <td className="p-3 text-right font-mono text-xs">{row.count}</td>
                    <td className="p-3 text-right font-mono text-xs">{row.zeroResultCount}</td>
                  </tr>
                ))}
                {topQueries.length === 0 && (
                  <tr>
                    <td className="p-4 text-sm text-muted" colSpan={3}>
                      Aucune recherche enregistrée.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="font-serif mb-4">Dernières recherches</h2>
          <div className="rounded-[var(--radius-lg)] border border-subtle overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-elevated">
                <tr>
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Requête</th>
                  <th className="text-right p-3 font-medium">Résultats</th>
                  <th className="text-left p-3 font-medium">Filtres</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 80).map((row) => (
                  <tr key={row.id} className="border-t border-subtle align-top">
                    <td className="p-3 text-muted whitespace-nowrap">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="p-3 font-medium">{row.query}</td>
                    <td className="p-3 text-right font-mono text-xs">
                      {row.result_count}
                    </td>
                    <td className="p-3 text-xs text-muted">
                      {formatFilters(row.filters)}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="p-4 text-sm text-muted" colSpan={4}>
                      Aucune recherche enregistrée.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}

function buildTopQueries(rows: SearchQueryRow[]) {
  const byQuery = new Map<
    string,
    { label: string; normalizedQuery: string; count: number; zeroResultCount: number }
  >()

  for (const row of rows) {
    const current =
      byQuery.get(row.normalized_query) ??
      {
        label: row.query,
        normalizedQuery: row.normalized_query,
        count: 0,
        zeroResultCount: 0,
      }
    current.count += 1
    if (row.result_count === 0) current.zeroResultCount += 1
    byQuery.set(row.normalized_query, current)
  }

  return [...byQuery.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return b.zeroResultCount - a.zeroResultCount
  })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function formatFilters(filters: Record<string, unknown>): string {
  const entries = Object.entries(filters).filter(([, value]) => {
    if (Array.isArray(value)) return value.length > 0
    return value !== null && value !== undefined && value !== ''
  })
  if (entries.length === 0) return 'Aucun'

  return entries
    .map(([key, value]) => {
      const label = Array.isArray(value) ? value.join(', ') : String(value)
      return `${key}: ${label}`
    })
    .join(' · ')
}

function AdminAccessDenied() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-20 text-center">
      <h1 className="font-serif mb-3">Accès restreint</h1>
      <p className="text-muted">Cette page est réservée aux administrateurs.</p>
    </div>
  )
}

function Stat({
  label,
  value,
  variant,
}: {
  label: string
  value: number
  variant?: 'warning'
}) {
  const accent = variant === 'warning' ? 'text-warning' : 'text-accent'
  return (
    <div className="rounded-[var(--radius-lg)] border border-subtle p-4 bg-surface">
      <div className="text-xs uppercase tracking-wider text-muted mb-1">{label}</div>
      <div className={`font-serif text-3xl font-semibold ${accent}`}>{value}</div>
    </div>
  )
}
