import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { listOpportunities } from '@/features/opportunities/queries'
import { OpportunityCard } from '@/components/opportunities/OpportunityCard'
import {
  FR_REGION_SLUGS,
  FR_REGION_CODES,
  regionCodeFromSlug,
  type FrRegionCode,
} from '@/lib/region-codes'

export const revalidate = 1800

interface PageProps {
  params: Promise<{ code: string }>
}

export async function generateStaticParams() {
  return Object.values(FR_REGION_SLUGS).map((slug) => ({ code: slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code: slug } = await params
  const regionCode = regionCodeFromSlug(slug)
  if (!regionCode) return {}
  const label = FR_REGION_CODES[regionCode]
  const path = `/regions/${slug}`
  const description = `Résidences, subventions et bourses culturelles en ${label}.`
  return {
    title: `${label} · aides à l'écriture`,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${label} · aides à l'écriture`,
      description,
      type: 'website',
      url: path,
    },
  }
}

export default async function RegionHubPage({ params }: PageProps) {
  const { code: slug } = await params
  const regionCode = regionCodeFromSlug(slug)
  if (!regionCode) notFound()

  const { items, total } = await listOpportunities({
    regionCodes: [regionCode as FrRegionCode],
    limit: 30,
  })

  const label = FR_REGION_CODES[regionCode as FrRegionCode]

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <header className="mb-10">
        <div className="text-sm text-muted mb-2">Région</div>
        <h1 className="font-serif mb-4">{label}</h1>
        <p className="text-muted">
          {total.toLocaleString('fr-FR')} opportunité{total > 1 ? 's' : ''} active{total > 1 ? 's' : ''}
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        {items.map((o) => (
          <OpportunityCard key={o.id} opportunity={o} />
        ))}
      </div>

      {items.length === 0 && (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-subtle p-12 text-center text-muted">
          Aucune opportunité locale actuellement en {label}.
        </div>
      )}
    </div>
  )
}
