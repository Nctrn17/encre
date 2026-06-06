import Link from 'next/link'
import { requireAdmin, RestrictedAccessError } from '@/lib/auth/require-admin'
import { createServiceClient } from '@/lib/supabase/server'
import { matchOpportunity } from '@/features/alerts/matchers'
import type { AlertProfile } from '@/features/alerts/queries'
import { readOpportunityForProfile } from '@/features/personalization/match'
import type { Opportunity } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Debug matching · Encre admin',
  robots: { index: false, follow: false },
}

export default async function MatchingDebugPage({
  searchParams,
}: {
  searchParams: Promise<{ opportunity?: string; profile?: string }>
}) {
  try {
    await requireAdmin('/admin/matching')
  } catch (e) {
    if (e instanceof RestrictedAccessError) return <AccessDenied />
    throw e
  }

  const params = await searchParams
  const supabase = createServiceClient()

  const [{ data: oppRows }, { data: profileRows }] = await Promise.all([
    supabase
      .from('opportunities')
      .select('*')
      .eq('is_published', true)
      .eq('human_review', false)
      .order('updated_at', { ascending: false })
      .limit(120),
    supabase
      .from('alert_profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(80),
  ])

  const opportunities = (oppRows ?? []) as Opportunity[]
  const profiles = (profileRows ?? []) as AlertProfile[]
  const selectedOpportunity =
    opportunities.find((opp) => opp.id === params.opportunity) ?? opportunities[0] ?? null
  const selectedProfile =
    profiles.find((profile) => profile.id === params.profile) ??
    profiles[0] ??
    makeFallbackProfile()

  const strict = selectedOpportunity
    ? matchOpportunity(selectedOpportunity, selectedProfile)
    : null
  const reading = selectedOpportunity
    ? readOpportunityForProfile(selectedOpportunity, selectedProfile)
    : null

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8 border-b border-subtle pb-6">
        <div className="mb-2 text-xs uppercase tracking-[0.14em] text-muted">
          Encre · admin
        </div>
        <h1 className="font-serif text-3xl font-semibold">Debug matching</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Lecture technique d'une opportunité face à un profil d'alerte :
          filtres stricts, score personnalisé, raisons, warnings et
          éligibilité structurée.
        </p>
      </header>

      <form className="mb-8 grid gap-4 rounded-[var(--radius-lg)] border border-subtle bg-surface p-4 md:grid-cols-[1fr_1fr_auto]">
        <label className="block">
          <span className="mb-2 block text-sm text-muted">Opportunité</span>
          <select
            name="opportunity"
            defaultValue={selectedOpportunity?.id}
            className="w-full rounded-[var(--radius)] border border-subtle bg-background px-3 py-2 text-sm"
          >
            {opportunities.map((opp) => (
              <option key={opp.id} value={opp.id}>
                {opp.title} · {opp.emitter}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm text-muted">Profil</span>
          <select
            name="profile"
            defaultValue={selectedProfile.id}
            className="w-full rounded-[var(--radius)] border border-subtle bg-background px-3 py-2 text-sm"
          >
            {profiles.length === 0 && (
              <option value={selectedProfile.id}>Profil de test</option>
            )}
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-[var(--radius)] bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Analyser
          </button>
        </div>
      </form>

      {!selectedOpportunity || !strict || !reading ? (
        <EmptyState />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-6">
            <article className="rounded-[var(--radius-lg)] border border-subtle bg-surface p-5">
              <div className="mb-2 text-xs uppercase tracking-[0.12em] text-muted">
                Opportunité
              </div>
              <h2 className="font-serif text-2xl font-semibold">
                {selectedOpportunity.title}
              </h2>
              <p className="mt-2 text-sm text-muted">
                {selectedOpportunity.emitter} · {selectedOpportunity.type} ·{' '}
                {selectedOpportunity.geo_scope}
                {selectedOpportunity.region_code ? ` · ${selectedOpportunity.region_code}` : ''}
              </p>
              <Link
                href={`/aides/${selectedOpportunity.slug}`}
                className="mt-4 inline-block text-sm text-accent underline underline-offset-4"
              >
                Ouvrir la fiche publique
              </Link>
            </article>

            <article className="rounded-[var(--radius-lg)] border border-subtle bg-surface p-5">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <Badge label={strict.match ? 'Match strict' : 'Rejet strict'} tone={strict.match ? 'ok' : 'danger'} />
                <Badge label={reading.decisionLabel} tone={reading.level === 'strong' ? 'ok' : reading.level === 'not_recommended' ? 'danger' : 'warn'} />
                <Badge label={`Score ${reading.score}/100`} tone="neutral" />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <DebugList title="Raisons strictes" items={strict.reasons} empty="Aucune raison stricte." />
                <DebugList title="Raisons personnalisées" items={reading.reasons} empty="Aucune raison personnalisée." />
                <DebugList title="Warnings" items={reading.warnings} empty="Aucun warning." />
                <KeyValue
                  title="Score combiné"
                  rows={[
                    ['strict.match', String(strict.match)],
                    ['strict.score', strict.score.toFixed(3)],
                    ['personalization.level', reading.level],
                    ['candidate_mode', selectedProfile.candidate_mode],
                  ]}
                />
              </div>
            </article>

            <article className="rounded-[var(--radius-lg)] border border-subtle bg-surface p-5">
              <h2 className="mb-4 font-serif text-xl font-semibold">Éligibilité source</h2>
              <KeyValue
                title="Champs rapides"
                rows={[
                  ['summary', selectedOpportunity.eligibility_summary ?? ''],
                  ['confidence', selectedOpportunity.eligibility_confidence ?? ''],
                  ['requires_producer', String(selectedOpportunity.requires_producer ?? false)],
                  ['requires_editor', String(selectedOpportunity.requires_editor ?? false)],
                  ['min_films_produits', nullable(selectedOpportunity.min_films_produits)],
                  ['age_max', nullable(selectedOpportunity.age_max)],
                  ['tags', (selectedOpportunity.disciplines_tags ?? []).join(', ')],
                ]}
              />
              <JsonBlock value={selectedOpportunity.eligibility_profile ?? {}} />
            </article>
          </section>

          <aside className="space-y-6">
            <article className="rounded-[var(--radius-lg)] border border-subtle bg-surface p-5">
              <h2 className="mb-4 font-serif text-xl font-semibold">Profil lu</h2>
              <KeyValue
                title={selectedProfile.name}
                rows={[
                  ['disciplines', selectedProfile.disciplines.join(', ')],
                  ['formats', selectedProfile.discipline_tags.join(', ')],
                  ['has_producer', nullable(selectedProfile.has_producer)],
                  ['films_produced_count', nullable(selectedProfile.films_produced_count)],
                  ['age_range', selectedProfile.age_range ?? ''],
                  ['residency_context', selectedProfile.residency_context],
                  ['nationality_context', selectedProfile.nationality_context],
                  ['gender_context', selectedProfile.gender_context],
                  ['professional_status_tags', selectedProfile.professional_status_tags.join(', ')],
                  ['hors_reseau_only', String(selectedProfile.hors_reseau_only)],
                ]}
              />
            </article>

            <article className="rounded-[var(--radius-lg)] border border-subtle bg-surface p-5">
              <h2 className="mb-3 font-serif text-xl font-semibold">Repères</h2>
              <p className="text-sm leading-6 text-muted">
                Un warning d'éligibilité doit empêcher un “Très adapté” si le
                critère reste vague ou absent du profil. Si la source est claire
                et le profil correspond, le warning disparaît.
              </p>
            </article>
          </aside>
        </div>
      )}

      <footer className="mt-10 border-t border-subtle pt-6">
        <Link href="/admin" className="text-sm text-muted underline underline-offset-4">
          Retour au tableau de bord admin
        </Link>
      </footer>
    </main>
  )
}

function Badge({ label, tone }: { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }) {
  const classes = {
    ok: 'border-success/30 bg-success/10 text-success',
    warn: 'border-warning/30 bg-warning/10 text-warning',
    danger: 'border-danger/30 bg-danger-soft text-danger',
    neutral: 'border-subtle bg-background text-muted',
  }
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${classes[tone]}`}>
      {label}
    </span>
  )
}

function DebugList({
  title,
  items,
  empty,
}: {
  title: string
  items: string[]
  empty: string
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-muted">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((item) => (
            <li key={item} className="rounded-[var(--radius)] bg-background px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function KeyValue({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-muted">{title}</h3>
      <dl className="space-y-2 text-sm">
        {rows.map(([key, value]) => (
          <div key={key} className="grid grid-cols-[140px_1fr] gap-3">
            <dt className="font-mono text-xs text-muted">{key}</dt>
            <dd className="break-words">{value || '-'}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="mt-5 max-h-[420px] overflow-auto rounded-[var(--radius)] bg-background p-4 text-xs leading-5">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function EmptyState() {
  return (
    <div className="rounded-[var(--radius-lg)] border border-subtle bg-surface p-8 text-center text-muted">
      Aucune opportunité publiée à analyser.
    </div>
  )
}

function AccessDenied() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center">
      <h1 className="font-serif mb-3">Accès restreint</h1>
      <p className="text-muted">Cette page est réservée aux administrateurs.</p>
    </div>
  )
}

function nullable(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function makeFallbackProfile(): AlertProfile {
  return {
    id: 'debug-profile',
    user_id: 'debug-user',
    name: 'Profil de test',
    disciplines: ['cinema', 'audiovisuel'],
    discipline_tags: ['scenario'],
    audience: [],
    types: [],
    geo_scopes: ['national', 'regional', 'metropole', 'europe', 'international'],
    region_codes: [],
    min_amount: null,
    frequency: 'weekly',
    send_weekday: 1,
    has_producer: false,
    films_produced_count: 0,
    age_range: 'not_specified',
    residency_context: 'france_metropole',
    nationality_context: 'france',
    gender_context: 'not_specified',
    professional_status_tags: [],
    hors_reseau_only: true,
    candidate_mode: 'balanced',
    is_active: true,
    last_sent_at: null,
    created_at: new Date().toISOString(),
  }
}
