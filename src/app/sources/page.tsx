import Link from 'next/link'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/server'
import {
  SOURCE_CATEGORY_LABELS,
  SOURCE_CATEGORY_ORDER,
  categorizeSource,
  defaultSourceDescription,
  sourceHostname,
  type SourceCategory,
} from '@/lib/source-categories'

/**
 * Encre · page transparence des sources.
 * Port du mockup mockups/v8-sources.html avec data dynamiques depuis la
 * table `sources` (catégorisation éditoriale via lib/source-categories).
 */

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Sources',
  description:
    "Les émetteurs publics et privés qu'Encre suit aujourd'hui. Transparence sur la base, méthode de collecte par source, comptage des opportunités identifiées.",
}

interface SourceRow {
  id: string
  slug: string
  name: string
  kind: string
  config: Record<string, unknown> | null
  is_active: boolean
  last_run_at: string | null
}

interface SourceWithCount extends SourceRow {
  category: SourceCategory
  count: number
  hostname: string | null
  description: string
}

const SCRAPER_KIND_LABEL: Record<string, string> = {
  api: 'API',
  rss: 'flux RSS',
  html: 'page HTML',
  email: 'newsletter',
  manual: 'saisie manuelle',
}

export default async function SourcesPage() {
  const supabase = createPublicClient()

  const [{ data: sourcesRaw }, { data: oppsRaw }] = await Promise.all([
    supabase
      .from('sources')
      .select('id, slug, name, kind, config, is_active, last_run_at')
      .eq('is_active', true)
      .neq('kind', 'manual')
      .order('name', { ascending: true }),
    supabase
      .from('opportunities')
      .select('emitter_slug')
      .eq('is_published', true)
      .eq('human_review', false),
  ])

  const sources = (sourcesRaw ?? []) as SourceRow[]
  const opps = (oppsRaw ?? []) as Array<{ emitter_slug: string }>

  // Count opps par emitter_slug (canonical)
  const countsByEmitter = new Map<string, number>()
  for (const o of opps) {
    countsByEmitter.set(o.emitter_slug, (countsByEmitter.get(o.emitter_slug) ?? 0) + 1)
  }

  // Hydrate sources : count + catégorie + hostname + description
  const enriched: SourceWithCount[] = sources.map((s) => ({
    ...s,
    category: categorizeSource(s.slug),
    count: lookupCount(s.slug, countsByEmitter),
    hostname: sourceHostname(s.config),
    description:
      ((s.config as Record<string, unknown> | null)?.description as string | undefined) ??
      defaultSourceDescription(s.name, s.kind),
  }))

  // Group by category
  const byCategory = new Map<SourceCategory, SourceWithCount[]>()
  for (const s of enriched) {
    const list = byCategory.get(s.category) ?? []
    list.push(s)
    byCategory.set(s.category, list)
  }

  const totalSources = enriched.length
  const totalOpps = opps.length

  return (
    <div className="max-w-[1100px] mx-auto px-5 sm:px-8">
      {/* ─── TITLE BLOCK ───────────────────────────────── */}
      <div style={{ padding: '64px 0 40px' }}>
        <div
          className="mono"
          style={{
            fontSize: '0.74rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--vermillion)',
            marginBottom: 18,
          }}
        >
          Transparence
        </div>
        <h1
          className="serif"
          style={{
            fontSize: 'clamp(2.6rem, 5vw, 3.8rem)',
            fontWeight: 600,
            letterSpacing: '-0.025em',
            lineHeight: 1.05,
            color: 'var(--ink)',
            marginBottom: 22,
          }}
        >
          Sources<span style={{ color: 'var(--vermillion)' }}>.</span>
        </h1>
        <p
          className="serif"
          style={{
            fontSize: '1.18rem',
            lineHeight: 1.55,
            color: 'var(--ink-muted)',
            maxWidth: '60ch',
            marginBottom: 28,
          }}
        >
          Les <strong style={{ color: 'var(--ink)' }}>{totalSources}</strong>{' '}
          organismes qui financent l&apos;écriture en France et qu&apos;Encre
          suit aujourd&apos;hui. La liste est ouverte : si vous pensez
          qu&apos;une source manque,{' '}
          <a
            href="/contact"
            style={{
              color: 'var(--vermillion)',
              borderBottom: '1px solid var(--vermillion)',
              paddingBottom: 1,
            }}
          >
            écrivez-nous
          </a>
          .
        </p>
        <div
          className="mono"
          style={{
            fontSize: '0.74rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--ink-soft)',
          }}
        >
          <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>{totalSources}</strong>{' '}
          émetteurs actifs
          <span style={metaPipeStyle}>·</span>
          <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>{totalOpps}</strong>{' '}
          opportunités en base, toutes disciplines
          <span style={metaPipeStyle}>·</span>
          mise à jour quotidienne
        </div>
      </div>

      {/* ─── CATEGORIES ───────────────────────────────── */}
      {SOURCE_CATEGORY_ORDER.map((cat) => {
        const sourcesInCat = byCategory.get(cat) ?? []
        if (sourcesInCat.length === 0) return null

        return (
          <CategoryBlock
            key={cat}
            title={SOURCE_CATEGORY_LABELS[cat]}
            count={sourcesInCat.length}
          >
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {sourcesInCat.map((s) => (
                <SourceRowComponent key={s.id} source={s} />
              ))}
            </ul>
          </CategoryBlock>
        )
      })}

      {/* ─── DISCLAIMER FIN ──────────────────────────── */}
      <div style={{ padding: '64px 0 96px' }}>
        <div
          className="serif"
          style={{
            fontStyle: 'italic',
            color: 'var(--ink-muted)',
            fontSize: '1rem',
            lineHeight: 1.55,
            maxWidth: '60ch',
          }}
        >
          Encre n&apos;est affilié à aucun de ces organismes. Chaque fiche
          publiée renvoie à la source officielle de l&apos;émetteur, qui reste
          la seule source faisant foi.
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function CategoryBlock({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section style={{ padding: '40px 0', borderTop: '1px solid var(--ink-rule)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 16,
          paddingBottom: 18,
          marginBottom: 8,
          borderBottom: '2px solid var(--ink)',
        }}
      >
        <h2
          className="serif"
          style={{
            fontSize: '1.6rem',
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: 'var(--ink)',
          }}
        >
          {title}
        </h2>
        <span
          className="mono"
          style={{
            fontSize: '0.74rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--ink-soft)',
          }}
        >
          {count} source{count > 1 ? 's' : ''}
        </span>
      </div>
      {children}
    </section>
  )
}

function SourceRowComponent({ source }: { source: SourceWithCount }) {
  const lastRun = source.last_run_at ? formatRelative(new Date(source.last_run_at)) : null

  return (
    <li
      className="sources-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 140px',
        gap: 28,
        padding: '22px 0',
        borderBottom: '1px solid var(--ink-rule)',
        alignItems: 'baseline',
      }}
    >
      <div>
        <Link
          href={`/sources/${source.slug}`}
          className="serif"
          style={{
            display: 'inline-block',
            fontSize: '1.2rem',
            fontWeight: 600,
            color: 'var(--ink)',
            letterSpacing: '-0.005em',
            marginBottom: 6,
            textDecoration: 'none',
            backgroundImage:
              'linear-gradient(var(--vermillion), var(--vermillion))',
            backgroundSize: '0% 1.5px',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: '0 100%',
            transition: 'background-size 220ms var(--ease-out)',
          }}
        >
          {source.name}
        </Link>
        <p
          style={{
            fontSize: '0.96rem',
            lineHeight: 1.55,
            color: 'var(--ink-muted)',
            marginBottom: 8,
            maxWidth: '62ch',
          }}
        >
          {source.description}
        </p>
        <div
          className="mono"
          style={{
            fontSize: '0.72rem',
            letterSpacing: '0.04em',
            color: 'var(--ink-soft)',
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          {source.hostname && (
            <a
              href={`https://${source.hostname}/`}
              target="_blank"
              rel="noopener noreferrer external"
              style={{
                color: 'var(--ink)',
                borderBottom: '1px solid var(--ink-rule)',
                paddingBottom: 1,
                transition:
                  'color 160ms var(--ease-out), border-color 160ms var(--ease-out)',
              }}
            >
              {source.hostname}
            </a>
          )}
          <span>{SCRAPER_KIND_LABEL[source.kind] ?? source.kind}</span>
        </div>
      </div>

      <div className="mono" style={{ textAlign: 'right' }}>
        <span
          className="serif"
          style={{
            fontSize: '1.6rem',
            fontWeight: 600,
            color: source.count === 0 ? 'var(--ink-soft)' : 'var(--ink)',
            letterSpacing: '-0.02em',
            display: 'block',
            lineHeight: 1,
            marginBottom: 4,
          }}
        >
          {source.count}
        </span>
        <span
          style={{
            display: 'block',
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--ink-soft)',
            marginBottom: 6,
          }}
        >
          ouverte{source.count > 1 ? 's' : ''}
        </span>
        {lastRun && (
          <span
            style={{
              display: 'block',
              fontSize: '0.66rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--ink-soft)',
              opacity: 0.75,
            }}
          >
            maj {lastRun}
          </span>
        )}
      </div>
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const metaPipeStyle: React.CSSProperties = {
  color: 'var(--ink-rule)',
  margin: '0 8px',
}

/**
 * Cherche le count d'opps pour une source donnée. Convention :
 * - exact match `source.slug == emitter_slug`
 * - sinon strip suffixes communs (`-residences`, `-appels`, `-culture`, etc.)
 *   et retest
 * - sinon 0 (la source est listée mais sans matching)
 */
function lookupCount(sourceSlug: string, counts: Map<string, number>): number {
  if (counts.has(sourceSlug)) return counts.get(sourceSlug)!
  const cleaned = sourceSlug.replace(
    /-(residences|appels|aides|culture|scenario|junior|fr|brouillon-reve|emergence)$/,
    '',
  )
  if (counts.has(cleaned)) return counts.get(cleaned)!
  return 0
}

/**
 * Format relatif court : "il y a 6 h", "il y a 24 h", "il y a 3 j".
 */
function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime()
  const hours = Math.floor(ms / (1000 * 60 * 60))
  if (hours < 1) return "il y a moins d'1 h"
  if (hours < 48) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  return `il y a ${days} j`
}
