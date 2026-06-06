/**
 * Scraper Cité Européenne des Scénaristes — Centre de compagnonnage.
 *
 * Source : https://cite-europeenne-des-scenaristes.com/compagnonnage/
 * Programme de compagnonnage pour scénaristes émergent·es, déployé en
 * sessions régionales tournantes (IDF, Sud, AuRA, Occitanie, Bretagne).
 * Pas d'API ni de calendrier centralisé exposé en HTML stable — on
 * émet un item central « Compagnonnage Cité Européenne » avec note
 * sur les sessions actuellement actives ou attendues.
 *
 * Conditions d'éligibilité :
 *   - Inscrit·e à France Travail
 *   - Formation préalable en écriture scénaristique OU expérience
 *     significative (résidence, workshop, pitch festival, marathon, etc.)
 *   - Gratuit (financé par les régions partenaires)
 *
 * Type opportunity_type : 'formation' (cf migration 0023).
 *
 * Mai 2026 : la session Bretagne est en cours (15 déc 2025 → 22 mai
 * 2026). Les prochaines candidatures (IDF session 7, Sud, AuRA, etc.)
 * seront annoncées dans le courant 2026.
 */

import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'cite-europeenne-scenaristes'

const BASE_URL = 'https://cite-europeenne-des-scenaristes.com'
const EMITTER = 'Cité Européenne des Scénaristes'

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const resp = await fetchWithRetry(`${BASE_URL}/compagnonnage/`)
  if (!resp.ok) {
    console.warn(`  [cite-europeenne] page compagnonnage HTTP ${resp.status}`)
    return []
  }
  const html = await resp.text()
  if (!html.toLowerCase().includes('compagnonnage')) {
    console.warn('  [cite-europeenne] page ne mentionne plus compagnonnage')
    return []
  }

  return [
    {
      external_id: 'cite-europeenne-compagnonnage-2026',
      payload: {
        emitter: EMITTER,
        title: 'Cité Européenne des Scénaristes — Centre de compagnonnage',
        description:
          "Programme d'accompagnement intensif pour scénaristes émergent·es, déployé en sessions " +
          "régionales tournantes (Île-de-France, Région Sud, Auvergne-Rhône-Alpes, Occitanie, " +
          "Bretagne). Conçu pour favoriser l'insertion et la professionnalisation dans le " +
          "secteur audiovisuel/cinéma. Gratuit, financé par les régions partenaires. " +
          "Conditions : inscrit·e à France Travail + formation préalable en écriture " +
          "scénaristique OU expériences significatives (résidence, workshop, pitch festival). " +
          "Mai 2026 : la session Bretagne (Cesson-Sévigné) est en cours jusqu'au 22 mai 2026. " +
          "Les prochains appels (IDF session 7, Sud, AuRA, etc.) seront annoncés dans le " +
          "courant 2026 via la newsletter du programme.",
        deadline: null, // sessions régionales tournantes, deadline non unique
        url: `${BASE_URL}/compagnonnage/`,
        amount_text: 'Gratuit (financé régions)',
        region_hint: null,
        discipline_hints: ['audiovisuel'],
        raw_json: {
          source_slug: slug,
          edition_year: 2026,
          next_edition_status: 'rolling-regional',
          newsletter_url: `${BASE_URL}/compagnonnage/pre-inscription/`,
          hint_type: 'formation',
          hint_disciplines_tags: ['scenario', 'serie', 'formation'],
          hint_hors_reseau_friendly: true,
          hint_requires_producer: false,
          hint_requires_editor: false,
        },
      },
    },
  ]
}
