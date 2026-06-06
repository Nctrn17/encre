/**
 * Scraper agences et régions audiovisuelles encore absentes du pilote.
 *
 * Bucket éditorial de sources régionales à forte valeur. Les pages sont
 * officielles ou assimilées aux opérateurs régionaux ; les items portent un
 * statut "à surveiller" quand le calendrier précis doit être validé en curation.
 */

import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'regional-av-manquantes'

interface RegionalAid {
  id: string
  emitter: string
  title: string
  description: string
  url: string
  amountText: string | null
  regionHint: string
  healthCheckKeyword: string
  tags: string[]
  requiresProducer: boolean
  // Deadline ISO connue et vérifiée. null = dépôt au fil de l'eau / par
  // sessions sans date annuelle unique → l'item part en surveillance
  // curation (awaiting) au lieu d'être publié avec une fausse échéance.
  deadline?: string | null
}

const AIDS: RegionalAid[] = [
  {
    id: 'ciclic-aides-selectives-2026',
    emitter: 'Ciclic Centre-Val de Loire',
    title: 'Ciclic — aides sélectives cinéma et audiovisuel',
    description:
      "Guichet régional Centre-Val de Loire couvrant l'écriture, le développement et la " +
      "production cinéma/audiovisuel. La page officielle liste notamment l'aide à " +
      "l'écriture 1er et 2e long métrage fiction, le développement de fictions " +
      "audiovisuelles, les aides documentaires et les dispositifs animation. Calendrier " +
      "2026 à vérifier dans les règlements par aide.",
    url: 'https://ciclic.fr/cinema-audiovisuel/les-missions/les-aides-selectives',
    amountText: null,
    regionHint: 'FR-CVL',
    healthCheckKeyword: 'aide',
    tags: ['scenario', 'long-metrage', 'documentaire', 'animation'],
    requiresProducer: false,
  },
  {
    id: 'bretagne-cinema-facca-2026',
    emitter: 'Bretagne Cinéma',
    title: 'Bretagne Cinéma — FACCA écriture et développement',
    description:
      "Fonds d'aide à la création cinématographique et audiovisuelle de la Région " +
      "Bretagne, pour accompagner les projets de films de l'écriture à la production. " +
      "La page Bretagne Cinéma liste les volets écriture/développement fiction et " +
      "animation, documentaire, production et nouvelles écritures. Ancrage Bretagne à " +
      "vérifier selon le volet.",
    url: 'https://cinema.bretagne.bzh/financements/aides-cinema/',
    amountText: null,
    regionHint: 'FR-BRE',
    healthCheckKeyword: 'facca',
    tags: ['scenario', 'long-metrage', 'documentaire', 'animation'],
    requiresProducer: false,
  },
  {
    id: 'normandie-cinema-audiovisuel-2026',
    emitter: 'Normandie Images',
    title: 'Normandie Images — fonds cinéma et audiovisuel',
    description:
      "Fonds régional cinéma, audiovisuel et multimédia soutenant l'écriture, le " +
      "développement et la production d'œuvres de courte ou longue durée, documentaires " +
      "ou fictions, images différentes et nouveaux médias. Normandie Images met en œuvre " +
      "le dispositif pour la Région Normandie et publie le calendrier 2025/2026 des " +
      "commissions de soutien.",
    url: 'https://www.normandieimages.fr/creation-production/fonds-d-aides',
    amountText: null,
    regionHint: 'FR-NOR',
    healthCheckKeyword: "fonds d’aide",
    tags: ['scenario', 'long-metrage', 'court-metrage', 'documentaire', 'web'],
    requiresProducer: false,
  },
  {
    id: 'occitanie-aide-ecriture-av-2026',
    emitter: 'Région Occitanie',
    title: "Région Occitanie — aide à l'écriture d'œuvres audiovisuelles",
    description:
      "Aide régionale à l'écriture d'œuvres audiovisuelles pour développer la création " +
      "audiovisuelle et la diversité culturelle. La page officielle indique que les " +
      "demandes 2026 peuvent être renseignées en ligne à compter du 15 avril 2026. " +
      "Nationalité européenne ou cadre audiovisuel européen requis, avec conditions de " +
      "langue et de carence après aide précédente.",
    url: 'https://www.laregion.fr/Cinema-Audiovisuel-Multimedia-Aide-a-l-ecriture-d-oeuvres-audiovisuelles',
    amountText: null,
    regionHint: 'FR-OCC',
    healthCheckKeyword: 'audiovisuelles',
    tags: ['scenario', 'documentaire', 'serie', 'animation'],
    requiresProducer: false,
  },
  {
    id: 'grand-est-ecriture-av-2026',
    emitter: 'Région Grand Est',
    title: "Région Grand Est — aide à l'écriture cinéma, audiovisuel et nouveaux médias",
    description:
      "Aide régionale pour l'écriture cinéma, audiovisuel et nouveaux médias, inscrite " +
      "dans le fonds de soutien Grand Est à l'écriture, au développement et à la " +
      "production. Ouverte aux auteurs, réalisateurs et sociétés de production selon " +
      "les cas, avec ancrage Grand Est à vérifier dans le règlement.",
    url: 'https://www.grandest.fr/vos-aides-regionales/aide-a-lecriture-cinema-audiovisuel-nouveaux-medias',
    amountText: null,
    regionHint: 'FR-GES',
    healthCheckKeyword: 'écriture',
    tags: ['scenario', 'documentaire', 'animation', 'web'],
    requiresProducer: false,
  },
  {
    id: 'region-sud-cinema-av-2026',
    emitter: 'Région Sud',
    title: 'Région Sud — cadres cinéma et audiovisuel',
    description:
      "Cadres régionaux d'intervention cinéma et audiovisuel, incluant écriture, " +
      "développement et dispositifs immersifs ou interactifs selon les volets. " +
      "Les conditions précises et calendriers doivent être validés dans le règlement " +
      "courant avant diffusion sans statut de surveillance.",
    url: 'https://www.maregionsud.fr/fileadmin/user_upload/1-FICHIERS/2-DOCUMENTS/culture/REGLEMENT_CINEMA_REGION_SUD.pdf',
    amountText: null,
    regionHint: 'FR-PAC',
    healthCheckKeyword: 'cinema',
    tags: ['scenario', 'long-metrage', 'documentaire', 'web'],
    requiresProducer: false,
  },
  {
    id: 'pays-de-la-loire-creation-av-2026',
    emitter: 'Région Pays de la Loire',
    title: "Région Pays de la Loire — fonds de création (écriture et développement)",
    description:
      "Fonds d'aide à la création cinématographique, audiovisuelle et numérique de la " +
      "Région Pays de la Loire. Volet écriture/développement ouvert aux auteurs, " +
      "réalisateurs et scénaristes résidant en Pays de la Loire (réécriture de scénario, " +
      "développement, pilotes). En complément, La Plateforme (pôle ciné-AV régional) " +
      "porte le « Parcours d'auteur·rice·s » : formation à l'écriture filmique sur six " +
      "mois pour 6 auteur·rice·s documentaire et 6 fiction, combinant ateliers et " +
      "résidence. Dépôt dématérialisé via le Portail des Aides ; calendrier à valider.",
    url: 'https://www.paysdelaloire.fr/les-aides/fonds-daide-la-creation-cinematographique-audiovisuelle-et-numerique',
    amountText: null,
    regionHint: 'FR-PDL',
    healthCheckKeyword: 'audiovisuel',
    tags: ['scenario', 'long-metrage', 'court-metrage', 'documentaire'],
    requiresProducer: false,
    deadline: null,
  },
  // Le fonds BFC RI 53-05 couvre deux dispositifs distincts (comités de lecture
  // séparés, deux fenêtres de dépôt distinctes) : on les sépare en deux fiches
  // plutôt qu'un item « deux en un ». Titre + deadline stables = fingerprint
  // stable → la curation manuelle des sections survit aux re-scrapes.
  {
    id: 'bourgogne-franche-comte-ecriture-fiction-2026',
    emitter: 'Région Bourgogne-Franche-Comté',
    title: "Région Bourgogne-Franche-Comté — aide à l'écriture (fiction longue)",
    description:
      "Aide à l'écriture du fonds cinéma-audiovisuel de la Région Bourgogne-Franche-Comté, " +
      "pour les auteur·rices de fiction longue ayant déjà un film à leur actif. Projet en " +
      "tout début d'écriture, lié au territoire par la résidence de l'auteur·rice ou par le " +
      "sujet. Contact préalable obligatoire avec le référent cinéma avant tout dépôt.",
    url: 'https://www.bourgognefranchecomte.fr/node/636',
    amountText: '2 000 à 5 000 €',
    regionHint: 'FR-BFC',
    healthCheckKeyword: 'documentaire',
    tags: ['scenario', 'long-metrage'],
    requiresProducer: false,
    // Fiction : dépôt du 1ᵉʳ au 30 novembre (règlement RI 53-05).
    deadline: '2026-11-30T23:59:59+01:00',
  },
  {
    id: 'bourgogne-franche-comte-ecriture-documentaire-2026',
    emitter: 'Région Bourgogne-Franche-Comté',
    title: "Région Bourgogne-Franche-Comté — aide à l'écriture (documentaire)",
    description:
      "Aide à l'écriture du fonds cinéma-audiovisuel de la Région Bourgogne-Franche-Comté, " +
      "pour les auteur·rices de documentaire ayant déjà un film à leur actif. Projet en tout " +
      "début d'écriture, lié au territoire par la résidence de l'auteur·rice ou par le sujet. " +
      "Contact préalable obligatoire avec le référent cinéma avant tout dépôt.",
    url: 'https://www.bourgognefranchecomte.fr/node/636',
    amountText: '2 000 à 5 000 €',
    regionHint: 'FR-BFC',
    healthCheckKeyword: 'documentaire',
    tags: ['scenario', 'documentaire'],
    requiresProducer: false,
    // Documentaire : dépôt du 1ᵉʳ au 31 décembre (règlement RI 53-05).
    deadline: '2026-12-31T23:59:59+01:00',
  },
  {
    id: 'corse-aide-ecriture-av-2026',
    emitter: 'Collectivité de Corse',
    title: "Collectivité de Corse — aide à l'écriture cinéma et audiovisuel",
    description:
      "Aide de la Collectivité de Corse aux frais d'écriture d'un scénario (repérages, " +
      "voyages, travail avec un scénariste ou dialoguiste) de court métrage, long métrage, " +
      "documentaire, série ou téléfilm, et à la prise en charge des frais de résidence " +
      "d'écriture (conventionnement CNC). L'auteur est explicitement éligible (pas " +
      "seulement les sociétés de production). Bonus de 20 % pour les scénarios d'expression " +
      "corse. Avis d'un comité technique consultatif ; échéancier en convention.",
    url: 'https://www.isula.corsica/culture/REGLEMENT-DES-AIDES-POUR-LA-CULTURE-SECTEUR-AUDIOVISUEL-ET-CINEMA_a5029.html',
    amountText: '+20 % pour les scénarios d’expression corse',
    regionHint: 'FR-COR',
    healthCheckKeyword: 'audiovisuel',
    tags: ['scenario', 'long-metrage', 'court-metrage', 'documentaire', 'serie'],
    requiresProducer: false,
    deadline: null,
  },
  {
    id: 'reunion-aide-ecriture-scenario-2026',
    emitter: 'Région Réunion',
    title: "Région Réunion — aide à l'écriture de scénario",
    description:
      "Fonds de soutien à l'audiovisuel, au cinéma et au multimédia de la Région Réunion " +
      "(conventionnement CNC). L'aide à l'écriture s'adresse aux personnes physiques " +
      "(auteurs) dont le projet met en valeur La Réunion ou son environnement dans l'océan " +
      "Indien : allocation forfaitaire de 3 000 à 4 000 € pour le développement d'un " +
      "scénario, complétée d'une bourse de résidence de 1 500 €. Dépôt via le portail de " +
      "démarches régional ; calendrier des commissions à valider.",
    url: 'https://agencefilm.re/dispositifs/aides-soutiens/mesures-daides/',
    amountText: '3 000 – 4 000 € (forfait) + 1 500 € bourse de résidence',
    regionHint: 'FR-LRE',
    healthCheckKeyword: 'aide',
    tags: ['scenario', 'long-metrage', 'court-metrage', 'documentaire'],
    requiresProducer: false,
    deadline: null,
  },
]

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const results = await Promise.allSettled(
    AIDS.map(async (aid) => {
      const resp = await fetchWithRetry(aid.url, { timeoutMs: 8000 })
      if (!resp.ok) {
        console.warn(`  [regional-av-manquantes] ${aid.emitter}: HTTP ${resp.status} — skip`)
        return null
      }

      const body = (await resp.text()).toLowerCase()
      if (!body.includes(aid.healthCheckKeyword)) {
        console.warn(
          `  [regional-av-manquantes] ${aid.emitter}: keyword "${aid.healthCheckKeyword}" absent — skip`,
        )
        return null
      }
      return aid
    }),
  )

  return results
    .filter((result): result is PromiseFulfilledResult<RegionalAid | null> => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((aid): aid is RegionalAid => aid !== null)
    .map((aid) => {
      const hasDeadline = Boolean(aid.deadline)
      return {
        external_id: aid.id,
        payload: {
          emitter: aid.emitter,
          title: aid.title,
          description: aid.description,
          deadline: aid.deadline ?? null,
          url: aid.url,
          amount_text: aid.amountText,
          region_hint: aid.regionHint,
          discipline_hints: ['cinema', 'audiovisuel'],
          raw_json: {
            source_slug: slug,
            program_slug: aid.id,
            // Avec une deadline vérifiée → publiable. Sinon (dépôt au fil
            // de l'eau / sessions) → surveillance curation pour ne pas
            // afficher de fausse échéance.
            next_edition_status: hasDeadline ? 'open' : 'awaiting-calendar-review',
            suggest_awaiting_details: !hasDeadline,
            hint_disciplines_tags: aid.tags,
            hint_type: 'bourse',
            hint_hors_reseau_friendly: !aid.requiresProducer,
            hint_requires_producer: aid.requiresProducer,
            hint_requires_editor: false,
          },
        },
      }
    })
}
