/**
 * Scraper Collectif 50/50 — programmes inclusion cinema/audiovisuel.
 *
 * Source officielle : https://collectif5050.com/
 *
 * Le Boost Program 2025-2026 est clos au moment de l'ajout, mais c'est la
 * première source fiable repérée explicitement réservée aux cinéastes femmes
 * et minorités de genre. On l'émet comme opportunité de cycle à surveiller,
 * pour que le prochain appel puisse être rafraîchi sans redécouvrir la source.
 */

import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'collectif-5050'

const SOURCE_URL = 'https://collectif5050.com/mentorat-transeuropeen/'

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const resp = await fetchWithRetry(SOURCE_URL, { timeoutMs: 8000 })
  if (!resp.ok) {
    console.warn(`  [collectif-5050] HTTP ${resp.status} — skip`)
    return []
  }

  const html = (await resp.text()).toLowerCase()
  if (!html.includes('boost program') && !html.includes('cinéastes femmes')) {
    console.warn('  [collectif-5050] page Boost Program non reconnue — skip')
    return []
  }

  return [
    {
      external_id: 'collectif-5050-boost-program-2025-2026',
      payload: {
        emitter: 'Collectif 50/50',
        title: 'Collectif 50/50 — Boost Program cinéastes femmes et minorités de genre',
        description:
          "Programme européen de mentorat et de professionnalisation porté par le Collectif " +
          "50/50, MUTIM et CIMA pour cinéastes femmes et minorités de genre développant leur " +
          "premier ou deuxième long métrage. Parcours entre décembre 2025 et avril 2026, avec " +
          "mentorat partagé, rencontres professionnelles et immersion dans un grand festival. " +
          "Pour les réalisatrices, au moins un film professionnel déjà réalisé est demandé ; " +
          "pour les productrices, un premier ou deuxième long métrage en développement est visé. " +
          "L'appel 2025-2026 était ouvert du 9 septembre au 1er octobre 2025. Prochain cycle à " +
          "surveiller à l'automne 2026.",
        deadline: null,
        url: SOURCE_URL,
        amount_text: 'Mentorat, accompagnement professionnel et immersion festival',
        region_hint: null,
        discipline_hints: ['cinema', 'audiovisuel'],
        raw_json: {
          source_slug: slug,
          program_slug: 'boost-program',
          edition_year: 2026,
          next_edition_status: 'awaiting-fall-2026',
          hint_disciplines_tags: [
            'scenario',
            'long-metrage',
            'formation',
            'femmes',
            'minorites-de-genre',
          ],
          hint_type: 'formation',
          hint_hors_reseau_friendly: true,
          hint_requires_producer: false,
          hint_requires_editor: false,
          hint_min_films_produits: 1,
        },
      },
    },
  ]
}
