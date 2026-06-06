/**
 * Scraper Auvergne-Rhône-Alpes Cinéma.
 *
 * Site : https://www.auvergnerhonealpes-cinema.fr/
 * 4 fonds stables (cinéma ÷ audiovisuel × écriture-dev ÷ coproduction).
 * Static emit, détails/dates dans règlements PDF à rafraîchir chaque année.
 *
 * Réf : docs/PILOTE-SCENARISTES.md section 3.3
 */

import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'aura-cinema'

const BASE = 'https://www.auvergnerhonealpes-cinema.fr'
const ROOT_URL = `${BASE}/professionnels/financement-des-projets/`
const EMITTER = 'Auvergne-Rhône-Alpes Cinéma'

const FONDS = [
  {
    slug: 'cinema-ecriture-developpement',
    path: '/professionnels/financement-des-projets/fonds-cinema-ecrituredeveloppement/',
    title: 'AuRA Cinéma — Fonds Cinéma écriture & développement',
    description:
      'Soutien régional AURA à l’écriture et au développement de longs métrages de fiction, documentaire ou animation. Ouvert aux scénaristes et équipes de création basées ou liées à la région.',
    hors_reseau_friendly: true,
    requires_producer: false,
  },
  {
    slug: 'cinema-coproduction',
    path: '/professionnels/financement-des-projets/fonds-cinema-coproduction/',
    title: 'AuRA Cinéma — Fonds Cinéma coproduction',
    description:
      'Aide à la coproduction de longs métrages cinéma (fiction, documentaire, animation). Réservé aux sociétés de production.',
    hors_reseau_friendly: false,
    requires_producer: true,
  },
  {
    slug: 'audiovisuel-ecriture-developpement',
    path: '/professionnels/financement-des-projets/fonds-audiovisuel-ecrituredeveloppement/',
    title: 'AuRA Cinéma — Fonds Audiovisuel écriture & développement',
    description:
      'Soutien à l’écriture et au développement de projets audiovisuels (séries, unitaires TV, documentaires, animation). Auteurs éligibles.',
    hors_reseau_friendly: true,
    requires_producer: false,
  },
  {
    slug: 'audiovisuel-coproduction',
    path: '/professionnels/financement-des-projets/fonds-audiovisuel-coproduction/',
    title: 'AuRA Cinéma — Fonds Audiovisuel coproduction',
    description:
      'Aide à la coproduction de séries, unitaires TV, documentaires et animation en Auvergne-Rhône-Alpes. Réservé aux sociétés de production.',
    hors_reseau_friendly: false,
    requires_producer: true,
  },
] as const

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const resp = await fetchWithRetry(ROOT_URL)
  if (!resp.ok) {
    console.warn(`  [aura-cinema] HTTP ${resp.status} sur ${ROOT_URL}`)
    return []
  }

  return FONDS.map((f) => ({
    external_id: `aura-cinema-${f.slug}`,
    payload: {
      title: f.title,
      description: f.description,
      emitter: EMITTER,
      url: `${BASE}${f.path}`,
      deadline: null,
      amount_text: null,
      discipline_hints: ['cinema', 'audiovisuel'],
      region_hint: 'ARA', // Auvergne-Rhône-Alpes
      raw_json: {
        source_slug: 'aura-cinema',
        fond_slug: f.slug,
        hint_hors_reseau_friendly: f.hors_reseau_friendly,
        hint_requires_producer: f.requires_producer,
      },
    },
  }))
}
