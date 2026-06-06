/**
 * Scraper TorinoFilmLab — labs européens scénario / développement.
 *
 * Source officielle : https://torinofilmlab.it/labs
 *
 * Les appels long-term 2026 sont clos, mais la source est stable et revient
 * chaque automne. On émet les cycles 2026 comme opportunités à surveiller pour
 * préparer le prochain refresh dès l'ouverture des appels 2027.
 */

import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'torino-film-lab'

const BASE_URL = 'https://torinofilmlab.it/labs'

interface TorinoProgram {
  id: string
  title: string
  url: string
  description: string
  tags: string[]
  requiresProducer: boolean
  minFilms: number | null
}

const PROGRAMS_2026: TorinoProgram[] = [
  {
    id: 'scriptlab-2026',
    title: 'TorinoFilmLab — ScriptLab 2026',
    url: 'https://torinofilmlab.it/labs/scriptlab---story-editing/scriptlab-2026',
    description:
      "Programme international de développement de scénarios de longs métrages de fiction " +
      "à un stade précoce. Parcours d'avril à novembre 2026 avec trois modules résidentiels " +
      "et deux modules en ligne. Appel 2026 clos le 3 novembre 2025 ; prochaine ouverture " +
      "attendue à l'automne 2026. Travail en anglais obligatoire.",
    tags: ['scenario', 'long-metrage', 'formation'],
    requiresProducer: false,
    minFilms: null,
  },
  {
    id: 'featurelab-2026',
    title: 'TorinoFilmLab — FeatureLab 2026',
    url: 'https://torinofilmlab.it/labs/featurelab/featurelab-2026',
    description:
      "Programme de développement avancé pour premiers ou deuxièmes longs métrages. " +
      "Candidature en équipe réalisateur·rice + producteur·rice, avec scénariste si " +
      "déjà attaché·e au projet. Parcours de juin à novembre 2026 et présentation au " +
      "TFL Meeting Event. Appel 2026 clos le 2 décembre 2025 ; prochain cycle attendu " +
      "à l'automne 2026. Travail en anglais obligatoire.",
    tags: ['long-metrage', 'scenario', 'formation'],
    requiresProducer: true,
    minFilms: 1,
  },
  {
    id: 'serieslab-2026',
    title: 'TorinoFilmLab — SeriesLab 2026',
    url: 'https://torinofilmlab.it/labs/serieslab/serieslab-2026',
    description:
      "Programme international pour équipes d'auteur·rices et producteur·rices développant " +
      "une série TV originale. Trois ateliers résidentiels, présentation finale et rendez-vous " +
      "professionnels à Turin en novembre 2026. Appel 2026 clos le 17 décembre 2025 ; prochain " +
      "cycle attendu à l'automne 2026. Des bourses de développement peuvent être attribuées " +
      "en fin de parcours.",
    tags: ['serie', 'bible', 'pilote-tv', 'scenario', 'formation'],
    requiresProducer: true,
    minFilms: null,
  },
  {
    id: 'comedylab-2026',
    title: 'TorinoFilmLab — ComedyLab 2026',
    url: 'https://www.torinofilmlab.it/labs/comedylab/comedylab-2026',
    description:
      "Lab européen dédié au développement de longs métrages de comédie, réunissant " +
      "scénaristes et comedy writers/performers. Appel 2026 clos le 12 décembre 2025 ; " +
      "prochain cycle attendu à l'automne 2026. Travail en anglais obligatoire.",
    tags: ['scenario', 'long-metrage', 'formation'],
    requiresProducer: false,
    minFilms: null,
  },
]

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const resp = await fetchWithRetry(BASE_URL, { timeoutMs: 8000 })
  if (!resp.ok) {
    console.warn(`  [torino-film-lab] HTTP ${resp.status} — skip`)
    return []
  }

  const html = (await resp.text()).toLowerCase()
  if (!html.includes('torinofilmlab') && !html.includes('serieslab')) {
    console.warn('  [torino-film-lab] portail labs non reconnu — skip')
    return []
  }

  return PROGRAMS_2026.map((program) => ({
    external_id: `torino-film-lab-${program.id}`,
    payload: {
      emitter: 'TorinoFilmLab',
      title: program.title,
      description: program.description,
      deadline: null,
      url: program.url,
      amount_text: program.id === 'serieslab-2026' ? "Bourses de développement possibles" : null,
      region_hint: null,
      discipline_hints: ['cinema', 'audiovisuel'],
      raw_json: {
        source_slug: slug,
        program_slug: program.id.replace('-2026', ''),
        edition_year: 2026,
        next_edition_status: 'awaiting-fall-2026',
        hint_disciplines_tags: program.tags,
        hint_type: 'formation',
        hint_hors_reseau_friendly: !program.requiresProducer,
        hint_requires_producer: program.requiresProducer,
        hint_requires_editor: false,
        hint_min_films_produits: program.minFilms,
      },
    },
  }))
}
