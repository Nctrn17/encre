/**
 * Scraper Series Mania Institute (Lille).
 *
 * Source : https://seriesmania.com/institute/
 * SPA React avec contenu chargé en JS — `fetch` standard ne ramène que
 * le shell HTML. Pattern « health-check + static emit » avec données
 * vérifiées via WebSearch (édition 2026).
 *
 * Programmes pertinents pour le pilote scénariste :
 *   1. Writers Campus — atelier intensif 5 jours + pitch au Forum
 *   2. Eureka Series — 6 semaines, writers' room simulation
 *   3. Tremplin — hors scope ici (régional HdF + 18-25 ans, déjà
 *      visible côté Région IDF / DRAC Hauts-de-France)
 *
 * Édition 2026 : déjà passée (mars 2026). On émet quand même avec
 * `next_edition_status` pour préparer le cycle 2027 (cf migration 0022).
 *
 * À noter : Series Mania a des bourses qui couvrent les frais pour les
 * candidats internationaux — flag `outremer`/`pays-du-sud` à ajouter
 * une fois qu'on aura la confirmation textuelle dans la prochaine
 * édition.
 */

import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'series-mania-institute'

const BASE_URL = 'https://seriesmania.com/institute'
const EMITTER = 'Series Mania Institute'

const PROGRAMMES_2026 = [
  {
    slug: 'writers-campus',
    title: 'Series Mania Institute — Writers Campus',
    url: `${BASE_URL}/en/program/writers-campus-2026-en/`,
    description:
      "Atelier intensif de 5 jours à Lille pour scénaristes professionnels (avec un crédit " +
      "antérieur diffusé ou signé), porteurs d'un projet de série de fiction 20-60 min non " +
      "encore lié à un producteur ou diffuseur. Mentoring, masterclasses, pitch au Forum Series " +
      "Mania. Édition 2026 : sélection close depuis octobre 2025, programme du 19 au 26 mars " +
      "2026. Coût 960 € (AFDAS prend en charge pour les pros français). Prochaine édition " +
      "attendue à l'automne 2026 pour le cycle 2027.",
    disciplinesTagsHint: ['serie', 'bible', 'pilote-tv', 'scenario', 'formation'],
    cost_text: '960 €',
  },
  {
    slug: 'eureka-series',
    title: 'Series Mania Institute — Eureka Series',
    url: `${BASE_URL}/en/program/eureka-series/`,
    description:
      "Programme de formation intensif de 6 semaines pour scénaristes européens émergents. " +
      "Simulation de writers' room, immersion industrie pendant le festival Series Mania. " +
      "Édition 2026 : sélection close depuis novembre 2025, programme du 17 février au 27 mars " +
      "2026 à Lille. Prochaine édition attendue à l'automne 2026 pour le cycle 2027.",
    disciplinesTagsHint: ['serie', 'scenario', 'formation'],
    cost_text: null,
  },
]

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const resp = await fetchWithRetry(BASE_URL)
  if (!resp.ok) {
    console.warn(`  [series-mania-institute] portail HTTP ${resp.status} — site restructuré ?`)
    return []
  }
  const html = await resp.text()
  if (!html.toLowerCase().includes('series mania') && !html.toLowerCase().includes('séries mania')) {
    console.warn('  [series-mania-institute] portail ne mentionne plus Series Mania — restructuré ?')
    return []
  }

  return PROGRAMMES_2026.map((p) => ({
    external_id: `series-mania-${p.slug}-2026`,
    payload: {
      emitter: EMITTER,
      title: `${p.title} — édition 2026`,
      description: p.description,
      deadline: null, // édition 2026 close, prochain cycle ouvre à l'automne 2026
      url: p.url,
      amount_text: p.cost_text,
      region_hint: 'FR-HDF', // Lille
      discipline_hints: ['audiovisuel'],
      raw_json: {
        source_slug: slug,
        program_slug: p.slug,
        edition_year: 2026,
        next_edition_status: 'awaiting-fall-2026',
        hint_disciplines_tags: p.disciplinesTagsHint,
        hint_type: 'formation',
        hint_hors_reseau_friendly: true,
        hint_requires_producer: false,
        hint_requires_editor: false,
      },
    },
  }))
}
