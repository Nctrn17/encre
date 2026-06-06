/**
 * Scraper Culture.gouv.fr — catalogue des démarches et subventions.
 *
 * Source : https://www.culture.gouv.fr/catalogue-des-demarches-et-subventions/
 * CMS : Ibexa Platform (pas Drupal). Mais expose des sitemaps XML (12+).
 *
 * Stratégie : merger les 12 sitemaps, filtrer /catalogue-des-demarches-et-subventions/,
 * sort by lastmod desc, fetch les N plus récentes → extraction og:title/og:description.
 *
 * Couvre national ET régional (les DRAC alimentent ce catalogue centralisé).
 * ~571 URLs actives dans le catalogue en avril 2026.
 */

import { scrapeFromSitemaps } from '../lib/sitemap-scraper'
import { isV1Discipline } from '../../src/lib/pilot-defaults'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'culture-gouv'

const SITEMAP_URLS = [
  'https://www.culture.gouv.fr/sitemap-1.xml',
  'https://www.culture.gouv.fr/sitemap-2.xml',
  'https://www.culture.gouv.fr/sitemap-3.xml',
  'https://www.culture.gouv.fr/sitemap-4.xml',
  'https://www.culture.gouv.fr/sitemap-5.xml',
  'https://www.culture.gouv.fr/sitemap-6.xml',
  'https://www.culture.gouv.fr/sitemap-7.xml',
  'https://www.culture.gouv.fr/sitemap-8.xml',
  'https://www.culture.gouv.fr/sitemap-9.xml',
  'https://www.culture.gouv.fr/sitemap-10.xml',
  'https://www.culture.gouv.fr/sitemap-11.xml',
  'https://www.culture.gouv.fr/sitemap-12.xml',
]

export async function run(config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const fetchLimit = (config.fetch_limit as number) || 60
  const throttleMs = (config.throttle_ms as number) || 200

  return scrapeFromSitemaps({
    sitemapUrls: SITEMAP_URLS,
    pathFilter: '/catalogue-des-demarches-et-subventions/',
    fetchLimit,
    throttleMs,
    sourceSlug: 'culture-gouv',
    emitterName: 'Ministère de la Culture',
    deriveDisciplineHints: deriveHintsFromPath,
    // V1 launch : on skip avant fetch les URLs dont les hints disciplines
    // sont strictement hors V1 (musique, danse, cirque, patrimoine, etc.).
    // Les pages "transdisciplinaire" PASSENT le filtre (ambiguës, on laisse
    // le LLM décider) sauf si elles ont aussi un hint hors-V1 explicite.
    additionalFilter: (url) => {
      const hints = deriveHintsFromPath(url)
      // Si au moins 1 hint est V1 → KEEP
      if (hints.some((h) => isV1Discipline(h))) return true
      // Si TOUTES les hints sont strictement hors V1 (et non transdisciplinaire) → DROP
      const onlyOutOfV1 = hints.every((h) => !isV1Discipline(h) && h !== 'transdisciplinaire')
      if (onlyOutOfV1) return false
      // Cas mixte (transdisciplinaire seul ou avec autre hint non-V1) : on garde,
      // le LLM tranchera et le cleanup-non-v1 attrapera si la classification
      // finale ne contient aucune V1.
      return true
    },
  })
}

/**
 * Le catalogue culture.gouv.fr a des sous-chemins qui informent la discipline.
 * Ex: /catalogue-des-demarches-et-subventions/appels-a-projet-partenaires/
 *      residence-mission-autour-du-livre-et-de-la-lecture-...
 *
 * On parse les mots-clés dans le slug pour deviner la discipline principale.
 * La classification Gemini affinera derrière.
 */
function deriveHintsFromPath(url: string): string[] {
  const hints: string[] = []
  const lower = url.toLowerCase()

  if (/livre|lecture|litterature|auteur|ecrivain|traducteur/.test(lower)) {
    hints.push('litterature')
  }
  if (/musique|musiques-actuelles|compositeur/.test(lower)) {
    hints.push('musique')
  }
  if (/theatre|dramaturg/.test(lower)) {
    hints.push('theatre', 'spectacle_vivant')
  }
  if (/danse|choregraph/.test(lower)) {
    hints.push('danse', 'spectacle_vivant')
  }
  if (/cirque/.test(lower)) {
    hints.push('cirque', 'spectacle_vivant')
  }
  if (/rue|itinerant/.test(lower)) {
    hints.push('arts_rue', 'spectacle_vivant')
  }
  if (/cinema|court-metrage|long-metrage|film/.test(lower)) {
    hints.push('cinema')
  }
  if (/audiovisuel|documentaire/.test(lower)) {
    hints.push('audiovisuel')
  }
  if (/photo/.test(lower)) {
    hints.push('photographie', 'arts_visuels')
  }
  if (/arts-visuels|arts-plastiques|plasticien/.test(lower)) {
    hints.push('arts_visuels', 'arts_plastiques')
  }
  if (/numerique|jeu-video|vr|ia|innovation/.test(lower)) {
    hints.push('numerique')
  }
  if (/marionnette/.test(lower)) {
    hints.push('marionnette', 'spectacle_vivant')
  }
  if (/patrimoine|architecture|monuments/.test(lower)) {
    // Patrimoine pas dans la taxonomie actuelle — tag en transdisciplinaire
    hints.push('transdisciplinaire')
  }

  // Pas de signal spécifique → transdisciplinaire par défaut
  if (hints.length === 0) {
    hints.push('transdisciplinaire')
  }

  return [...new Set(hints)]
}
