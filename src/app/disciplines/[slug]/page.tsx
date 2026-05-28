import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { listOpportunities } from '@/features/opportunities/queries'
import { OpportunityCard } from '@/components/opportunities/OpportunityCard'
import {
  DISCIPLINE_SLUGS,
  DISCIPLINE_LABELS,
  DISCIPLINE_DESCRIPTIONS,
  type DisciplineSlug,
} from '@/lib/discipline-taxonomy'

export const revalidate = 1800

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return DISCIPLINE_SLUGS.map((slug) => ({ slug: slug.replace(/_/g, '-') }))
}

function normalizeSlug(raw: string): DisciplineSlug | null {
  const candidate = raw.replace(/-/g, '_')
  if (DISCIPLINE_SLUGS.includes(candidate as DisciplineSlug)) {
    return candidate as DisciplineSlug
  }
  return null
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: rawSlug } = await params
  const slug = normalizeSlug(rawSlug)
  if (!slug) return {}
  const label = DISCIPLINE_LABELS[slug]
  const desc = DISCIPLINE_DESCRIPTIONS[slug]
  const path = `/disciplines/${rawSlug}`
  return {
    title: `${label} · appels à projets et résidences`,
    description: desc,
    alternates: { canonical: path },
    openGraph: {
      title: `${label} · Encre`,
      description: desc,
      type: 'website',
      url: path,
    },
  }
}

export default async function DisciplineHubPage({ params }: PageProps) {
  const { slug: rawSlug } = await params
  const slug = normalizeSlug(rawSlug)
  if (!slug) notFound()

  const { items, total } = await listOpportunities({
    disciplines: [slug],
    limit: 30,
  })

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <header className="mb-10 max-w-3xl">
        <div className="text-sm text-muted mb-2">Discipline</div>
        <h1 className="font-serif mb-4">{DISCIPLINE_LABELS[slug]}</h1>
        <p className="text-muted leading-relaxed text-lg">
          {DISCIPLINE_DESCRIPTIONS[slug]}
        </p>
      </header>

      <div className="text-sm text-muted mb-6">
        {total.toLocaleString('fr-FR')} opportunité{total > 1 ? 's' : ''} active{total > 1 ? 's' : ''}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {items.map((o) => (
          <OpportunityCard key={o.id} opportunity={o} />
        ))}
      </div>

      {items.length === 0 && (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-subtle p-12 text-center text-muted">
          Aucune opportunité actuellement en {DISCIPLINE_LABELS[slug].toLowerCase()}.
          <br />
          Revenez régulièrement ou créez une alerte.
        </div>
      )}
    </div>
  )
}
