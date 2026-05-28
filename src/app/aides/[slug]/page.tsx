import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { BackToList } from '@/components/opportunities/BackToList'
import { PersonalizedOpportunityReading } from '@/components/opportunities/PersonalizedOpportunityReading'
import { normalizeSectionList, type SectionKind } from '@/lib/normalize/section-item'
import {
  getOpportunityBySlug,
  listOpportunitySlugsForSitemap,
} from '@/features/opportunities/queries'
import {
  OPPORTUNITY_TYPE_LABELS,
  DISCIPLINE_LABELS,
  type OpportunityType,
  type DisciplineSlug,
  type GeoScope,
} from '@/lib/discipline-taxonomy'
import { labelForRegion } from '@/lib/region-codes'
import { formatAmount } from '@/lib/utils'
import { absoluteUrl, SITE_NAME } from '@/lib/site'

/**
 * Encre · fiche détail d'une opportunité.
 * Port des mockups mockups/v6-detail.html (état actif) et v6b-expired.html
 * (état clos quand `deadline < now()`).
 *
 * Le Header et Footer sont fournis par layout.tsx.
 * SEO : JSON-LD Grant/Event selon le type + BreadcrumbList. generateMetadata
 * dynamique. generateStaticParams sur top 500.
 */

// Types qui se modélisent en Grant (aide monétaire) vs Event (résidence,
// concours, commande - activité datée). Cf. schema.org/Grant et /Event.
const GRANT_TYPES: ReadonlySet<string> = new Set([
  'bourse',
  'subvention',
  'prix',
  'appel_a_projets',
])

export const revalidate = 3600 // ISR 1 h

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const slugs = await listOpportunitySlugsForSitemap()
  return slugs.slice(0, 500).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const opp = await getOpportunityBySlug(slug)
  if (!opp) return {}

  const deadline = opp.deadline ? new Date(opp.deadline) : null
  const isPast = deadline ? deadline.getTime() < Date.now() : false

  return {
    title: `${opp.title} · ${opp.emitter}`,
    description:
      opp.description?.slice(0, 160) ??
      `${OPPORTUNITY_TYPE_LABELS[opp.type as OpportunityType]} · ${opp.emitter}`,
    alternates: { canonical: `/aides/${slug}` },
    openGraph: {
      title: opp.title,
      description: opp.description?.slice(0, 200),
      type: 'article',
      url: `/aides/${slug}`,
    },
    robots: isPast ? { index: false, follow: true } : { index: true, follow: true },
  }
}

export default async function OpportunityDetailPage({ params }: PageProps) {
  const { slug } = await params
  const o = await getOpportunityBySlug(slug)
  if (!o) notFound()

  const amount = formatAmount(o.amount_min, o.amount_max)
  const deadline = o.deadline ? new Date(o.deadline) : null
  const now = Date.now()
  const isPast = deadline ? deadline.getTime() < now : false
  const daysLeft = deadline
    ? Math.ceil((deadline.getTime() - now) / (1000 * 60 * 60 * 24))
    : null
  const urgent = !isPast && daysLeft !== null && daysLeft >= 0 && daysLeft <= 30
  const monthsClosed = deadline
    ? Math.floor((now - deadline.getTime()) / (1000 * 60 * 60 * 24 * 30))
    : null

  const typeLabel = OPPORTUNITY_TYPE_LABELS[o.type as OpportunityType] ?? o.type
  const geoLabel = formatGeoLabel(o.geo_scope, o.region_code)
  const audienceLabel = formatAudience(o.audience)
  const sourceShort = shortSource(o.source_url)

  const canonicalUrl = absoluteUrl(`/aides/${o.slug}`)
  const isGrant = GRANT_TYPES.has(o.type)
  const hasAmount = o.amount_min !== null || o.amount_max !== null

  const jsonLd = isGrant
    ? {
        '@context': 'https://schema.org',
        '@type': 'Grant',
        name: o.title,
        description: o.description ?? undefined,
        url: canonicalUrl,
        funder: { '@type': 'Organization', name: o.emitter },
        ...(o.published_at ? { datePosted: o.published_at } : {}),
        ...(o.deadline ? { applicationDeadline: o.deadline } : {}),
        ...(hasAmount
          ? {
              fundingAmount: {
                '@type': 'MonetaryAmount',
                currency: o.currency ?? 'EUR',
                ...(o.amount_min !== null ? { minValue: o.amount_min } : {}),
                ...(o.amount_max !== null ? { maxValue: o.amount_max } : {}),
              },
            }
          : {}),
        inLanguage: 'fr-FR',
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: o.title,
        description: o.description ?? undefined,
        url: canonicalUrl,
        organizer: { '@type': 'Organization', name: o.emitter },
        ...(o.deadline
          ? { startDate: o.deadline, endDate: o.deadline }
          : {}),
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/MixedEventAttendanceMode',
        location: { '@type': 'VirtualLocation', url: canonicalUrl },
        inLanguage: 'fr-FR',
      }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: SITE_NAME,
        item: absoluteUrl('/'),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Le registre',
        item: absoluteUrl('/aides'),
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: o.title,
        item: canonicalUrl,
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      {/* ─── BANNER CYCLE CLOS ─────────────────────────────── */}
      {isPast && (
        <div
          style={{
            background: 'var(--paper-deep)',
            borderBottom: '1px solid var(--ink-rule)',
          }}
        >
          <div
            className="max-w-[1100px] mx-auto px-5 sm:px-8"
            style={{
              padding: '16px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            <span style={{ color: 'var(--ink-muted)' }}>
              {monthsClosed !== null && monthsClosed >= 1
                ? `Cycle clos depuis ${monthsClosed} mois.`
                : 'Cycle clos.'}
            </span>
            <span style={{ color: 'var(--ink)', fontWeight: 500 }}>
              Le prochain cycle sera publié dès qu&apos;il sera annoncé par l&apos;émetteur.
            </span>
            <Link
              href="/#recevoir"
              style={{
                marginLeft: 'auto',
                color: 'var(--ink)',
                borderBottom: '1px solid var(--vermillion)',
                paddingBottom: 2,
              }}
            >
              Être notifié à l&apos;ouverture →
            </Link>
          </div>
        </div>
      )}

      <div className="max-w-[1100px] mx-auto px-8 opp-detail-wrap">
        {/* ─── BREADCRUMB ───────────────────────────────── */}
        <div style={{ padding: '18px 0 0' }}>
          <BackToList
            label="← Retour aux appels en cours"
            className="mono"
            style={{
              fontSize: '0.76rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--ink-muted)',
              borderBottom: '1px solid transparent',
              paddingBottom: 2,
              transition: 'color 160ms var(--ease-out), border-color 160ms var(--ease-out)',
            }}
          />
        </div>

        {/* ─── TITLE BLOCK ──────────────────────────────── */}
        <div style={{ padding: '40px 0 32px' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 14,
              marginBottom: 22,
              alignItems: 'baseline',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            <span style={{ color: 'var(--ink-soft)' }}>
              {o.slug.slice(0, 18).toUpperCase()}
            </span>
            <span style={{ color: 'var(--ink-rule)' }}>·</span>
            <span
              style={{
                color: isPast ? 'var(--ink-muted)' : 'var(--vermillion)',
                fontWeight: 500,
              }}
            >
              {typeLabel}
            </span>
            <span style={{ color: 'var(--ink-rule)' }}>·</span>
            <span style={{ color: 'var(--ink)' }}>{o.emitter}</span>
            {o.hors_reseau_friendly && (
              <>
                <span style={{ color: 'var(--ink-rule)' }}>·</span>
                <span
                  title="Ouvert aux candidats sans réseau ni producteur attaché"
                  style={{
                    color: 'var(--kelp)',
                    border: '1px solid var(--kelp)',
                    padding: '1px 8px',
                    borderRadius: 2,
                    fontSize: '0.62rem',
                    letterSpacing: '0.06em',
                  }}
                >
                  Hors réseau
                </span>
              </>
            )}
            {isPast && (
              <span
                style={{
                  marginLeft: 'auto',
                  background: 'var(--ink)',
                  color: 'var(--paper)',
                  padding: '4px 10px',
                  fontWeight: 500,
                }}
              >
                Cycle clos
              </span>
            )}
          </div>

          <h1
            className="serif"
            style={{
              fontWeight: 600,
              fontSize: 'clamp(2.2rem, 5vw, 3.4rem)',
              lineHeight: 1.08,
              letterSpacing: '-0.025em',
              color: 'var(--ink)',
              maxWidth: '22ch',
              opacity: isPast ? 0.85 : 1,
            }}
          >
            {o.title}
          </h1>
        </div>

        {/* ─── FICHE SIGNALÉTIQUE ───────────────────────── */}
        <dl
          className="fiche-grid"
          style={{
            margin: '36px 0 32px',
            padding: '24px 28px',
            background: 'var(--paper-soft)',
            borderTop: '2px solid var(--ink)',
            borderBottom: '1px solid var(--ink)',
            display: 'grid',
            gridTemplateColumns: isPast
              ? 'repeat(3, 1fr)'
              : 'repeat(4, 1fr)',
            gap: 32,
          }}
        >
          <FicheCell
            label={isPast ? 'Échéance (close)' : 'Échéance'}
            urgent={urgent}
            closed={isPast}
            sub={
              deadline
                ? isPast
                  ? monthsClosed !== null && monthsClosed >= 1
                    ? `close depuis ${monthsClosed} mois`
                    : 'close'
                  : daysLeft === 0
                    ? "aujourd'hui"
                    : daysLeft === 1
                      ? 'demain'
                      : `dans ${daysLeft} jours`
                : 'voir source'
            }
          >
            {deadline ? formatShortDate(deadline) : 'Non communiquée'}
          </FicheCell>

          <FicheCell label={isPast ? 'Montant cycle clos' : 'Montant'}>
            {amount ?? 'Voir règlement'}
          </FicheCell>

          <FicheCell label="Lieu" sub={geoSubLabel(o.region_code, o.geo_scope)}>
            {geoLabel}
          </FicheCell>

          {!isPast && (
            <FicheCell label="Pour qui">{audienceLabel}</FicheCell>
          )}
        </dl>

        {!isPast && <PersonalizedOpportunityReading slug={o.slug} />}

        {/* ─── ACTIONS ──────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            alignItems: 'center',
            marginBottom: 56,
          }}
        >
          {isPast ? (
            <>
              <Link href="/#recevoir" style={btnSecondaryStyle}>
                Être notifié au prochain cycle
              </Link>
              <a
                href={o.source_url}
                target="_blank"
                rel="noopener noreferrer external"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--ink-muted)',
                  borderBottom: '1px solid var(--ink-rule)',
                  paddingBottom: 2,
                  marginLeft: 6,
                }}
              >
                Consulter l&apos;archive officielle →
              </a>
            </>
          ) : (
            <>
              <a
                href={o.source_url}
                target="_blank"
                rel="noopener noreferrer external"
                style={btnPrimaryStyle}
              >
                Postuler sur {sourceShort.replace('/…', '')} →
              </a>
              <span
                className="mono"
                style={{
                  fontSize: '0.74rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--ink-muted)',
                  marginLeft: 4,
                }}
              >
                candidatures sur le site de l&apos;émetteur
              </span>
            </>
          )}
        </div>

        {/* ─── BODY : 4 sections (mode actif) · résumé court (mode clos) ── */}
        <article
          style={{
            maxWidth: 720,
            fontFamily: 'var(--font-serif)',
            fontSize: isPast ? '1.15rem' : '1.18rem',
            lineHeight: 1.65,
            color: isPast ? 'var(--ink-muted)' : 'var(--ink)',
          }}
        >
          {isPast ? (
            <ArchiveSummary description={o.description} typeLabel={typeLabel} />
          ) : (
            <DetailSections
              description={o.description}
              conditions={(o as { conditions?: string[] }).conditions ?? []}
              calendrier={(o as { calendrier?: string[] }).calendrier ?? []}
              dossier={(o as { dossier?: string[] }).dossier ?? []}
              eligibilitySummary={(o as { eligibility_summary?: string | null }).eligibility_summary ?? null}
              deadline={deadline}
              sourceUrl={o.source_url}
              nextEditionStatus={(o as { next_edition_status?: string | null }).next_edition_status ?? null}
            />
          )}
        </article>

        {/* ─── SOURCE BLOCK ────────────────────────────── */}
        <div
          style={{
            marginTop: 80,
            padding: '32px 0',
            borderTop: '2px solid var(--ink)',
            borderBottom: '1px solid var(--ink)',
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: '0.72rem',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--vermillion)',
              marginBottom: 10,
            }}
          >
            Source officielle{isPast ? ' (cycle clos)' : ''}
          </div>
          <a
            href={o.source_url}
            target="_blank"
            rel="noopener noreferrer external"
            className="mono"
            style={{
              fontSize: '1rem',
              color: 'var(--ink)',
              wordBreak: 'break-all',
              display: 'inline-block',
              borderBottom: '1px solid var(--ink-rule)',
              paddingBottom: 2,
              transition: 'color 160ms var(--ease-out), border-color 160ms var(--ease-out)',
            }}
          >
            {o.source_url}
          </a>
          <p
            style={{
              marginTop: 14,
              fontFamily: 'var(--font-sans)',
              fontSize: '0.92rem',
              color: 'var(--ink-muted)',
              lineHeight: 1.55,
              maxWidth: 620,
            }}
          >
            {isPast ? (
              <>
                Recensé par Encre le {formatShortDate(new Date(o.published_at))}.
                Encre n&apos;est pas affilié à l&apos;émetteur. Le prochain
                cycle sera republié à cette même adresse dès qu&apos;il sera
                annoncé.
              </>
            ) : (
              <>
                Recensé par Encre le {formatShortDate(new Date(o.published_at))},
                {o.updated_at &&
                  ` dernière vérification le ${formatShortDate(new Date(o.updated_at))}.`}{' '}
                Encre n&apos;est pas affilié à l&apos;émetteur. Les conditions
                de candidature et la décision finale relèvent exclusivement de
                celui-ci. Vous pouvez vérifier ces informations à tout moment
                sur le site source.
              </>
            )}
          </p>
        </div>

        {/* spacer bottom */}
        <div style={{ paddingBottom: 96 }} />
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function FicheCell({
  label,
  children,
  sub,
  urgent,
  closed,
}: {
  label: string
  children: React.ReactNode
  sub?: string
  urgent?: boolean
  closed?: boolean
}) {
  return (
    <div>
      <dt
        className="mono"
        style={{
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--ink-muted)',
          marginBottom: 8,
        }}
      >
        {label}
      </dt>
      <dd
        className="serif"
        style={{
          fontSize: '1.4rem',
          fontWeight: 600,
          lineHeight: 1.1,
          letterSpacing: '-0.01em',
          color: closed
            ? 'var(--ink-soft)'
            : urgent
              ? 'var(--vermillion)'
              : 'var(--ink)',
          textDecoration: closed ? 'line-through' : 'none',
          textDecorationColor: closed ? 'var(--ink-muted)' : undefined,
          textDecorationThickness: closed ? 1 : undefined,
        }}
      >
        {children}
        {sub && (
          <span
            style={{
              display: 'block',
              marginTop: 4,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              fontWeight: 400,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--ink-muted)',
              textDecoration: 'none',
            }}
          >
            {sub}
          </span>
        )}
      </dd>
    </div>
  )
}

function DetailSections({
  description,
  conditions,
  calendrier,
  dossier,
  eligibilitySummary,
  deadline,
  sourceUrl,
  nextEditionStatus,
}: {
  description: string | null
  conditions: string[]
  calendrier: string[]
  dossier: string[]
  eligibilitySummary: string | null
  deadline: Date | null
  sourceUrl: string
  nextEditionStatus: string | null
}) {
  return (
    <>
      {nextEditionStatus === 'awaiting_details' && (
        <NextEditionBanner sourceUrl={sourceUrl} />
      )}

      {/* ── Présentation ── */}
      <section>
        <ProseHeading>Présentation</ProseHeading>
        {description ? (
          parseParagraphs(description).map((p, idx) => (
            <p key={idx} style={idx === 0 ? undefined : { marginTop: 18 }}>
              {p}
            </p>
          ))
        ) : (
          <p style={{ color: 'var(--ink-muted)', fontStyle: 'italic' }}>
            Présentation non disponible. Le règlement officiel reste accessible
            via le lien ci-dessous.
          </p>
        )}
      </section>

      {eligibilitySummary && (
        <section style={{ marginTop: 56 }}>
          <ProseHeading>Éligibilité</ProseHeading>
          <p style={{ color: 'var(--ink)', marginTop: 0 }}>
            {eligibilitySummary}
          </p>
        </section>
      )}

      {/* ── Conditions ── */}
      <section style={{ marginTop: 56 }}>
        <ProseHeading>Conditions</ProseHeading>
        {conditions.length > 0 ? (
          <BulletList items={conditions} />
        ) : (
          <SectionFallback url={sourceUrl} hint="Conditions d'éligibilité non extraites de la source." />
        )}
      </section>

      {/* ── Calendrier ── */}
      <section style={{ marginTop: 56 }}>
        <ProseHeading>Calendrier</ProseHeading>
        {calendrier.length > 0 ? (
          <Timeline items={calendrier} />
        ) : (
          <CalendarFallback deadline={deadline} url={sourceUrl} />
        )}
      </section>

      {/* ── Dossier de candidature ── */}
      <section style={{ marginTop: 56 }}>
        <ProseHeading>Dossier de candidature</ProseHeading>
        {dossier.length > 0 ? (
          <BulletList items={dossier} kind="dossier" />
        ) : (
          <SectionFallback url={sourceUrl} hint="Pièces du dossier non détaillées dans la source." />
        )}
      </section>
    </>
  )
}

function NextEditionBanner({ sourceUrl }: { sourceUrl: string }) {
  let host = ''
  try { host = new URL(sourceUrl).hostname.replace(/^www\./, '') } catch {}
  return (
    <aside
      role="note"
      style={{
        marginBottom: 36,
        padding: '18px 20px',
        border: '1px solid var(--vermillion)',
        background: 'var(--paper-soft)',
        fontFamily: 'var(--font-serif)',
        fontFeatureSettings: '"onum"',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.66rem',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--vermillion)',
          marginBottom: 8,
          fontWeight: 500,
        }}
      >
        Prochaine édition · modalités à venir
      </div>
      <p style={{ fontSize: '0.96rem', lineHeight: 1.5, color: 'var(--ink)', margin: 0 }}>
        Les modalités précises de la prochaine session ne sont pas encore publiées.
        Les informations ci-dessous sont issues de la dernière édition connue.
        À vérifier sur{' '}
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="link"
          style={{ color: 'var(--ink)', fontStyle: 'italic' }}
        >
          {host || 'le site officiel'}
        </a>{' '}
        avant candidature.
      </p>
    </aside>
  )
}

function BulletList({ items, kind = 'conditions' }: { items: string[]; kind?: SectionKind }) {
  // Safeguard rendering : applique la grammaire éditoriale même si
  // l'item en DB n'a pas été passé par clampClassifyArgs (vieille opp,
  // curation manuelle non normalisée, etc.).
  const normalized = normalizeSectionList(items, kind)
  return (
    <ul style={{ margin: '0', padding: 0, listStyle: 'none' }}>
      {normalized.map((item, idx) => (
        <li
          key={idx}
          style={{
            paddingLeft: 24,
            position: 'relative',
            marginBottom: 8,
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: 8,
              color: 'var(--vermillion)',
              fontWeight: 600,
            }}
          >
            ·
          </span>
          {item}
        </li>
      ))}
    </ul>
  )
}

function Timeline({ items }: { items: string[] }) {
  // Safeguard : normalise les items selon la grammaire éditoriale.
  const normalized = normalizeSectionList(items, 'calendrier')
  // Détection du pattern Format C : cycle récurrent (Cf. classify.ts).
  // Si match → rendu en mini-table avec highlight prochaine clôture future.
  // Sinon → rendu Timeline classique (Format A : 1 étape par ligne).
  const cycle = parseRecurringCycle(normalized)
  if (cycle) return <RecurringCycleView synthesis={cycle.synthesis} deadlines={cycle.deadlines} />

  return (
    <div
      style={{
        margin: '24px 0',
        fontFamily: 'var(--font-sans)',
        fontSize: '1rem',
        lineHeight: 1.5,
      }}
    >
      {normalized.map((item, idx) => {
        // Format attendu "DATE : LABEL". On split sur le premier ":" ou "—".
        const colonIdx = item.indexOf(':')
        const hasColon = colonIdx > 0 && colonIdx < 60
        const when = hasColon ? item.slice(0, colonIdx).trim() : ''
        const what = hasColon ? item.slice(colonIdx + 1).trim() : item

        return (
          <div
            key={idx}
            style={{
              display: 'grid',
              gridTemplateColumns: when ? '160px 1fr' : '1fr',
              gap: 24,
              padding: '14px 0',
              borderBottom:
                idx === items.length - 1 ? 'none' : '1px solid var(--ink-rule)',
            }}
          >
            {when && (
              <span
                className="mono"
                style={{
                  fontSize: '0.78rem',
                  letterSpacing: '0.04em',
                  color: 'var(--ink)',
                  fontWeight: 500,
                }}
              >
                {when}
              </span>
            )}
            <span style={{ color: 'var(--ink-muted)' }}>{what}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Cycle récurrent (CNC sessions, etc.) - détection + rendu mini-table
// ─────────────────────────────────────────────────────────────────────────

interface CycleParsed {
  synthesis: string // "6 sessions par an, calendrier annuel récurrent"
  deadlines: Date[] // dates parsées dans l'ordre
}

const FR_MONTHS: Record<string, number> = {
  janvier: 0, fevrier: 1, février: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, aout: 7, août: 7, septembre: 8, octobre: 9, novembre: 10,
  decembre: 11, décembre: 11,
}

/**
 * Tente de parser une liste de dates FR séparées par virgules.
 * Ex: "30 janvier 2026, 30 mars 2026, 27 avril 2026" → 3 Date.
 * Retourne [] si format inattendu.
 */
function parseFrenchDateList(s: string): Date[] {
  const parts = s.split(/\s*,\s*/).map((p) => p.trim()).filter(Boolean)
  const dates: Date[] = []
  for (const part of parts) {
    // Pattern "DD mois YYYY" (jour optionnellement zero-paddé, mois en mots, année 4 chiffres)
    const m = part.match(/^(\d{1,2})\s+([a-zéûôîè]+)\s+(\d{4})/i)
    if (!m) continue
    const day = Number.parseInt(m[1], 10)
    const monthIdx = FR_MONTHS[m[2].toLowerCase()]
    const year = Number.parseInt(m[3], 10)
    if (monthIdx == null || Number.isNaN(day) || Number.isNaN(year)) continue
    dates.push(new Date(Date.UTC(year, monthIdx, day, 23, 59, 59)))
  }
  return dates
}

/**
 * Détecte le pattern Format C dans les items du calendrier :
 *   items[0] : "N sessions par an, calendrier annuel récurrent"
 *   items[1] : "Clôtures YYYY : date1, date2, ..."
 * Si match → retourne synthesis + deadlines parsées. Sinon null.
 */
function parseRecurringCycle(items: string[]): CycleParsed | null {
  if (items.length < 2) return null
  const synth = items[0]
  if (!/^\d+\s+sessions?\s+par\s+an/i.test(synth)) return null
  const m = items[1].match(/^Cl[ôo]tures?\s+\d{4}\s*:\s*(.+)$/i)
  if (!m) return null
  const deadlines = parseFrenchDateList(m[1])
  if (deadlines.length === 0) return null
  return { synthesis: synth, deadlines }
}

function RecurringCycleView({ synthesis, deadlines }: { synthesis: string; deadlines: Date[] }) {
  const now = Date.now()
  // Index de la prochaine clôture future (la 1ère >= now)
  const nextIdx = deadlines.findIndex((d) => d.getTime() >= now)

  return (
    <div style={{ margin: '24px 0' }}>
      {/* Synthèse en haut, ton éditorial sobre */}
      <div
        className="serif"
        style={{
          fontSize: '0.95rem',
          color: 'var(--ink-muted)',
          marginBottom: 16,
          fontStyle: 'italic',
        }}
      >
        {synthesis}
      </div>

      {/* Mini-table sessions */}
      <div
        className="session-mini-table"
        style={{
          display: 'grid',
          gridTemplateColumns: '64px 1fr 100px',
          gap: '0 16px',
          fontFamily: 'var(--font-sans)',
          fontSize: '0.95rem',
          border: '1px solid var(--ink-rule)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={cellHeaderStyle}>Session</div>
        <div style={cellHeaderStyle}>Date limite de dépôt</div>
        <div style={{ ...cellHeaderStyle, textAlign: 'right' }}>État</div>

        {deadlines.map((d, idx) => {
          const isPast = d.getTime() < now
          const isNext = idx === nextIdx
          const stateLabel = isPast
            ? 'passée'
            : isNext
              ? 'prochaine'
              : 'à venir'
          return (
            <RowFragment
              key={idx}
              num={idx + 1}
              date={d}
              state={stateLabel}
              isPast={isPast}
              isNext={isNext}
              isLast={idx === deadlines.length - 1}
            />
          )
        })}
      </div>

      {nextIdx === -1 && (
        <div
          style={{
            marginTop: 14,
            fontSize: '0.85rem',
            color: 'var(--ink-soft)',
            fontStyle: 'italic',
          }}
        >
          Toutes les sessions {deadlines[0]?.getUTCFullYear() ?? ''} sont passées. Le calendrier de l&apos;année suivante sera publié par l&apos;émetteur.
        </div>
      )}
    </div>
  )
}

function RowFragment({
  num,
  date,
  state,
  isPast,
  isNext,
  isLast,
}: {
  num: number
  date: Date
  state: string
  isPast: boolean
  isNext: boolean
  isLast: boolean
}) {
  const cellBase: React.CSSProperties = {
    padding: '12px 16px',
    borderBottom: isLast ? 'none' : '1px solid var(--ink-rule)',
    background: isNext ? 'rgba(200, 54, 43, 0.05)' : 'transparent',
    color: isPast ? 'var(--ink-soft)' : 'var(--ink)',
    textDecoration: isPast ? 'line-through' : 'none',
  }
  const numStyle: React.CSSProperties = {
    ...cellBase,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.78rem',
    color: isNext ? 'var(--vermillion)' : isPast ? 'var(--ink-soft)' : 'var(--ink-muted)',
    fontWeight: 500,
    letterSpacing: '0.04em',
    textDecoration: 'none',
  }
  const dateStyle: React.CSSProperties = {
    ...cellBase,
    fontWeight: isNext ? 500 : 400,
    color: isNext ? 'var(--vermillion)' : isPast ? 'var(--ink-soft)' : 'var(--ink)',
  }
  const stateStyle: React.CSSProperties = {
    ...cellBase,
    textAlign: 'right',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: isNext ? 'var(--vermillion)' : 'var(--ink-soft)',
    textDecoration: 'none',
    fontWeight: 500,
  }
  return (
    <>
      <div style={numStyle}>#{num.toString().padStart(2, '0')}</div>
      <div style={dateStyle}>{formatLongFr(date)}</div>
      <div style={stateStyle}>{state}</div>
    </>
  )
}

const cellHeaderStyle: React.CSSProperties = {
  padding: '10px 16px',
  background: 'var(--paper-soft)',
  borderBottom: '1px solid var(--ink-rule)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--ink-soft)',
}

function formatLongFr(d: Date): string {
  const monthsLong = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
  return `${d.getUTCDate()} ${monthsLong[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function CalendarFallback({
  deadline,
  url,
}: {
  deadline: Date | null
  url: string
}) {
  return (
    <>
      {deadline && (
        <Timeline
          items={[`${formatShortDate(deadline)} : clôture des candidatures`]}
        />
      )}
      <p
        style={{
          marginTop: deadline ? 18 : 0,
          color: 'var(--ink-muted)',
          fontStyle: 'italic',
          fontSize: '0.96rem',
        }}
      >
        Sélection, audition et démarrage : à consulter sur le{' '}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer external"
          style={{
            color: 'var(--vermillion)',
            borderBottom: '1px solid var(--vermillion)',
            paddingBottom: 1,
          }}
        >
          règlement officiel
        </a>
        .
      </p>
    </>
  )
}

function SectionFallback({ url, hint }: { url: string; hint: string }) {
  return (
    <p
      style={{
        color: 'var(--ink-muted)',
        fontStyle: 'italic',
        fontSize: '0.96rem',
      }}
    >
      {hint} Voir le{' '}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer external"
        style={{
          color: 'var(--vermillion)',
          borderBottom: '1px solid var(--vermillion)',
          paddingBottom: 1,
        }}
      >
        règlement officiel
      </a>{' '}
      pour le détail complet.
    </p>
  )
}

function parseParagraphs(description: string): string[] {
  return description
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function ArchiveSummary({
  description,
  typeLabel,
}: {
  description: string | null
  typeLabel: string
}) {
  if (!description) {
    return (
      <p style={{ marginTop: 0 }}>
        Pour mémoire : ce cycle de {typeLabel.toLowerCase()} est archivé. Le
        prochain appel sera publié à cette même adresse dès son annonce par
        l&apos;émetteur.
      </p>
    )
  }
  const summary = description.split(/\n{2,}/)[0]?.slice(0, 400) ?? description.slice(0, 400)
  return (
    <p style={{ marginTop: 0 }}>
      Pour mémoire :{' '}
      {summary}
      {description.length > 400 && '…'}
    </p>
  )
}

function ProseHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mono"
      style={{
        marginTop: 0,
        marginBottom: 18,
        fontSize: '0.78rem',
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: 'var(--vermillion)',
        paddingBottom: 8,
        borderBottom: '1px solid var(--ink)',
      }}
    >
      {children}
    </h2>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const btnPrimaryStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.82rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  padding: '16px 26px',
  border: '1px solid var(--vermillion)',
  background: 'var(--vermillion)',
  color: 'var(--paper)',
  textDecoration: 'none',
  display: 'inline-block',
  transition: 'background 140ms var(--ease-out), transform 100ms var(--ease-out)',
}

const btnSecondaryStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.82rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  padding: '16px 26px',
  border: '1px solid var(--ink)',
  background: 'transparent',
  color: 'var(--ink)',
  textDecoration: 'none',
  display: 'inline-block',
  transition: 'background 140ms var(--ease-out), color 140ms var(--ease-out), transform 100ms var(--ease-out)',
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatShortDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const year = d.getUTCFullYear()
  return `${day}.${month}.${year}`
}

function formatGeoLabel(geoScope: string, regionCode: string | null): string {
  if (regionCode) return labelForRegion(regionCode) ?? regionCode
  switch (geoScope as GeoScope) {
    case 'local':
      return 'Local'
    case 'regional':
      return 'Régional'
    case 'national':
      return 'France'
    case 'metropole':
      return 'Métropole'
    case 'europe':
      return 'Europe'
    case 'international':
      return 'International'
    default:
      return 'France'
  }
}

function geoSubLabel(regionCode: string | null, geoScope: string): string | undefined {
  if (regionCode) {
    return geoScope === 'regional' ? 'région' : undefined
  }
  if (geoScope === 'national') return 'tous territoires'
  return undefined
}

function formatAudience(audience: string[] | null): string {
  if (!audience || audience.length === 0) return 'Tous publics'
  const labels: Record<string, string> = {
    individuel: 'Artistes individuels',
    compagnie: 'Compagnies',
    association: 'Associations',
    collectif: 'Collectifs',
    etudiant: 'Étudiants',
    emergent: 'Émergents',
    etabli: 'Établis',
  }
  const mapped = audience.map((a) => labels[a] ?? a)
  if (mapped.length === 1) return mapped[0]
  if (mapped.length === 2) return mapped.join(', ')
  return `${mapped[0]} +${mapped.length - 1}`
}

function shortSource(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname.replace(/^www\./, '')}/…`
  } catch {
    return url.slice(0, 24) + '…'
  }
}
