/**
 * Scraper résidences internationales ouvertes aux créateurs FR.
 *
 * Pattern health-check + static emit : les pages officielles sont stables,
 * mais les appels sont souvent annuels et entre deux cycles. On émet les
 * dispositifs à surveiller avec `next_edition_status`, sans inventer de
 * deadline quand le prochain appel n'est pas publié.
 */

import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'residences-internationales-fr'

interface ResidencyItem {
  id: string
  emitter: string
  title: string
  description: string
  url: string
  amountText: string | null
  deadline: string | null
  healthCheckKeyword: string
  tags: string[]
  nextEditionStatus: string
}

const RESIDENCIES: ResidencyItem[] = [
  {
    id: 'villa-albertine-general-2026',
    emitter: 'Villa Albertine',
    title: 'Villa Albertine — résidences exploratoires aux États-Unis',
    description:
      "Résidence exploratoire d'un à trois mois aux États-Unis pour créateurs, chercheurs " +
      "et professionnels de la culture, incluant cinéma, séries, littérature, podcast, " +
      "création numérique et formes interdisciplinaires. Le programme couvre le voyage " +
      "international, l'hébergement, l'assurance et une allocation de vie quotidienne. " +
      "Candidature individuelle avec appui d'un partenaire français. L'appel 2026 était " +
      "clos le 30 janvier 2025 ; prochain cycle général à surveiller à l'automne.",
    url: 'https://villa-albertine.org/va/professionals/general-call-for-applications-2026-residencies/',
    amountText: 'Voyage, hébergement, assurance et allocation de vie quotidienne',
    deadline: null,
    healthCheckKeyword: 'residencies',
    tags: ['scenario', 'long-metrage', 'serie', 'litterature', 'sonore', 'web', 'international'],
    nextEditionStatus: 'awaiting-fall-cycle',
  },
  {
    id: 'mira-institut-francais-2026',
    emitter: 'Institut français',
    title: 'MIRA — mobilité internationale de recherche artistique',
    description:
      "Programme de mobilité pour artistes français, ou artistes étrangers résidant en " +
      "France depuis plus de cinq ans, souhaitant mener une recherche artistique à " +
      "l'international pendant au moins un mois. Candidature possible en solo ou en duo, " +
      "toutes disciplines artistiques. L'appel 2025-2026 indiquait une clôture le " +
      "16 janvier 2026 ou à réception de 40 dossiers éligibles.",
    url: 'https://www.institutfrancais.com/fr/programme/residence-mobilite-professionnelle/mira',
    amountText: 'Bourse forfaitaire de mobilité',
    deadline: null,
    healthCheckKeyword: 'mira',
    tags: ['scenario', 'litterature', 'arts-visuels', 'international'],
    nextEditionStatus: 'awaiting-next-call',
  },
  {
    id: 'villa-kujoyama-2028',
    emitter: 'Villa Kujoyama',
    title: 'Villa Kujoyama — résidence de recherche à Kyoto',
    description:
      "Résidence pluridisciplinaire de recherche à Kyoto pour artistes, artisans et " +
      "chercheurs, avec séjours de quatre à six mois. Le programme est ouvert aux " +
      "candidats de nationalité française ou installés en France depuis plus de cinq ans. " +
      "La page officielle indique que le prochain appel pour les résidences 2028 sera " +
      "ouvert en 2027.",
    url: 'https://villakujoyama.jp/programme-de-residence/',
    amountText: 'Résidence de 4 à 6 mois à Kyoto',
    deadline: null,
    healthCheckKeyword: 'résidence',
    tags: ['scenario', 'litterature', 'arts-visuels', 'international'],
    nextEditionStatus: 'awaiting-2027-call',
  },
  {
    id: 'villa-medicis-pensionnaires',
    emitter: 'Académie de France à Rome — Villa Médicis',
    title: 'Villa Médicis — concours des pensionnaires',
    description:
      "Concours annuel de sélection des pensionnaires de l'Académie de France à Rome, " +
      "pour artistes, créateurs, créatrices et chercheurs accueillis en résidence longue " +
      "à Rome. La promotion 2025-2026 était sélectionnée pour une résidence à compter " +
      "du 1er septembre 2025. Prochain règlement à surveiller sur le site officiel.",
    url: 'https://www.villamedici.it/',
    amountText: 'Résidence longue à Rome',
    deadline: null,
    healthCheckKeyword: 'villa',
    tags: ['scenario', 'litterature', 'arts-visuels', 'international'],
    nextEditionStatus: 'awaiting-next-regulation',
  },
]

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const results = await Promise.allSettled(
    RESIDENCIES.map(async (item) => {
      const resp = await fetchWithRetry(item.url, { timeoutMs: 8000 })
      if (!resp.ok) {
        console.warn(`  [residences-internationales-fr] ${item.emitter}: HTTP ${resp.status} — skip`)
        return null
      }

      const html = (await resp.text()).toLowerCase()
      if (!html.includes(item.healthCheckKeyword)) {
        console.warn(
          `  [residences-internationales-fr] ${item.emitter}: keyword "${item.healthCheckKeyword}" absent — skip`,
        )
        return null
      }
      return item
    }),
  )

  return results
    .filter((result): result is PromiseFulfilledResult<ResidencyItem | null> => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((item): item is ResidencyItem => item !== null)
    .map((item) => ({
      external_id: item.id,
      payload: {
        emitter: item.emitter,
        title: item.title,
        description: item.description,
        deadline: item.deadline,
        url: item.url,
        amount_text: item.amountText,
        region_hint: null,
        discipline_hints: ['cinema', 'audiovisuel', 'litterature'],
        raw_json: {
          source_slug: slug,
          program_slug: item.id,
          next_edition_status: item.nextEditionStatus,
          suggest_awaiting_details: true,
          hint_disciplines_tags: item.tags,
          hint_type: 'residence',
          hint_hors_reseau_friendly: true,
          hint_requires_producer: false,
          hint_requires_editor: false,
        },
      },
    }))
}
