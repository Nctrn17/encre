import type { MetadataRoute } from 'next'
import { listOpportunityEntriesForSitemap } from '@/features/opportunities/queries'
import { listActiveSourceSlugs } from '@/features/sources/queries'
import { DISCIPLINE_SLUGS } from '@/lib/discipline-taxonomy'
import { FR_REGION_SLUGS } from '@/lib/region-codes'
import { listStaticPeriodSlugs, parsePeriodSlug } from '@/lib/period'
import { getSiteUrl } from '@/lib/site'

/**
 * <changefreq> et <priority> sont ignorés par Google (et la plupart des
 * moteurs) - on ne les émet pas. <lastmod> n'est posé que là où on a une vraie
 * date de contenu : par fiche (updated_at DB) et, pour les pages d'agrégation
 * pilotées par les données, la date du dernier item modifié. Les pages
 * éditoriales/légales n'ont pas de lastmod : un lastmod faux (le timestamp de
 * build, qui change à chaque déploiement) entraîne les crawlers à croire que
 * tout change en permanence et dévalue le signal sur les pages réellement fraîches.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl()
  const now = new Date()

  const oppEntriesRaw = await listOpportunityEntriesForSitemap()

  // Fraîcheur des données = date du dernier item modifié. Sert de lastmod aux
  // pages d'agrégation (listings, hubs), qui changent quand les données changent.
  const dataUpdatedAt = oppEntriesRaw.reduce<Date | undefined>((max, entry) => {
    if (!entry.updatedAt) return max
    const d = new Date(entry.updatedAt)
    return !max || d > max ? d : max
  }, undefined)

  const dataLastmod = dataUpdatedAt ? { lastModified: dataUpdatedAt } : {}

  // Pages d'agrégation pilotées par les données (home sans slash = canonical).
  const dataDrivenPaths = ['/', '/aides', '/pays-du-sud', '/outremer', '/sources']
  const dataStaticEntries: MetadataRoute.Sitemap = dataDrivenPaths.map((path) => ({
    url: path === '/' ? base : `${base}${path}`,
    ...dataLastmod,
  }))

  // Pages éditoriales/légales : contenu stable, pas de lastmod artificiel.
  const editorialPaths = [
    '/manifeste',
    '/a-propos',
    '/contact',
    '/mentions-legales',
    '/cgu',
    '/donnees-personnelles',
  ]
  const editorialEntries: MetadataRoute.Sitemap = editorialPaths.map((path) => ({
    url: `${base}${path}`,
  }))

  const disciplineEntries: MetadataRoute.Sitemap = DISCIPLINE_SLUGS.map((slug) => ({
    url: `${base}/disciplines/${slug.replace(/_/g, '-')}`,
    ...dataLastmod,
  }))

  const regionEntries: MetadataRoute.Sitemap = Object.values(FR_REGION_SLUGS).map((slug) => ({
    url: `${base}/regions/${slug}`,
    ...dataLastmod,
  }))

  // Pages calendrier (mois glissants + années + saisons). On exclut les
  // périodes entièrement passées (déjà noindex côté métadonnées).
  const calendrierEntries: MetadataRoute.Sitemap = listStaticPeriodSlugs(now)
    .map((slug) => {
      const periode = parsePeriodSlug(slug)
      if (!periode) return null
      if (periode.end.getTime() < now.getTime()) return null
      return {
        url: `${base}/calendrier/${slug}`,
        ...dataLastmod,
      } as MetadataRoute.Sitemap[number]
    })
    .filter((e): e is MetadataRoute.Sitemap[number] => e !== null)

  const oppEntries: MetadataRoute.Sitemap = oppEntriesRaw.map((entry) => ({
    url: `${base}/aides/${entry.slug}`,
    ...(entry.updatedAt ? { lastModified: new Date(entry.updatedAt) } : {}),
  }))

  const sourceEntries: MetadataRoute.Sitemap = (await listActiveSourceSlugs()).map((slug) => ({
    url: `${base}/sources/${slug}`,
    ...dataLastmod,
  }))

  return [
    ...dataStaticEntries,
    ...editorialEntries,
    ...disciplineEntries,
    ...regionEntries,
    ...calendrierEntries,
    ...oppEntries,
    ...sourceEntries,
  ]
}
