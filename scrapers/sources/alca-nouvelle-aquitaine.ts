/**
 * Scraper ALCA Nouvelle-Aquitaine — volet Cinéma & Audiovisuel (pas livre).
 *
 * Site : https://alca-nouvelle-aquitaine.fr/fr/cinema-audiovisuel
 * 4 aides stables, URLs connues. Pattern "health-check + static emit"
 * (comme Sopadin / IDF) car les dates/montants sont dans des règlements PDF
 * ou changent chaque année.
 *
 * Cible pilote scénariste : Aide à l'écriture (ouverte aux scénaristes),
 * Aide au développement (auteurs + producteurs). Production + coproduction
 * internationale = producteurs uniquement (flagged).
 *
 * Réf doc : docs/PILOTE-SCENARISTES.md section 3.3
 */

import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'alca-nouvelle-aquitaine'

const BASE = 'https://alca-nouvelle-aquitaine.fr'
const ROOT_URL = `${BASE}/fr/cinema-audiovisuel`
const EMITTER = 'ALCA Nouvelle-Aquitaine'

interface AideConfig {
  slug: string
  path: string
  title: string
  description: string
  discipline_hints: string[]
  requires_producer: boolean
  hors_reseau_friendly: boolean
}

const AIDES: AideConfig[] = [
  {
    slug: 'aide-a-lecriture',
    path: '/fr/cinema-audiovisuel/fonds-de-soutien-au-cinema-et-l-audiovisuel/l-aide-l-ecriture',
    title: 'ALCA Nouvelle-Aquitaine — Aide à l’écriture (scénario)',
    description:
      'Aide régionale à l’écriture de scénario pour le cinéma et l’audiovisuel, ouverte aux auteurs résidant en Nouvelle-Aquitaine ou développant un projet lié au territoire. Commissions plusieurs fois par an — consulter le site pour les sessions en cours.',
    discipline_hints: ['cinema', 'audiovisuel'],
    requires_producer: false,
    hors_reseau_friendly: true,
  },
  {
    slug: 'aide-au-developpement',
    path: '/fr/cinema-audiovisuel/fonds-de-soutien-au-cinema-et-l-audiovisuel/l-aide-au-developpement',
    title: 'ALCA Nouvelle-Aquitaine — Aide au développement',
    description:
      'Aide régionale au développement de projets cinéma et audiovisuel (fiction, documentaire, animation). Ouverte aux sociétés de production, les auteurs peuvent être associés au dossier. Plusieurs commissions par an.',
    discipline_hints: ['cinema', 'audiovisuel'],
    requires_producer: true,
    hors_reseau_friendly: false,
  },
  {
    slug: 'aide-a-la-production',
    path: '/fr/cinema-audiovisuel/fonds-de-soutien-au-cinema-et-l-audiovisuel/l-aide-la-production',
    title: 'ALCA Nouvelle-Aquitaine — Aide à la production',
    description:
      'Aide régionale à la production de projets cinéma et audiovisuel tournés en Nouvelle-Aquitaine. Réservée aux sociétés de production.',
    discipline_hints: ['cinema', 'audiovisuel'],
    requires_producer: true,
    hors_reseau_friendly: false,
  },
  {
    slug: 'coproduction-internationale',
    path: '/fr/cinema-audiovisuel/fonds-de-soutien-au-cinema-et-l-audiovisuel/coproduction-internationale',
    title: 'ALCA Nouvelle-Aquitaine — Coproduction internationale',
    description:
      'Soutien à la coproduction internationale pour projets cinéma et audiovisuel portés par des producteurs néo-aquitains.',
    discipline_hints: ['cinema', 'audiovisuel'],
    requires_producer: true,
    hors_reseau_friendly: false,
  },
]

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const resp = await fetchWithRetry(ROOT_URL)
  if (!resp.ok) {
    console.warn(`  [alca-na] HTTP ${resp.status} sur ${ROOT_URL} — dispositif peut-être modifié`)
    return []
  }

  return AIDES.map((aide) => ({
    external_id: `alca-na-${aide.slug}`,
    payload: {
      title: aide.title,
      description: aide.description,
      emitter: EMITTER,
      url: `${BASE}${aide.path}`,
      deadline: null, // dates par session → règlement PDF à parser en v2
      amount_text: null,
      discipline_hints: aide.discipline_hints,
      region_hint: 'NA', // Nouvelle-Aquitaine
      raw_json: {
        source_slug: 'alca-nouvelle-aquitaine',
        aide_slug: aide.slug,
        hint_hors_reseau_friendly: aide.hors_reseau_friendly,
        hint_requires_producer: aide.requires_producer,
      },
    },
  }))
}
