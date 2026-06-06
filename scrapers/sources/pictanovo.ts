/**
 * Scraper PictanovO (Hauts-de-France audiovisuel).
 *
 * Site : https://www.pictanovo.com/fonds/
 * 10 fonds d'aide gérés. Pattern static emit — URLs et noms stables, détails
 * dans règlements PDF changeant chaque année.
 *
 * Réf : docs/PILOTE-SCENARISTES.md section 3.3
 */

import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'pictanovo'

const BASE = 'https://www.pictanovo.com'
const ROOT_URL = `${BASE}/fonds/`
const EMITTER = 'PictanovO (Hauts-de-France)'

const FONDS = [
  {
    slug: 'cinema-fiction-tv',
    path: '/fond/cinema-tv/',
    title: 'PictanovO — Fonds Cinéma / Fiction TV',
    description:
      'Aide aux producteurs, scénaristes et réalisateurs pour long métrage cinéma ou fiction TV. Phases écriture, développement, production. ~20 projets/an.',
    hors_reseau_friendly: true,
    requires_producer: false,
  },
  {
    slug: 'animation',
    path: '/fond/animation/',
    title: 'PictanovO — Fonds Animation',
    description:
      'Soutien aux studios, producteurs et auteurs d’animation. Phases écriture, développement, production.',
    hors_reseau_friendly: true,
    requires_producer: false,
  },
  {
    slug: 'documentaire',
    path: '/fond/documentaire/',
    title: 'PictanovO — Fonds Documentaire',
    description:
      'Aide aux producteurs et auteurs documentaristes en Hauts-de-France. Phases écriture, développement, production. ~30 projets/an.',
    hors_reseau_friendly: true,
    requires_producer: false,
  },
  {
    slug: 'court-metrage',
    path: '/fond/court-metrage/',
    title: 'PictanovO — Fonds Court Métrage',
    description:
      'Soutien aux sociétés de production pour court métrage. ~15 projets/an.',
    hors_reseau_friendly: false,
    requires_producer: true,
  },
  {
    slug: 'jeu-video',
    path: '/fond/jeu-video/',
    title: 'PictanovO — Fonds Jeu Vidéo',
    description: 'Aide aux studios de jeu vidéo en Hauts-de-France.',
    hors_reseau_friendly: false,
    requires_producer: true,
  },
  {
    slug: 'emergence',
    path: '/fond/emergence/',
    title: 'PictanovO — Programme Emergence',
    description:
      'Programme dédié aux auteur·rice·s émergent·e·s des Hauts-de-France (associations, premiers projets). 40 projets/an. **Cible hors-réseau prioritaire.**',
    hors_reseau_friendly: true,
    requires_producer: false,
  },
  {
    slug: 'hauts-de-france-talent',
    path: '/fond/hauts-de-france-talent/',
    title: 'PictanovO — Hauts-de-France Talent (créateurs web)',
    description:
      'Aide aux créateurs de contenus sur Internet résidant ou liés aux Hauts-de-France.',
    hors_reseau_friendly: true,
    requires_producer: false,
  },
  {
    slug: 'aide-programme-editorial',
    path: '/fond/aide-au-programme-editorial/',
    title: 'PictanovO — Aide au programme éditorial (écriture-développement)',
    description:
      'Soutien aux équipes éditoriales documentaire, animation et fiction série (2 à 5 œuvres par programme). Phases écriture et développement.',
    hors_reseau_friendly: true,
    requires_producer: false,
  },
  {
    slug: 'fonds-economique',
    path: '/fond/fonds-economique/',
    title: 'PictanovO — Fonds économique',
    description:
      'Aide aux longs métrages et séries à enjeu économique régional. Créé en 2023.',
    hors_reseau_friendly: false,
    requires_producer: true,
  },
  {
    slug: 'nouveaux-medias',
    path: '/fond/nouveaux-medias/',
    title: 'PictanovO — Nouveaux médias (VR / AR / XR / interactif)',
    description:
      'Soutien aux projets VR, AR, XR et récits interactifs en Hauts-de-France.',
    hors_reseau_friendly: true,
    requires_producer: false,
  },
] as const

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const resp = await fetchWithRetry(ROOT_URL)
  if (!resp.ok) {
    console.warn(`  [pictanovo] HTTP ${resp.status}`)
    return []
  }

  return FONDS.map((f) => ({
    external_id: `pictanovo-${f.slug}`,
    payload: {
      title: f.title,
      description: f.description,
      emitter: EMITTER,
      url: `${BASE}${f.path}`,
      deadline: null,
      amount_text: null,
      discipline_hints: ['cinema', 'audiovisuel'],
      region_hint: 'HDF', // Hauts-de-France
      raw_json: {
        source_slug: 'pictanovo',
        fond_slug: f.slug,
        hint_hors_reseau_friendly: f.hors_reseau_friendly,
        hint_requires_producer: f.requires_producer,
      },
    },
  }))
}
