/**
 * Scraper Emergence Cinéma.
 *
 * Site : https://www.emergence-cinema.fr/
 * 1 programme principal : Résidence Cinéma, 7 mois, pour auteurs-réalisateurs
 * qui préparent leur 1er long métrage. Financée CNC + Île-de-France,
 * mentorat Audiard/Honoré/... Alumni : Alice Winocour, Mia Hansen-Løve,
 * Pierre Schoeller, Antonin Peretjatko.
 *
 * Calendrier : appel juin, clôture septembre, sélection décembre, tournage
 * mars, post-prod avril-juin.
 *
 * Réf : docs/PILOTE-SCENARISTES.md section 3.2
 */

import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'emergence-cinema'

const ROOT_URL = 'https://www.emergence-cinema.fr/'
const PROGRAM_URL = 'https://www.emergence-cinema.fr/residence-cinema-presentation-du-programme.html'
const EMITTER = 'Emergence Cinéma'

/**
 * Calendrier inféré du site. Au jour de l'édition (2026-04-19), l'appel
 * 2026 est probablement clos (clôture septembre 2025). Deadline suivante
 * = clôture septembre 2026 pour la promo 2027.
 */
const NEXT_DEADLINE_ISO = '2026-09-30T23:59:59+02:00'

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const resp = await fetchWithRetry(ROOT_URL)
  if (!resp.ok) {
    console.warn(`  [emergence] HTTP ${resp.status}`)
    return []
  }

  return [
    {
      external_id: 'emergence-residence-cinema',
      payload: {
        title: 'Emergence Cinéma — Résidence pour 1er long métrage',
        description:
          `Résidence de 7 mois pour auteurs-réalisateurs préparant leur premier long métrage de fiction. ` +
          `Mentorat par des cinéastes reconnus (Jacques Audiard, Christophe Honoré, etc.). ` +
          `Tournage effectif de 2 scènes du scénario sous conditions réelles en Île-de-France. ` +
          `Alumni : Alice Winocour, Mia Hansen-Løve, Pierre Schoeller. ` +
          `Calendrier : appel juin, clôture fin septembre, sélection décembre, préparation ` +
          `janvier-février, tournage mars, post-production avril-juin. ` +
          `Financé par le CNC et la Région Île-de-France. Prochaine clôture estimée fin septembre.`,
        emitter: EMITTER,
        url: PROGRAM_URL,
        deadline: NEXT_DEADLINE_ISO,
        amount_text: null, // prise en charge totale production 2 scènes, pas de bourse directe
        discipline_hints: ['cinema', 'audiovisuel'],
        region_hint: 'IDF',
        raw_json: {
          source_slug: 'emergence-cinema',
          hint_hors_reseau_friendly: true,
          hint_min_films_produits: 0, // 1er long = ceux qui ont au plus fait des courts
          hint_requires_producer: false,
        },
      },
    },
  ]
}
