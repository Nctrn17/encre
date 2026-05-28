import { Suspense } from 'react'
import Link from 'next/link'
import type { Metadata } from 'next'
import { listOpportunities } from '@/features/opportunities/queries'
import { OpportunityFiltersBar } from '@/components/opportunities/OpportunityFiltersBar'
import { OpportunitySearchInput } from '@/components/opportunities/SearchInput'
import type { Opportunity } from '@/lib/supabase/types'
import { labelForRegion } from '@/lib/region-codes'
import { PILOT_SCENARISTE_TAGS, LISTING_DEFAULT_EXCLUDE_TAGS } from '@/lib/pilot-defaults'
import { absoluteUrl } from '@/lib/site'
import { logSearchQuery } from '@/features/search/log'

/**
 * Encre · liste des opportunités.
 * Port du mockup mockups/v10-opportunites-v2.html avec data dynamiques.
 *
 * Layout : sidebar 220px (filtres URL-piloted) + main (list-head + liste plate
 * triée par deadline + pagination). Pas de hero, pas de strip, pas de groupes
 * de bucket - la liste est dominante visuellement.
 */

// Rendu dynamique : total + liste lus en live (cohérence avec le compteur
// de la landing, et la page varie déjà selon les searchParams/filtres).
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams
  const pageNum = Number.parseInt(params.page ?? '1', 10)
  const isPaginated = Number.isFinite(pageNum) && pageNum > 1
  const year = new Date().getUTCFullYear()

  const baseTitle = `Bourses et résidences d'écriture ${year} · le registre`
  return {
    title: isPaginated ? `${baseTitle} · page ${pageNum}` : baseTitle,
    description: `Bourses, résidences d'écriture, appels à projets et prix pour scénaristes et auteurs. Liste complète des aides ouvertes en ${year}, classée par date limite. Mise à jour quotidienne.`,
    alternates: { canonical: '/aides' },
    robots: isPaginated
      ? { index: false, follow: true }
      : { index: true, follow: true },
    openGraph: {
      title: baseTitle,
      description:
        "Toutes les bourses et résidences d'écriture ouvertes à candidature. Filtrage par type, discipline et région.",
      type: 'website',
      url: '/aides',
    },
  }
}

interface PageProps {
  searchParams: Promise<{
    type?: string | string[]
    tag?: string | string[]
    discipline?: string | string[]
    region?: string | string[]
    d?: string
    np?: string
    ne?: string
    pp?: string
    q?: string
    page?: string
  }>
}

export default async function OpportunitesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = Number.parseInt(params.page ?? '1', 10)
  const limit = 40
  const offset = (page - 1) * limit

  const userTypes = toArray(params.type)
  const userTags = toArray(params.tag)
  const userRegions = toArray(params.region)
  const userDisciplineMacro = toArray(params.discipline)
  const deadlineBucket = params.d ?? null
  // V1 launch (cible : jeunes auteurs hors-réseau) - par défaut on filtre
  // les opps qui requièrent un producteur ou un éditeur, structurellement
  // hors cible. URL `?np=0` ou `?ne=0` permet d'opt-out du filtre pour
  // les rares users qui ont ces relations professionnelles établies.
  const sansProducteur = params.np !== '0'
  const sansEditeur = params.ne !== '0'
  const premierProjet = params.pp === '1'
  const search = params.q ?? null
  const pilotBypass = userDisciplineMacro.includes('all')

  // V1 scope = scénaristes/auteurs AV. PILOT_SCENARISTE_TAGS appliqué par
  // défaut, sauf si l'utilisateur sélectionne explicitement des tags
  // (alors on respecte sa sélection) ou bypass via ?discipline=all.
  const disciplinesTagsAny =
    userTags.length > 0
      ? userTags
      : pilotBypass
        ? undefined
        : [...PILOT_SCENARISTE_TAGS]

  const { items, total } = await listOpportunities({
    types: userTypes.length > 0 ? userTypes : undefined,
    disciplinesTagsAny,
    // Exclusions par défaut du listing (source unique partagée avec le
    // compteur de la home - cf. LISTING_DEFAULT_EXCLUDE_TAGS).
    // Bypass via ?discipline=all pour voir le catalogue complet.
    disciplinesTagsExclude: pilotBypass
      ? undefined
      : [...LISTING_DEFAULT_EXCLUDE_TAGS],
    disciplines:
      pilotBypass && userDisciplineMacro.filter((d) => d !== 'all').length > 0
        ? userDisciplineMacro.filter((d) => d !== 'all')
        : undefined,
    regionCodes: userRegions.length > 0 ? userRegions : undefined,
    search,
    limit,
    offset,
    includeExpired: false, // liste = uniquement opps ouvertes
  })

  // Filtrage post-fetch sur deadline + flags pilote
  const filtered = applyClientFilters(items, {
    deadlineBucket,
    sansProducteur,
    sansEditeur,
    premierProjet,
  })

  const filteredTotal = filtered.length
  const totalPages = Math.ceil(total / limit)
  const lastUpdate = items[0]?.updated_at
    ? formatLastUpdate(new Date(items[0].updated_at))
    : null

  await logSearchQuery({
    query: search,
    resultCount: filteredTotal,
    filters: {
      type: userTypes,
      tag: userTags,
      discipline: userDisciplineMacro,
      region: userRegions,
      deadlineBucket,
      sansProducteur,
      sansEditeur,
      premierProjet,
      page,
    },
  })

  const listJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: "Le registre des aides à l'écriture · Encre",
    url: absoluteUrl('/aides'),
    numberOfItems: total,
    itemListElement: filtered.slice(0, 50).map((opp, i) => ({
      '@type': 'ListItem',
      position: offset + i + 1,
      url: absoluteUrl(`/aides/${opp.slug}`),
      name: opp.title,
    })),
  }

  return (
    <div className="opp-list-wrap">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(listJsonLd) }}
      />
      <main>
        <Suspense fallback={null}>
          <OpportunitySearchInput initialQuery={search ?? ''} />
        </Suspense>

        <Suspense fallback={null}>
          <OpportunityFiltersBar
            types={userTypes}
            disciplinesTags={userTags}
            sansProducteur={sansProducteur}
            sansEditeur={sansEditeur}
            premierProjet={premierProjet}
            deadlineBucket={deadlineBucket}
            regionCodes={userRegions}
          />
        </Suspense>

        <ListHead
          shown={filteredTotal}
          total={total}
          lastUpdate={lastUpdate}
        />

        {filteredTotal === 0 ? (
          <EmptyState activeQuery={search} />
        ) : (
          <ol style={oppListStyle}>
            {filtered.map((opp, idx) => (
              <OppRow
                key={opp.id}
                opp={opp}
                num={total - offset - idx}
              />
            ))}
          </ol>
        )}

        {totalPages > 1 && (
          <Pagination page={page} totalPages={totalPages} />
        )}
      </main>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function ListHead({
  shown,
  total,
  lastUpdate,
}: {
  shown: number
  total: number
  lastUpdate: string | null
}) {
  return (
    <div style={listHeadStyle}>
      <div style={listHeadRowStyle}>
        <div>
          <h1 style={listTitleStyle}>
            Le registre{' '}
            <span style={{ color: 'var(--vermillion)' }}>
              · {total}
            </span>
          </h1>
          <div style={listMetaStyle}>
            Tous métiers de l&apos;écriture
            <span style={pipeStyle}>·</span>
            {shown} sur {total} affichée{total > 1 ? 's' : ''}
            {lastUpdate && (
              <>
                <span style={pipeStyle}>·</span>
                {lastUpdate}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function OppRow({ opp, num }: { opp: Opportunity; num: number }) {
  const daysLeft = opp.deadline ? daysUntil(opp.deadline) : null
  const urgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30
  const typeShort = TYPE_LABEL_SHORT[opp.type] ?? opp.type
  const amount = formatAmountShort(opp)
  const portee = formatPortee(opp)
  const audience = formatAudienceShort(opp.audience)
  const sourceShort = shortSource(opp.source_url)

  return (
    <li style={oppRowStyle} className="opp-row">
      <Link
        href={`/aides/${opp.slug}`}
        style={oppRowLinkStyle}
        className="opp-row-link"
      >
        <div style={oppNumStyle}>#{num}</div>

        <div style={oppBodyStyle}>
          <div style={oppMetaTopStyle}>
            <span style={oppTypeStyle}>{typeShort}</span>
            <span style={oppEmitterStyle}>{shortEmitter(opp.emitter)}</span>
          </div>
          <span style={oppTitleStyle} className="opp-row-title">
            {opp.title}
          </span>
          <div style={oppFootStyle}>
            {amount && <span>{amount}</span>}
            <span>{portee}</span>
            {audience && <span>{audience}</span>}
            <span style={oppSourceStyle}>→ {sourceShort}</span>
          </div>
        </div>

        <div style={oppDeadlineStyle}>
          <span
            style={{
              ...oppDeadlineWhenStyle,
              color: urgent ? 'var(--vermillion)' : 'var(--ink)',
            }}
          >
            {opp.deadline ? formatShortDate(opp.deadline) : 'Rolling'}
          </span>
          <span style={oppDeadlineLabelStyle}>
            {opp.deadline
              ? daysLeft === 0
                ? "aujourd'hui"
                : daysLeft === 1
                  ? 'demain'
                  : `dans ${daysLeft} j`
              : 'voir source'}
          </span>
        </div>
      </Link>
    </li>
  )
}

function EmptyState({ activeQuery }: { activeQuery: string | null }) {
  const trimmed = activeQuery?.trim()
  return (
    <div style={emptyStyle}>
      <div style={emptyLabelStyle}>Aucune entrée</div>
      <p style={emptyBodyStyle}>
        {trimmed ? (
          <>
            Aucune opportunité ne correspond à{' '}
            <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>
              «&nbsp;{trimmed}&nbsp;»
            </strong>{' '}
            avec les filtres actifs.{' '}
          </>
        ) : (
          <>Aucune opportunité ne correspond aux filtres actifs. </>
        )}
        <Link
          href="/aides"
          style={{
            color: 'var(--vermillion)',
            borderBottom: '1px solid var(--vermillion)',
            paddingBottom: 1,
          }}
        >
          Tout effacer →
        </Link>
      </p>
    </div>
  )
}

function Pagination({
  page,
  totalPages,
}: {
  page: number
  totalPages: number
}) {
  return (
    <nav style={paginationStyle}>
      <span>
        Page {page} sur {totalPages}
      </span>
      <div style={{ display: 'flex', gap: 14 }}>
        {page > 1 && (
          <Link
            href={`?page=${page - 1}`}
            style={paginationLinkStyle}
          >
            ← Précédent
          </Link>
        )}
        {page < totalPages && (
          <Link
            href={`?page=${page + 1}`}
            style={paginationLinkStyle}
          >
            Suivant →
          </Link>
        )}
      </div>
    </nav>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (data)
// ─────────────────────────────────────────────────────────────────────────────

function applyClientFilters(
  items: Opportunity[],
  opts: {
    deadlineBucket: string | null
    sansProducteur: boolean
    sansEditeur: boolean
    premierProjet: boolean
  },
): Opportunity[] {
  let out = items.slice()

  // Filtre par bucket d'échéance (post-fetch - on a déjà includeExpired=false)
  if (opts.deadlineBucket) {
    const now = Date.now()
    out = out.filter((o) => {
      if (!o.deadline) return opts.deadlineBucket === 'later'
      const days = Math.ceil(
        (new Date(o.deadline).getTime() - now) / (1000 * 60 * 60 * 24),
      )
      if (opts.deadlineBucket === '15') return days >= 0 && days <= 15
      if (opts.deadlineBucket === '30') return days >= 0 && days <= 30
      if (opts.deadlineBucket === '90') return days >= 0 && days <= 90
      return true
    })
  }

  if (opts.sansProducteur) {
    out = out.filter(
      (o) =>
        !(o as unknown as { requires_producer?: boolean }).requires_producer,
    )
  }

  if (opts.sansEditeur) {
    out = out.filter(
      (o) =>
        !(o as unknown as { requires_editor?: boolean }).requires_editor,
    )
  }

  if (opts.premierProjet) {
    out = out.filter((o) => {
      const v = (o as unknown as { min_films_produits?: number | null })
        .min_films_produits
      return v === 0 || v === null || v === undefined
    })
  }

  // Tri par deadline ASC (nulls last)
  out.sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0
    if (!a.deadline) return 1
    if (!b.deadline) return -1
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
  })

  return out
}

function toArray(v: string | string[] | undefined): string[] {
  if (!v) return []
  return Array.isArray(v) ? v : v.split(',').filter(Boolean)
}

function daysUntil(iso: string): number {
  return Math.ceil(
    (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  )
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const year = d.getUTCFullYear()
  return `${day}.${month}.${year}`
}

function formatLastUpdate(d: Date): string {
  const months = [
    'jan',
    'fév',
    'mars',
    'avr',
    'mai',
    'juin',
    'juil',
    'août',
    'sept',
    'oct',
    'nov',
    'déc',
  ]
  return `Mis à jour ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function formatPortee(opp: Opportunity): string {
  if (opp.region_code) return labelForRegion(opp.region_code) ?? opp.region_code
  switch (opp.geo_scope) {
    case 'national':
    case 'metropole':
      return 'National'
    case 'regional':
      return 'Régional'
    case 'local':
      return 'Local'
    case 'europe':
      return 'Europe'
    case 'international':
      return 'International'
    default:
      return 'National'
  }
}

function shortEmitter(emitter: string | null | undefined): string {
  if (!emitter) return 'Émetteur'
  const map: Record<string, string> = {
    'SCAM - Société civile des auteurs multimédia': 'SCAM',
    'Association Beaumarchais-SACD': 'Beaumarchais · SACD',
    'Région Île-de-France': 'Région IDF',
    'ALCA Nouvelle-Aquitaine': 'ALCA',
    'Auvergne-Rhône-Alpes Cinéma': 'AuRA Cinéma',
    'PictanovO (Hauts-de-France)': 'PictanovO',
    "Moulin d'Andé - CÉCI": "Moulin d'Andé",
  }
  return map[emitter] ?? emitter
}

function formatAmountShort(opp: Opportunity): string | null {
  if (opp.amount_max && opp.amount_min && opp.amount_max !== opp.amount_min) {
    return `${formatNumber(opp.amount_min)} à ${formatNumber(opp.amount_max)} €`
  }
  if (opp.amount_max) return `${formatNumber(opp.amount_max)} €`
  if (opp.amount_min) return `${formatNumber(opp.amount_min)} €`
  return null
}

function formatNumber(n: number): string {
  return n.toLocaleString('fr-FR')
}

function formatAudienceShort(audience: string[] | null | undefined): string | null {
  if (!audience || audience.length === 0) return null
  const labels: Record<string, string> = {
    individuel: 'Individuels',
    compagnie: 'Compagnies',
    association: 'Associations',
    collectif: 'Collectifs',
    etudiant: 'Étudiants',
    emergent: 'Émergents',
    etabli: 'Établis',
  }
  return labels[audience[0]] ?? audience[0]
}

function shortSource(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname.replace(/^www\./, '')}/…`
  } catch {
    return url.slice(0, 24) + '…'
  }
}

const TYPE_LABEL_SHORT: Record<string, string> = {
  bourse: 'Bourse',
  residence: 'Résidence',
  prix: 'Prix',
  appel_a_projets: 'Appel',
  subvention: 'Aide',
  concours: 'Concours',
  commande: 'Commande',
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles inline
// ─────────────────────────────────────────────────────────────────────────────

const listHeadStyle: React.CSSProperties = {
  paddingBottom: 24,
  marginBottom: 8,
  borderBottom: '2px solid var(--ink)',
}

const listHeadRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 24,
  flexWrap: 'wrap',
}

const listTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 'clamp(1.8rem, 2.6vw, 2.2rem)',
  fontWeight: 600,
  letterSpacing: '-0.018em',
  lineHeight: 1.1,
  color: 'var(--ink)',
}

const listMetaStyle: React.CSSProperties = {
  marginTop: 10,
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--ink-soft)',
}

const pipeStyle: React.CSSProperties = {
  color: 'var(--ink-rule)',
  margin: '0 8px',
}

const oppListStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
}

const oppRowStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--ink-rule)',
}

const oppRowLinkStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '56px 1fr 140px',
  gap: '12px 28px',
  alignItems: 'baseline',
  padding: '26px 0',
  textDecoration: 'none',
  color: 'inherit',
  background: 'transparent',
  transition: 'background 140ms var(--ease-out), padding 140ms var(--ease-out)',
}

const oppNumStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  color: 'var(--ink-soft)',
  letterSpacing: '0.04em',
}

const oppBodyStyle: React.CSSProperties = {
  minWidth: 0,
}

const oppMetaTopStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 14,
  marginBottom: 8,
}

const oppTypeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--vermillion)',
  fontWeight: 500,
}

const oppEmitterStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.7rem',
  letterSpacing: '0.04em',
  color: 'var(--ink-muted)',
  textTransform: 'uppercase',
}

const oppTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontWeight: 600,
  fontSize: '1.4rem',
  lineHeight: 1.22,
  letterSpacing: '-0.008em',
  color: 'var(--ink)',
  display: 'inline',
  backgroundImage:
    'linear-gradient(var(--vermillion), var(--vermillion))',
  backgroundSize: '0% 1.5px',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: '0 100%',
  transition:
    'background-size 220ms var(--ease-out), color 160ms var(--ease-out)',
}

const oppFootStyle: React.CSSProperties = {
  marginTop: 12,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 14,
  fontFamily: 'var(--font-sans)',
  fontSize: '0.86rem',
  color: 'var(--ink-muted)',
  alignItems: 'baseline',
}

const oppSourceStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.72rem',
  color: 'var(--ink-soft)',
}

const oppDeadlineStyle: React.CSSProperties = {
  textAlign: 'right',
  fontFamily: 'var(--font-mono)',
}

const oppDeadlineWhenStyle: React.CSSProperties = {
  fontSize: '0.84rem',
  letterSpacing: '0.04em',
  fontWeight: 500,
}

const oppDeadlineLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.68rem',
  color: 'var(--ink-soft)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginTop: 4,
}

const emptyStyle: React.CSSProperties = {
  padding: '48px 32px',
  border: '1px solid var(--ink-rule)',
  background: 'var(--paper-soft)',
}

const emptyLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--ink-muted)',
  marginBottom: 12,
}

const emptyBodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: '1rem',
  color: 'var(--ink-muted)',
  lineHeight: 1.55,
}

const paginationStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingTop: 36,
  fontFamily: 'var(--font-mono)',
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--ink-soft)',
}

const paginationLinkStyle: React.CSSProperties = {
  color: 'var(--ink)',
  borderBottom: '1px solid var(--vermillion)',
  paddingBottom: 2,
  fontFamily: 'var(--font-mono)',
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}
