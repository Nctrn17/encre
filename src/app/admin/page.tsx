import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function AdminDashboard() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/connexion?next=/admin')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if ((profile as { role?: string } | null)?.role !== 'admin') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="font-serif mb-3">Accès restreint</h1>
        <p className="text-muted">Cette page est réservée aux administrateurs.</p>
      </div>
    )
  }

  const service = createServiceClient()

  const [sourcesResult, pendingCount, errorCount, opportunitiesCount, humanReviewCount] =
    await Promise.all([
      service.from('sources').select('*').order('slug'),
      service.from('raw_items').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      service.from('raw_items').select('id', { count: 'exact', head: true }).eq('status', 'error'),
      service
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('is_published', true)
        .eq('human_review', false),
      service.from('opportunities').select('id', { count: 'exact', head: true }).eq('human_review', true),
    ])

  const sources = (sourcesResult.data ?? []) as Array<{
    id: string
    slug: string
    name: string
    kind: string
    is_active: boolean
    last_run_at: string | null
    last_run_metrics: { items_found?: number; inserted?: number; skipped?: number } | null
  }>

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="font-serif mb-8">Admin Dashboard</h1>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <Stat label="Opportunités publiées" value={opportunitiesCount.count ?? 0} />
        <Stat label="Raw items en attente" value={pendingCount.count ?? 0} />
        <Stat label="Raw items en erreur" value={errorCount.count ?? 0} variant="danger" />
        <Stat label="Opps à revue humaine" value={humanReviewCount.count ?? 0} variant="warning" />
      </section>

      <section className="mb-10">
        <h2 className="font-serif mb-4">Sources</h2>
        <div className="rounded-[var(--radius-lg)] border border-subtle overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated">
              <tr>
                <th className="text-left p-3 font-medium">Slug</th>
                <th className="text-left p-3 font-medium">Nom</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Actif</th>
                <th className="text-left p-3 font-medium">Dernier run</th>
                <th className="text-left p-3 font-medium">Items trouvés</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-t border-subtle">
                  <td className="p-3 font-mono text-xs">{s.slug}</td>
                  <td className="p-3">{s.name}</td>
                  <td className="p-3"><code className="text-xs">{s.kind}</code></td>
                  <td className="p-3">
                    <span className={`inline-block w-2 h-2 rounded-full ${s.is_active ? 'bg-success' : 'bg-muted'}`}></span>
                  </td>
                  <td className="p-3 text-muted">
                    {s.last_run_at
                      ? new Date(s.last_run_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
                      : '—'}
                  </td>
                  <td className="p-3">{s.last_run_metrics?.items_found ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-serif mb-4">Actions</h2>
        <div className="mb-4 flex flex-wrap gap-3">
          <Link
            href="/admin/curation"
            className="rounded-[var(--radius)] border border-subtle px-4 py-2 text-sm hover:bg-subtle"
          >
            Ouvrir la curation
          </Link>
          <Link
            href="/admin/matching"
            className="rounded-[var(--radius)] border border-subtle px-4 py-2 text-sm hover:bg-subtle"
          >
            Debug matching
          </Link>
          <Link
            href="/admin/recherches"
            className="rounded-[var(--radius)] border border-subtle px-4 py-2 text-sm hover:bg-subtle"
          >
            Recherches
          </Link>
        </div>
        <form
          action={async () => {
            'use server'
            // trigger manuel pipeline - voir /api/cron/process-raw
          }}
        >
          <p className="text-sm text-muted">
            Triggers manuels à connecter aux routes <code>/api/cron/*</code> (work in progress).
          </p>
        </form>
      </section>
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
  variant?: 'danger' | 'warning'
}) {
  const accent =
    variant === 'danger'
      ? 'text-danger'
      : variant === 'warning'
      ? 'text-warning'
      : 'text-accent'
  return (
    <div className="rounded-[var(--radius-lg)] border border-subtle p-4 bg-surface">
      <div className="text-xs uppercase tracking-wider text-muted mb-1">{label}</div>
      <div className={`font-serif text-3xl font-semibold ${accent}`}>{value}</div>
    </div>
  )
}
