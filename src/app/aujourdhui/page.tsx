import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { listUserAlertProfiles, type AlertProfile } from '@/features/alerts/queries'
import { listPersonalizedOpportunitiesForProfile } from '@/features/personalization/queries'
import { humanDeadline } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Aujourd'hui",
  robots: { index: false, follow: false },
}

type Level = 'strong' | 'possible' | 'difficult' | 'not_recommended'

const LEVEL_SHORT: Record<Level, string> = {
  strong: 'Très adapté',
  possible: 'Possible',
  difficult: 'Exigeant',
  not_recommended: 'Non retenu',
}

export default async function AujourdHuiPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/connexion?next=/aujourdhui')

  const profiles = await listUserAlertProfiles()
  const activeProfiles = profiles.filter((profile) => profile.is_active)
  const profileSections = await Promise.all(
    activeProfiles.slice(0, 5).map(async (profile) => ({
      profile,
      rows: await listPersonalizedOpportunitiesForProfile(profile.id, { limit: 10 }),
    })),
  )
  const urgentRows = profileSections
    .flatMap((section) =>
      section.rows.map((row) => ({
        profile: section.profile,
        row,
      })),
    )
    .filter(({ row }) => {
      if (!row.opportunity.deadline) return false
      const days = daysUntil(row.opportunity.deadline)
      return days >= 0 && days <= 14
    })
    .sort(
      (a, b) =>
        deadlineTime(a.row.opportunity.deadline) - deadlineTime(b.row.opportunity.deadline),
    )
    .slice(0, 6)

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <header className="mb-10">
        <div className="text-sm text-muted mb-3">{formatLongDate(new Date())}</div>
        <h1 className="font-serif mb-3">Aujourd'hui</h1>
        <p className="text-muted max-w-2xl">
          Votre vue complète sur les alertes actives, les prochaines échéances,
          et les opportunités qui méritent une lecture en premier.
        </p>
        <p className="text-sm text-muted mt-4">
          {activeProfiles.length} alerte{activeProfiles.length > 1 ? 's' : ''} active{activeProfiles.length > 1 ? 's' : ''}
          {' · '}
          {urgentRows.length} échéance{urgentRows.length > 1 ? 's' : ''} dans les 14 prochains jours
          {profiles.length > activeProfiles.length && (
            <>
              {' · '}
              {profiles.length} configurée{profiles.length > 1 ? 's' : ''} au total
            </>
          )}
        </p>
      </header>

      {activeProfiles.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_1.35fr]">
          <section className="space-y-4">
            <SectionTitle>Prochains envois</SectionTitle>
            {activeProfiles.map((profile) => (
              <AlertSchedule key={profile.id} profile={profile} />
            ))}
          </section>

          <section className="space-y-8">
            <div>
              <SectionTitle>Vues critiques</SectionTitle>
              {urgentRows.length === 0 ? (
                <p className="text-sm text-muted">Aucune échéance critique sur les 14 prochains jours.</p>
              ) : (
                <div className="space-y-3">
                  {urgentRows.map(({ profile, row }) => (
                    <OpportunityRow
                      key={`urgent-${profile.id}-${row.opportunity.id}`}
                      profile={profile}
                      title={row.opportunity.title}
                      slug={row.opportunity.slug}
                      emitter={row.opportunity.emitter}
                      deadline={row.opportunity.deadline}
                      level={row.reading.level as Level}
                    />
                  ))}
                </div>
              )}
            </div>

            {profileSections.map((section) => (
              <div key={section.profile.id}>
                <div className="mb-3 flex items-baseline justify-between gap-4">
                  <SectionTitle>{section.profile.name}</SectionTitle>
                  <Link
                    href={`/mes-alertes/${section.profile.id}/aides`}
                    className="text-sm text-accent underline underline-offset-4"
                  >
                    Tout voir
                  </Link>
                </div>
                {section.rows.length === 0 ? (
                  <p className="text-sm text-muted">Aucune opportunité ouverte pour cette alerte.</p>
                ) : (
                  <div className="space-y-3">
                    {section.rows.map((row) => (
                      <OpportunityRow
                        key={row.opportunity.id}
                        profile={section.profile}
                        title={row.opportunity.title}
                        slug={row.opportunity.slug}
                        emitter={row.opportunity.emitter}
                        deadline={row.opportunity.deadline}
                        level={row.reading.level as Level}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  )
}

function AlertSchedule({ profile }: { profile: AlertProfile }) {
  return (
    <article className="rounded-[var(--radius-lg)] border border-subtle bg-paper-soft p-4">
      <div className="font-medium">{profile.name}</div>
      <div className="mt-1 text-sm text-muted">{formatNextSend(profile)}</div>
      <div className="mt-3">
        <Link
          href={`/mes-alertes/${profile.id}/modifier`}
          className="text-sm text-accent underline underline-offset-4"
        >
          Ajuster
        </Link>
      </div>
    </article>
  )
}

function OpportunityRow({
  profile,
  title,
  slug,
  emitter,
  deadline,
  level,
}: {
  profile: AlertProfile
  title: string
  slug: string
  emitter: string
  deadline: string | null
  level: Level
}) {
  return (
    <Link href={`/aides/${slug}`} className="today-row">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium leading-snug">{title}</div>
          <div className="mt-1 text-sm text-muted">
            {emitter} · {profile.name}
          </div>
        </div>
        <div className="text-right shrink-0">
          {level !== 'not_recommended' && (
            <div className="today-level" data-level={level}>
              {LEVEL_SHORT[level]}
            </div>
          )}
          {deadline && (
            <div className="mt-1 text-sm text-muted">{humanDeadline(deadline)}</div>
          )}
        </div>
      </div>
    </Link>
  )
}

function EmptyState() {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-subtle p-10 text-center">
      <div className="font-medium mb-2">Aucune alerte active.</div>
      <p className="text-sm text-muted mb-5">
        Une veille personnalisée permet de suivre un projet, un format ou une zone.
      </p>
      <Link
        href="/onboarding"
        className="today-cta inline-flex rounded-[var(--radius)] bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
      >
        Composer une veille
      </Link>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-serif text-xl font-semibold">{children}</h2>
}

function formatNextSend(profile: AlertProfile): string {
  if (profile.frequency === 'daily') return 'Prochain envoi : demain matin'
  if (profile.frequency === 'deadline_only') {
    return 'Prochain envoi : seulement si une date limite approche'
  }

  return `Prochain envoi : ${nextWeekday(profile.send_weekday).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })}`
}

function nextWeekday(targetIsoWeekday: number): Date {
  const now = new Date()
  const currentIsoWeekday = now.getDay() === 0 ? 7 : now.getDay()
  let delta = targetIsoWeekday - currentIsoWeekday
  if (delta <= 0) delta += 7
  const next = new Date(now)
  next.setDate(now.getDate() + delta)
  return next
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function deadlineTime(deadline: string | null): number {
  if (!deadline) return Number.POSITIVE_INFINITY
  return new Date(deadline).getTime()
}

function formatLongDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
