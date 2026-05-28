import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import {
  parsePeriodSlug,
  listStaticPeriodSlugs,
  siblingMonthSlug,
  isPeriodFullyPast,
  type ParsedPeriod,
} from '@/lib/period'
import {
  listOpportunitiesInPeriode,
  countDeadlinesByMonth,
} from '@/features/opportunities/queries'
import {
  groupByIsoWeek,
  groupByMonth,
  formatDayMonthShort,
  formatDeadlineHour,
  daysUntilDeadline,
  primaryDisciplineLabel,
  FR_MONTH_FULL,
} from '@/lib/calendar-utils'
import { labelForRegion } from '@/lib/region-codes'
import { formatAmount } from '@/lib/utils'
import type { Opportunity } from '@/lib/supabase/types'
import { getSiteUrl } from '@/lib/site'

function getWebcalUrl(): string {
  return getSiteUrl().replace(/^https?:/, 'webcal:') + '/api/calendar.ics'
}

/**
 * Encre · `/calendrier/[periode]`
 * Port du mockup mockups/v9-calendrier.html avec data dynamiques.
 *
 * Slugs valides : `2026-06`, `2026`, `ete-2026`, `printemps-2027`, etc.
 * Voir `src/lib/period.ts` pour la grammaire complète.
 *
 * Stratégie SEO :
 *   - 24 slugs pré-générés via generateStaticParams (mois glissants + 3 années
 *     + 8 saisons sur 2 ans). Les autres sont rendus à la demande puis cachés.
 *   - revalidate = 1800s (30 min) - l'inventaire bouge peu après le scrape quotidien
 *   - Schema.org Event JSON-LD pour chaque opportunité (Google Events ingestion)
 *   - noindex sur les périodes entièrement passées ou vides (anti dilution)
 */

export const revalidate = 1800

interface PageProps {
  params: Promise<{ periode: string }>
}

export async function generateStaticParams() {
  return listStaticPeriodSlugs().map((periode) => ({ periode }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { periode: rawSlug } = await params
  const periode = parsePeriodSlug(rawSlug)
  if (!periode) return {}

  const past = isPeriodFullyPast(periode)
  const items = past ? [] : await listOpportunitiesInPeriode(periode.start, periode.end)
  const noIndex = past || items.length === 0

  const subject =
    periode.kind === 'month'
      ? `${periode.label.toLowerCase()}`
      : periode.kind === 'season'
        ? `${periode.label.toLowerCase()}`
        : `l'année ${periode.label}`

  return {
    title: `Calendrier · ${periode.label}`,
    description:
      items.length > 0
        ? `${items.length} appel${items.length > 1 ? 's' : ''} à projets, résidences et bourses culturelles avec date limite en ${subject}. Tous métiers, toutes régions. Abonnement iCal.`
        : `Le calendrier des opportunités culturelles pour ${subject} sera publié dès que les premières dates seront fixées.`,
    alternates: {
      canonical: `/calendrier/${periode.slug}`,
    },
    robots: noIndex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: `Calendrier · ${periode.label} · Encre`,
      description: `${items.length} deadline${items.length > 1 ? 's' : ''} d'opportunités culturelles en ${subject}.`,
      type: 'website',
    },
  }
}

export default async function CalendrierPage({ params }: PageProps) {
  const { periode: rawSlug } = await params
  const periode = parsePeriodSlug(rawSlug)
  if (!periode) notFound()

  const items = await listOpportunitiesInPeriode(periode.start, periode.end)

  // Pour la minimap annuelle on a besoin des comptes par mois de l'année
  // de référence (= année du mois courant, ou année elle-même).
  const referenceYear = periode.year
  const monthCounts = await countDeadlinesByMonth(referenceYear)

  const past = isPeriodFullyPast(periode)
  const stats = computeStats(items)

  return (
    <>
      <CalendarSchema items={items} periode={periode} />

      <Hero periode={periode} items={items} stats={stats} past={past} />
      <AnnualMinimap year={referenceYear} counts={monthCounts} currentSlug={periode.slug} />
      <Listing periode={periode} items={items} past={past} />
      <Seasons referenceYear={referenceYear} monthCounts={monthCounts} />
      <Feeds />
      <Closer />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────────────────────────────

interface PeriodStats {
  count: number
  disciplines: number
  regions: number
  amountCumulMillions: number
}

function computeStats(items: Opportunity[]): PeriodStats {
  const disciplines = new Set<string>()
  const regions = new Set<string>()
  let cumul = 0
  for (const o of items) {
    for (const d of o.disciplines ?? []) disciplines.add(d)
    if (o.region_code) regions.add(o.region_code)
    if (typeof o.amount_max === 'number') cumul += o.amount_max
  }
  return {
    count: items.length,
    disciplines: disciplines.size,
    regions: regions.size,
    amountCumulMillions: cumul / 1_000_000,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero
// ─────────────────────────────────────────────────────────────────────────────

function Hero({
  periode,
  items,
  stats,
  past,
}: {
  periode: ParsedPeriod
  items: Opportunity[]
  stats: PeriodStats
  past: boolean
}) {
  const prevMonth = siblingMonthSlug(periode, -1)
  const nextMonth = siblingMonthSlug(periode, 1)

  return (
    <section style={{ background: 'var(--paper)', borderBottom: '1px solid var(--paper-deep)' }}>
      <div style={containerStyle}>
        <nav style={breadcrumbStyle} aria-label="Fil d'Ariane">
          <Link href="/" style={breadcrumbLinkStyle}>
            Encre
          </Link>
          <span style={breadcrumbSepStyle}>·</span>
          <Link href={`/calendrier/${periode.year}`} style={breadcrumbLinkStyle}>
            Calendrier
          </Link>
          <span style={breadcrumbSepStyle}>·</span>
          <span style={breadcrumbCurrentStyle}>{periode.label}</span>
        </nav>

        <div style={heroGridStyle}>
          <div>
            <div style={metaSlugStyle}>
              {periode.kind === 'month' ? 'Calendrier mensuel' : periode.kind === 'season' ? 'Calendrier saisonnier' : 'Calendrier annuel'}
              {past ? ' · archive' : ''}
            </div>
            <h1
              className="serif"
              style={{
                fontSize: 'clamp(3rem, 7vw, 5.2rem)',
                lineHeight: 0.96,
                fontWeight: 400,
                color: 'var(--ink)',
                marginBottom: 28,
              }}
            >
              {periode.label}
              <span style={{ color: 'var(--vermillion)' }}>.</span>
            </h1>

            <div style={statStripStyle}>
              <Cell num={stats.count} label="Deadlines" />
              <Sep />
              <Cell num={stats.disciplines} label="Disciplines" />
              <Sep />
              <Cell num={stats.regions} label="Régions" />
              <Sep />
              <Cell
                num={
                  stats.amountCumulMillions >= 1
                    ? `${stats.amountCumulMillions.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M€`
                    : '—'
                }
                label="Montant cumulé"
              />
            </div>

            {(prevMonth || nextMonth) && (
              <div style={periodNavStyle}>
                {prevMonth ? (
                  <Link href={`/calendrier/${prevMonth}`} style={periodNavArrowStyle}>
                    ← Mois précédent
                  </Link>
                ) : (
                  <span />
                )}
                {nextMonth ? (
                  <Link href={`/calendrier/${nextMonth}`} style={{ ...periodNavArrowStyle, textAlign: 'right' as const }}>
                    Mois suivant →
                  </Link>
                ) : (
                  <span />
                )}
              </div>
            )}
          </div>

          <IcalCard />
        </div>
      </div>
    </section>
  )
}

function Cell({ num, label }: { num: number | string; label: string }) {
  return (
    <div>
      <div className="serif" style={{ fontSize: '2.4rem', lineHeight: 1, color: 'var(--ink)', marginBottom: 6 }}>
        {num}
      </div>
      <div className="mono" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-soft)' }}>
        {label}
      </div>
    </div>
  )
}

function Sep() {
  return <div style={{ width: 1, background: 'var(--paper-deep)', alignSelf: 'stretch' }} />
}

function IcalCard() {
  return (
    <aside
      style={{
        background: 'var(--surface, #ffffff)',
        border: '1px solid var(--paper-deep)',
        borderRadius: 'var(--radius-lg)',
        padding: 28,
      }}
    >
      <div className="mono" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-soft)', marginBottom: 14 }}>
        Le calendrier dans votre agenda
      </div>
      <p className="serif" style={{ fontSize: '1rem', lineHeight: 1.55, color: 'var(--ink-muted)', marginBottom: 18 }}>
        Ajoutez le flux iCal une fois : chaque deadline arrive dans Google Calendar, Apple Calendar, Outlook. Mise à jour quotidienne.
      </p>
      <div
        className="mono"
        style={{
          fontSize: '0.78rem',
          color: 'var(--ink)',
          background: 'var(--paper-soft)',
          padding: '10px 12px',
          borderRadius: 'var(--radius)',
          marginBottom: 14,
          wordBreak: 'break-all',
        }}
      >
        {getWebcalUrl()}
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: '0.78rem' }}>
        <a href="/api/calendar.ics" style={icalTargetStyle}>
          Télécharger .ics
        </a>
        <a href="/api/feed.xml" style={icalTargetStyle}>
          Flux RSS
        </a>
      </div>
    </aside>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Annual minimap
// ─────────────────────────────────────────────────────────────────────────────

function AnnualMinimap({ year, counts, currentSlug }: { year: number; counts: Record<string, number>; currentSlug: string }) {
  const max = Math.max(1, ...Object.values(counts))
  const now = new Date()
  const nowKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

  return (
    <section style={{ padding: '64px 0', borderBottom: '1px solid var(--paper-deep)' }}>
      <div style={containerStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 32 }}>
          <h2 className="serif" style={{ fontSize: '1.5rem', fontWeight: 400, color: 'var(--ink)' }}>
            L&apos;année {year} en densité
          </h2>
          <div className="mono" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-soft)' }}>
            Hauteur · nombre de deadlines
          </div>
          <Link href={`/calendrier/${year}`} style={{ fontSize: '0.85rem', color: 'var(--vermillion)' }}>
            Voir l&apos;année entière →
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 12, alignItems: 'end' }}>
          {Array.from({ length: 12 }, (_, i) => {
            const month = i + 1
            const key = `${year}-${String(month).padStart(2, '0')}`
            const count = counts[key] ?? 0
            const heightPct = (count / max) * 100
            const isPast = key < nowKey
            const isCurrent = key === currentSlug || key === nowKey
            const linkSlug = key

            return (
              <Link
                key={key}
                href={`/calendrier/${linkSlug}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  textDecoration: 'none',
                  opacity: isPast && !isCurrent ? 0.5 : 1,
                }}
              >
                <div style={{ height: 80, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                  <div
                    style={{
                      width: '100%',
                      height: `${Math.max(4, heightPct)}%`,
                      background: isCurrent ? 'var(--ink)' : 'var(--ink-muted)',
                      opacity: isCurrent ? 1 : isPast ? 0.22 : 0.55,
                      borderRadius: 2,
                    }}
                  />
                </div>
                <div className="mono" style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: isCurrent ? 'var(--vermillion)' : 'var(--ink-soft)' }}>
                  {FR_MONTH_FULL[i].slice(0, 3)}
                </div>
                <div className="mono" style={{ fontSize: '0.7rem', color: isCurrent ? 'var(--ink)' : 'var(--ink-soft)' }}>
                  {count}
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Listing
// ─────────────────────────────────────────────────────────────────────────────

function Listing({ periode, items, past }: { periode: ParsedPeriod; items: Opportunity[]; past: boolean }) {
  if (items.length === 0) {
    return (
      <section style={{ padding: '80px 0' }}>
        <div style={containerStyle}>
          <div
            style={{
              padding: 64,
              textAlign: 'center',
              border: '1px dashed var(--paper-deep)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--ink-muted)',
            }}
          >
            <p className="serif" style={{ fontSize: '1.15rem', marginBottom: 12 }}>
              {past
                ? `Aucune deadline archivée pour ${periode.label.toLowerCase()}.`
                : `Aucune deadline encore publiée pour ${periode.label.toLowerCase()}.`}
            </p>
            <p style={{ fontSize: '0.9rem' }}>
              Les sources sont vérifiées chaque jour : revenez dans quelques semaines, ou{' '}
              <Link href="/mes-alertes" style={{ color: 'var(--vermillion)' }}>
                créez une alerte
              </Link>{' '}
              pour être prévenu.
            </p>
          </div>
        </div>
      </section>
    )
  }

  // Mois → groupé par semaine ISO. Année / saison → groupé par mois.
  const byWeek = periode.kind === 'month' ? groupByIsoWeek(items) : []
  const byMonth = periode.kind !== 'month' ? groupByMonth(items) : []

  return (
    <section style={{ padding: '64px 0', background: 'var(--paper-soft, var(--paper))' }}>
      <div style={containerStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 32 }}>
          <div className="mono" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-soft)' }}>
            {items.length} deadline{items.length > 1 ? 's' : ''} · tri chronologique
          </div>
        </div>

        {periode.kind === 'month' &&
          byWeek.map((week) => (
            <WeekBlock key={week.weekNumber} week={week} />
          ))}

        {periode.kind !== 'month' &&
          byMonth.map((month) => (
            <MonthBlock key={month.key} group={month} />
          ))}
      </div>
    </section>
  )
}

function WeekBlock({ week }: { week: ReturnType<typeof groupByIsoWeek>[number] }) {
  const startDay = week.start.getUTCDate()
  const endDay = week.end.getUTCDate()
  const startMonth = FR_MONTH_FULL[week.start.getUTCMonth()]
  const endMonth = FR_MONTH_FULL[week.end.getUTCMonth()]
  const range =
    week.start.getUTCMonth() === week.end.getUTCMonth()
      ? `Du ${startDay} au ${endDay} ${endMonth}`
      : `Du ${startDay} ${startMonth} au ${endDay} ${endMonth}`

  return (
    <div style={{ marginBottom: 40 }}>
      <div
        style={{
          display: 'flex',
          gap: 24,
          alignItems: 'baseline',
          paddingBottom: 12,
          marginBottom: 16,
          borderBottom: '1px solid var(--paper-deep)',
        }}
      >
        <div className="mono" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-soft)' }}>
          Semaine {week.weekNumber}
        </div>
        <div className="serif" style={{ fontSize: '0.95rem', color: 'var(--ink-muted)' }}>
          {range} · {week.items.length} deadline{week.items.length > 1 ? 's' : ''}
        </div>
      </div>
      {week.items.map((opp) => (
        <CalRow key={opp.id} opp={opp} />
      ))}
    </div>
  )
}

function MonthBlock({ group }: { group: ReturnType<typeof groupByMonth>[number] }) {
  return (
    <div style={{ marginBottom: 48 }}>
      <div
        style={{
          display: 'flex',
          gap: 24,
          alignItems: 'baseline',
          paddingBottom: 12,
          marginBottom: 16,
          borderBottom: '1px solid var(--paper-deep)',
        }}
      >
        <h3 className="serif" style={{ fontSize: '1.4rem', fontWeight: 400, color: 'var(--ink)' }}>
          <Link href={`/calendrier/${group.key}`} style={{ color: 'inherit' }}>
            {group.label}
          </Link>
        </h3>
        <div className="serif" style={{ fontSize: '0.95rem', color: 'var(--ink-muted)' }}>
          {group.items.length} deadline{group.items.length > 1 ? 's' : ''}
        </div>
      </div>
      {group.items.map((opp) => (
        <CalRow key={opp.id} opp={opp} />
      ))}
    </div>
  )
}

function CalRow({ opp }: { opp: Opportunity }) {
  const deadline = opp.deadline ? new Date(opp.deadline) : null
  if (!deadline) return null

  const { day, weekday } = formatDayMonthShort(deadline)
  const days = daysUntilDeadline(deadline)
  const urgent = days >= 0 && days <= 7
  const past = days < 0
  const { main, sub } = primaryDisciplineLabel(opp)
  const region = opp.region_code ? labelForRegion(opp.region_code) : null
  const amount =
    opp.amount_max != null
      ? formatAmount(opp.amount_min ?? null, opp.amount_max)
      : null
  const meta = [region, amount].filter(Boolean).join(' · ')

  return (
    <Link
      href={`/aides/${opp.slug}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '60px 110px 1fr 110px',
        gap: 20,
        alignItems: 'center',
        padding: '14px 16px',
        borderBottom: '1px solid var(--paper-deep)',
        background: urgent ? 'rgba(200, 54, 43, 0.04)' : 'transparent',
        textDecoration: 'none',
        color: 'var(--ink)',
      }}
    >
      <div className="mono" style={{ textAlign: 'center', lineHeight: 1.2 }}>
        <div style={{ fontSize: '1.3rem', fontWeight: 500, color: 'var(--ink)' }}>{day}</div>
        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-soft)' }}>{weekday}</div>
      </div>
      <div className="mono" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-muted)', lineHeight: 1.4 }}>
        {main}
        {sub && (
          <>
            <br />
            <span style={{ opacity: 0.65 }}>{sub}</span>
          </>
        )}
      </div>
      <div>
        <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', marginBottom: 4 }}>
          {opp.emitter}
        </div>
        <div className="serif" style={{ fontSize: '1.05rem', color: 'var(--ink)', lineHeight: 1.35 }}>
          {opp.title}
          {meta && (
            <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--ink-soft)', marginLeft: 10 }}>
              {meta}
            </span>
          )}
        </div>
      </div>
      <div className="mono" style={{ textAlign: 'right', fontSize: '0.85rem', color: past ? 'var(--ink-soft)' : 'var(--ink)' }}>
        <span style={{ color: urgent ? 'var(--vermillion)' : past ? 'var(--ink-soft)' : 'var(--ink)', fontWeight: 500 }}>
          {past ? `J+${Math.abs(days)}` : `J−${days}`}
        </span>
        <br />
        <span style={{ color: 'var(--ink-soft)', fontSize: '0.7rem' }}>{formatDeadlineHour(deadline)}</span>
      </div>
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Seasons
// ─────────────────────────────────────────────────────────────────────────────

const SEASON_BLURBS: Record<string, { months: string; blurb: string }> = {
  printemps: {
    months: 'Mars · Avril · Mai',
    blurb: "Cycle des résidences d'été et des appels CNAP. Premiers retours sur les bourses CNL.",
  },
  ete: {
    months: 'Juin · Juillet · Août',
    blurb: "Bourses d'écriture pour la rentrée littéraire. Aides régionales pour l'automne.",
  },
  automne: {
    months: 'Sept. · Oct. · Nov.',
    blurb: 'La saison la plus dense : SACEM, FCM, FAJV, CNC, ARTCENA grands lauréats.',
  },
  hiver: {
    months: 'Déc. · Janv. · Fév.',
    blurb: 'Période plus calme côté institutionnel ; fondations privées et mobilité internationale.',
  },
}

function Seasons({ referenceYear, monthCounts }: { referenceYear: number; monthCounts: Record<string, number> }) {
  const seasonCounts: Record<string, number> = { printemps: 0, ete: 0, automne: 0, hiver: 0 }
  for (let m = 3; m <= 5; m += 1) seasonCounts.printemps += monthCounts[`${referenceYear}-${String(m).padStart(2, '0')}`] ?? 0
  for (let m = 6; m <= 8; m += 1) seasonCounts.ete += monthCounts[`${referenceYear}-${String(m).padStart(2, '0')}`] ?? 0
  for (let m = 9; m <= 11; m += 1) seasonCounts.automne += monthCounts[`${referenceYear}-${String(m).padStart(2, '0')}`] ?? 0
  seasonCounts.hiver += monthCounts[`${referenceYear}-12`] ?? 0
  // Note: hiver chevauche, mais on n'affiche que la portion de l'année en cours
  // pour rester lisible - la fiche saison hiver-N parsera correctement les 3 mois.

  return (
    <section style={{ padding: '80px 0', background: 'var(--paper)' }}>
      <div style={containerStyle}>
        <div style={{ maxWidth: 720, marginBottom: 40 }}>
          <div className="mono" style={metaSlugStyle}>Quatre saisons, quatre temporalités</div>
          <h2 className="serif" style={{ fontSize: '1.85rem', lineHeight: 1.2, fontWeight: 400, color: 'var(--ink)', marginBottom: 16 }}>
            L&apos;année culturelle a son rythme. Calez le vôtre dessus.
          </h2>
          <p className="serif" style={{ color: 'var(--ink-muted)', lineHeight: 1.6 }}>
            La majorité des grands cycles institutionnels s&apos;ouvrent en septembre et se referment au printemps. Les résidences d&apos;été, plus courtes, demandent une candidature dès mars. Voici comment {referenceYear} se découpe.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {(['printemps', 'ete', 'automne', 'hiver'] as const).map((s) => {
            const blurb = SEASON_BLURBS[s]
            const count = seasonCounts[s]
            return (
              <Link
                key={s}
                href={`/calendrier/${s}-${referenceYear}`}
                style={{
                  display: 'block',
                  padding: 24,
                  border: '1px solid var(--paper-deep)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--surface, #ffffff)',
                  textDecoration: 'none',
                  color: 'var(--ink)',
                }}
              >
                <div className="mono" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-soft)', marginBottom: 12 }}>
                  {blurb.months}
                </div>
                <div className="serif" style={{ fontSize: '1.6rem', color: 'var(--ink)', marginBottom: 14, fontWeight: 400 }}>
                  {s === 'ete' ? 'Été' : s.charAt(0).toUpperCase() + s.slice(1)}
                </div>
                <p className="serif" style={{ fontSize: '0.88rem', color: 'var(--ink-muted)', lineHeight: 1.55, marginBottom: 16 }}>
                  {blurb.blurb}
                </p>
                <div className="mono" style={{ fontSize: '0.95rem', color: 'var(--ink)' }}>
                  {count}
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-soft)', marginLeft: 6 }}>
                    deadline{count > 1 ? 's' : ''}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Feeds (iCal + RSS)
// ─────────────────────────────────────────────────────────────────────────────

const DISCIPLINE_FEED_LABELS: Array<[string, string]> = [
  ['litterature', 'Écriture & édition'],
  ['spectacle_vivant', 'Spectacle vivant'],
  ['arts_visuels', 'Arts visuels & plastiques'],
  ['cinema', 'Audiovisuel & cinéma'],
  ['musique', 'Musique'],
  ['numerique', 'Arts numériques'],
]

function Feeds() {
  return (
    <section style={{ padding: '80px 0', background: 'var(--ink)', color: 'var(--paper)' }}>
      <div style={containerStyle}>
        <div style={{ maxWidth: 720, marginBottom: 40 }}>
          <div className="mono" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--paper-deep)', marginBottom: 14 }}>
            Section technique · Pour les têtes calmes
          </div>
          <h2 className="serif" style={{ fontSize: '1.85rem', lineHeight: 1.2, fontWeight: 400, color: 'var(--paper)', marginBottom: 16 }}>
            Branchez le calendrier une fois, oubliez-le pour toujours.
          </h2>
          <p className="serif" style={{ color: 'var(--paper-deep)', lineHeight: 1.6 }}>
            Encre ne vous demandera jamais de revenir consulter le site chaque semaine. Le calendrier vit dans votre agenda, vos deadlines arrivent là où vous travaillez déjà. Le flux RSS est aussi disponible.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
          <FeedBlockGlobal />
          <FeedBlockDisciplines />
        </div>
      </div>
    </section>
  )
}

function FeedBlockGlobal() {
  return (
    <div style={{ padding: 24, background: 'rgba(244, 237, 224, 0.06)', borderRadius: 'var(--radius-lg)' }}>
      <h3 className="serif" style={{ fontSize: '1.3rem', color: 'var(--paper)', marginBottom: 12, fontWeight: 400 }}>
        Calendrier global
      </h3>
      <p className="serif" style={{ fontSize: '0.92rem', color: 'var(--paper-deep)', lineHeight: 1.6, marginBottom: 20 }}>
        Toutes les opportunités, tous métiers, toutes régions. Mise à jour quotidienne, fuseau Europe/Paris.
      </p>
      <div
        className="mono"
        style={{
          fontSize: '0.78rem',
          color: 'var(--paper)',
          background: 'rgba(0,0,0,0.3)',
          padding: '12px 14px',
          borderRadius: 'var(--radius)',
          marginBottom: 18,
          wordBreak: 'break-all',
        }}
      >
        {getWebcalUrl()}
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: '0.85rem' }}>
        <a href="/api/calendar.ics" style={{ color: 'var(--paper)', borderBottom: '1px solid var(--paper-deep)' }}>
          Télécharger .ics
        </a>
        <a href="/api/feed.xml" style={{ color: 'var(--paper)', borderBottom: '1px solid var(--paper-deep)' }}>
          Flux RSS
        </a>
      </div>
      <div className="mono" style={{ marginTop: 22, fontSize: '0.7rem', color: 'var(--paper-deep)', opacity: 0.6, lineHeight: 1.5 }}>
        Format iCalendar standard, RFC 5545. Compatible avec tout logiciel d&apos;agenda. Le préfixe webcal:// déclenche l&apos;abonnement automatique.
      </div>
    </div>
  )
}

function FeedBlockDisciplines() {
  return (
    <div style={{ padding: 24, background: 'rgba(244, 237, 224, 0.06)', borderRadius: 'var(--radius-lg)' }}>
      <h3 className="serif" style={{ fontSize: '1.3rem', color: 'var(--paper)', marginBottom: 12, fontWeight: 400 }}>
        Flux par discipline
      </h3>
      <p className="serif" style={{ fontSize: '0.92rem', color: 'var(--paper-deep)', lineHeight: 1.6, marginBottom: 20 }}>
        Si vous ne suivez qu&apos;un métier, abonnez-vous au flux dédié. Moins de bruit, mêmes mises à jour.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {DISCIPLINE_FEED_LABELS.map(([slug, label]) => {
          const urlSlug = slug.replace(/_/g, '-')
          return (
            <li
              key={slug}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 0',
                borderBottom: '1px solid rgba(244, 237, 224, 0.1)',
              }}
            >
              <span className="serif" style={{ color: 'var(--paper)', fontSize: '0.95rem' }}>
                {label}
              </span>
              <a
                href={`/api/calendar/${urlSlug}.ics`}
                className="mono"
                style={{ color: 'var(--paper-deep)', fontSize: '0.78rem', borderBottom: '1px solid rgba(244, 237, 224, 0.2)' }}
              >
                .ics
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Closer
// ─────────────────────────────────────────────────────────────────────────────

function Closer() {
  return (
    <section style={{ padding: '96px 0' }}>
      <div style={{ ...containerStyle, maxWidth: 720 }}>
        <div className="mono" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-soft)', marginBottom: 18 }}>
          Note d&apos;intention · Pourquoi cette page existe
        </div>
        <h2 className="serif" style={{ fontSize: '1.65rem', lineHeight: 1.3, fontWeight: 400, color: 'var(--ink)', marginBottom: 22 }}>
          Personne, dans le secteur culturel français, n&apos;a jamais publié un calendrier indexable, propre et complet.
        </h2>
        <p className="serif" style={{ color: 'var(--ink-muted)', lineHeight: 1.7, marginBottom: 16 }}>
          Les institutions diffusent des PDF, des listes datées sans URL stable, des annonces archivées en page quatre du site. Les agrégateurs commerciaux ferment leurs données derrière un paywall. Les blogs spécialisés vieillissent sans qu&apos;on puisse les distinguer d&apos;une fiche encore valide.
        </p>
        <p className="serif" style={{ color: 'var(--ink-muted)', lineHeight: 1.7, marginBottom: 16 }}>
          Encre fait le pari inverse : chaque deadline a une page, chaque mois a une page, chaque saison a une page, chaque année a une page. Toutes lisibles sans connexion, toutes archivables, toutes au format ouvert. Les sources sont vérifiées chaque jour, les fiches expirées passent en noindex sans casser leurs liens, le flux iCal est régénéré quotidiennement.
        </p>
        <p className="serif" style={{ color: 'var(--ink-muted)', lineHeight: 1.7 }}>
          Si cet outil vous fait gagner une demi-journée par mois, c&apos;est qu&apos;il fonctionne. Si vous ratez encore une deadline, écrivez-nous : on saura corriger ce qui manque.
        </p>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON-LD Schema.org
// ─────────────────────────────────────────────────────────────────────────────

function CalendarSchema({ items, periode }: { items: Opportunity[]; periode: ParsedPeriod }) {
  const baseUrl = getSiteUrl()

  // ItemList wrapping all events for the period - Google Events ingestion preferred shape.
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Opportunités culturelles · ${periode.label}`,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 100).map((o, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Event',
        name: o.title,
        url: `${baseUrl}/aides/${o.slug}`,
        startDate: o.deadline ?? undefined,
        endDate: o.deadline ?? undefined,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
        organizer: { '@type': 'Organization', name: o.emitter },
        description: o.description ?? `Date limite de candidature : ${o.deadline}.`,
        location: o.region_code
          ? { '@type': 'Place', name: labelForRegion(o.region_code) ?? 'France', address: { '@type': 'PostalAddress', addressCountry: 'FR' } }
          : { '@type': 'VirtualLocation', url: o.source_url },
      },
    })),
  }

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared styles
// ─────────────────────────────────────────────────────────────────────────────

const containerStyle = {
  maxWidth: 1200,
  margin: '0 auto',
  padding: '64px 24px',
} as const

const breadcrumbStyle = {
  display: 'flex',
  gap: 8,
  alignItems: 'baseline',
  marginBottom: 32,
  fontSize: '0.78rem',
  color: 'var(--ink-soft)',
} as const

const breadcrumbLinkStyle = {
  color: 'var(--ink-muted)',
  textDecoration: 'none',
} as const

const breadcrumbSepStyle = { color: 'var(--ink-soft)' } as const
const breadcrumbCurrentStyle = { color: 'var(--ink)' } as const

const heroGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 360px)',
  gap: 48,
  alignItems: 'start',
} as const

const metaSlugStyle = {
  fontSize: '0.7rem',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  color: 'var(--ink-soft)',
  marginBottom: 18,
} as const

const statStripStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1px 1fr 1px 1fr 1px 1fr',
  gap: 24,
  paddingTop: 24,
  borderTop: '1px solid var(--paper-deep)',
  marginBottom: 32,
} as const

const periodNavStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 16,
  paddingTop: 24,
  borderTop: '1px solid var(--paper-deep)',
} as const

const periodNavArrowStyle = {
  color: 'var(--ink-muted)',
  textDecoration: 'none',
  fontSize: '0.9rem',
} as const

const icalTargetStyle = {
  color: 'var(--vermillion)',
  borderBottom: '1px solid var(--vermillion)',
  paddingBottom: 1,
  textDecoration: 'none',
} as const
