/**
 * Scraper outremer-territoires — fonds DROM-COM ciblés.
 *
 * Curation manuelle de 6 dispositifs accessibles aux auteurs ultra-marins
 * ou ciblant les cultures d'outre-mer. Couverture des principaux
 * territoires : Guadeloupe, Martinique, Guyane, Réunion, Mayotte.
 *
 * À noter : la DAC Mayotte n'a pas de ligne « aide à l'écriture cinéma »
 * spécifique, mais le programme Résidences d'artistes en territoire
 * couvre l'audiovisuel. C'est moins ciblé que les autres mais reste
 * pertinent.
 *
 * Pattern « health-check + static emit » avec health-check parallèle.
 * Slug source 'outremer-territoires' = bucket d'ingestion. Chaque item
 * porte son propre `emitter` correct.
 *
 * Skippé :
 *   - Polynésie française, Nouvelle-Calédonie, Wallis-et-Futuna, Saint-
 *     Pierre-et-Miquelon — pas trouvé de dispositifs cinéma actifs lors
 *     de la curation mai 2026. À reprendre.
 *   - SACEM Outre-mer (musique) — hors scope pilote scénariste AV.
 */

import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'outremer-territoires'

interface OmItem {
  externalId: string
  emitter: string
  title: string
  description: string
  url: string
  amountText: string | null
  deadline: string | null
  healthCheckUrl: string
  healthCheckKeyword: string
  hintRequiresProducer: boolean
  hintHorsReseauFriendly: boolean
  hintDisciplinesTags: string[]
  hintRegionCode: string | null
}

const ITEMS_2026: OmItem[] = [
  {
    externalId: 'cnc-aide-cultures-outremer-2026',
    emitter: 'CNC · Aide sélective cultures d\'outre-mer',
    title: 'CNC — Aide sélective pour les œuvres cinématographiques intéressant les cultures d\'outre-mer',
    description:
      "Aide nationale du CNC destinée à promouvoir la production de courts et longs métrages " +
      "présentant un intérêt culturel pour la Guadeloupe, la Guyane, la Martinique, " +
      "la Réunion, Mayotte et Saint-Pierre-et-Miquelon. Soutien aux œuvres qui contribuent " +
      "à la meilleure connaissance de ces collectivités, à leur promotion auprès d'un large " +
      "public, à la valorisation de leurs expressions culturelles ou à la formation de leurs " +
      "résidents aux métiers du cinéma. Société de production française requise — l'auteur·rice " +
      "candidate via son producteur attaché.",
    url: 'https://www.cnc.fr/professionnels/aides-et-financements/multi-sectoriel/production/aide-selective-pour-les-oeuvres-cinematographiques-interessant-les-cultures-doutremer_191124',
    amountText: null,
    deadline: null,
    healthCheckUrl: 'https://www.cnc.fr/',
    healthCheckKeyword: 'cnc',
    hintRequiresProducer: true,
    hintHorsReseauFriendly: false,
    hintDisciplinesTags: ['long-metrage', 'court-metrage', 'documentaire', 'outremer'],
    hintRegionCode: null,
  },
  {
    externalId: 'region-reunion-aide-ecriture-2026',
    emitter: 'Région Réunion · Commission Film Réunion',
    title: 'Région Réunion — Aide à l\'écriture de scénario',
    description:
      "Dotation forfaitaire de 3 000 € pour l'élaboration d'un scénario audiovisuel ou " +
      "cinématographique (fiction, animation, documentaire de création). Bénéficiaires : " +
      "personnes physiques (auteurs) dont le projet met particulièrement en valeur La Réunion " +
      "ou son environnement de l'océan Indien. Candidature directe par l'auteur·rice, " +
      "sans producteur requis. Commission Film Réunion : 4 sessions par an depuis 1999, " +
      "en partenariat avec le CNC et l'État. Calendrier précis publié par l'Agence Film Réunion.",
    url: 'https://www.regionreunion.com/aides-services/article/aide-a-l-ecriture-de-scenario',
    amountText: '3 000 €',
    deadline: null,
    healthCheckUrl: 'https://www.regionreunion.com/',
    healthCheckKeyword: 'réunion',
    hintRequiresProducer: false,
    hintHorsReseauFriendly: true,
    hintDisciplinesTags: ['scenario', 'documentaire', 'animation', 'outremer'],
    hintRegionCode: 'FR-LRE', // INSEE code La Réunion
  },
  {
    externalId: 'region-guadeloupe-fonds-2024-2030',
    emitter: 'Région Guadeloupe',
    title: 'Région Guadeloupe — Fonds régional d\'aide aux œuvres audiovisuelles et cinématographiques 2024-2030',
    description:
      "Convention pluri-annuelle 2024-2030 État/CNC/Région Guadeloupe. Soutient la création " +
      "et la production d'œuvres cinématographiques et audiovisuelles de qualité, et " +
      "encourage l'utilisation des ressources territoriales. Trois volets : aides à l'écriture " +
      "(auteurs et réécriture), aides au développement (sociétés de production et co-producteurs " +
      "diffuseurs), aides à la production. Candidatures par mail à cinema.audio@cr-guadeloupe.fr.",
    url: 'https://www.regionguadeloupe.fr/les-aides-les-services/guide-des-aides/detail/actualites/fonds-de-cooperation-cinematographique-et-audiovisuelle-dans-le-cadre-de-la-convention-etatcncregi/',
    amountText: null,
    deadline: null,
    healthCheckUrl: 'https://www.regionguadeloupe.fr/',
    healthCheckKeyword: 'guadeloupe',
    hintRequiresProducer: false,
    hintHorsReseauFriendly: true,
    hintDisciplinesTags: ['scenario', 'long-metrage', 'court-metrage', 'documentaire', 'outremer'],
    hintRegionCode: 'FR-GP', // INSEE code Guadeloupe
  },
  {
    externalId: 'ctm-martinique-fonds-territorial-2026',
    emitter: 'Collectivité Territoriale de Martinique (CTM)',
    title: 'CTM Martinique — Fonds territorial d\'aide à la création et à la production',
    description:
      "Fonds territorial de la Collectivité Territoriale de Martinique en partenariat avec " +
      "le CNC et l'État. Quatre volets : aide à l'écriture, aide au développement, aide à la " +
      "production, bourse de résidence. L'aide à l'écriture peut couvrir jusqu'à 100 % des " +
      "coûts éligibles, dont 80 % pour les frais de l'auteur·rice et 20 % pour les frais " +
      "logistiques. Comité de lecture qui examine les projets et émet un avis. Candidatures " +
      "à comitecinema.ctm@collectivitedemartinique.mq.",
    url: 'https://mesaidespubliques.infogreffe.fr/aides/aide-creation-production-ouvres-cinematographiques-audiovisuelles',
    amountText: 'Jusqu\'à 100 % des coûts éligibles (écriture)',
    deadline: null,
    healthCheckUrl: 'https://www.collectivitedemartinique.mq/',
    healthCheckKeyword: 'martinique',
    hintRequiresProducer: false,
    hintHorsReseauFriendly: true,
    hintDisciplinesTags: ['scenario', 'long-metrage', 'court-metrage', 'documentaire', 'outremer'],
    hintRegionCode: 'FR-MQ', // INSEE code Martinique
  },
  {
    externalId: 'ctg-guyane-soutien-2026',
    emitter: 'Collectivité Territoriale de Guyane (CTG)',
    title: 'CTG Guyane — Soutien à la création cinématographique et audiovisuelle',
    description:
      "Fonds de la Collectivité Territoriale de Guyane en partenariat avec le CNC et la DAC " +
      "Guyane. Trois composantes : aide à l'écriture (auteurs/réalisateurs), aide au " +
      "développement (sociétés de production), aide à la production. Pour l'aide à l'écriture, " +
      "les bénéficiaires sont les auteurs ou réalisateurs personnes physiques. La société de " +
      "production éligible (pour les volets dev + production) doit avoir son siège en Guyane, " +
      "France ou UE/EEE. Candidatures par mail à scav@ctguyane.fr, date limite 15 mars 2026 " +
      "(édition 2026 close).",
    url: 'https://www.ctguyane.fr/aides-creation-cinematographique-audiovisuelle/',
    amountText: null,
    deadline: null, // 15 mars 2026 passé
    healthCheckUrl: 'https://www.ctguyane.fr/',
    healthCheckKeyword: 'guyane',
    hintRequiresProducer: false,
    hintHorsReseauFriendly: true,
    hintDisciplinesTags: ['scenario', 'long-metrage', 'court-metrage', 'documentaire', 'outremer'],
    hintRegionCode: 'FR-GF', // INSEE code Guyane
  },
  {
    externalId: 'dac-mayotte-residences-2026',
    emitter: 'DAC Mayotte',
    title: 'DAC Mayotte — Résidences d\'artistes en territoire (volet audiovisuel)',
    description:
      "Partenariat entre la Direction des Affaires Culturelles de Mayotte, la Communauté " +
      "d'Agglomération du Grand Nord de Mayotte et la Communauté de Communes de Petite-Terre. " +
      "Soutient la présence artistique en ruralité sur des temps longs et facilite la mobilité " +
      "des artistes (toutes disciplines, y compris audiovisuel et écriture). À noter : pas de " +
      "ligne « aide à l'écriture cinéma » spécifique, le programme est multidisciplinaire. " +
      "Contact : Gaëlle Metelus (gaelle.metelus@culture.gouv.fr) — informations précises sur " +
      "les sessions à venir disponibles directement auprès de la DAC.",
    url: 'https://www.culture.gouv.fr/Regions/DAC-Mayotte/L-action-artistique-et-culturelle-a-Mayotte/La-creation-artistique-a-Mayotte/Les-Aides-a-la-creation-2023',
    amountText: null,
    deadline: null,
    healthCheckUrl: 'https://www.culture.gouv.fr/Regions/DAC-Mayotte',
    healthCheckKeyword: 'mayotte',
    hintRequiresProducer: false,
    hintHorsReseauFriendly: true,
    hintDisciplinesTags: ['scenario', 'documentaire', 'outremer'],
    hintRegionCode: 'FR-YT', // INSEE code Mayotte
  },
]

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const results = await Promise.allSettled(
    ITEMS_2026.map(async (it) => {
      try {
        const resp = await fetchWithRetry(it.healthCheckUrl, { timeoutMs: 8000 })
        if (!resp.ok) {
          console.warn(`  [outremer] ${it.emitter}: HTTP ${resp.status} — skip`)
          return null
        }
        const html = (await resp.text()).toLowerCase()
        if (!html.includes(it.healthCheckKeyword)) {
          console.warn(
            `  [outremer] ${it.emitter}: keyword "${it.healthCheckKeyword}" absent — skip`,
          )
          return null
        }
        return it
      } catch (err) {
        console.warn(`  [outremer] ${it.emitter}: ${(err as Error).message} — skip`)
        return null
      }
    }),
  )

  const surviving = results
    .filter((r): r is PromiseFulfilledResult<OmItem | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((v): v is OmItem => v !== null)

  return surviving.map((it) => ({
    external_id: it.externalId,
    payload: {
      emitter: it.emitter,
      title: it.title,
      description: it.description,
      deadline: it.deadline,
      url: it.url,
      amount_text: it.amountText,
      region_hint: it.hintRegionCode,
      discipline_hints: ['audiovisuel'],
      raw_json: {
        source_slug: slug,
        item_external_id: it.externalId,
        hint_disciplines_tags: it.hintDisciplinesTags,
        hint_requires_producer: it.hintRequiresProducer,
        hint_hors_reseau_friendly: it.hintHorsReseauFriendly,
        hint_requires_editor: false,
        hint_outremer: true,
        hint_region_code: it.hintRegionCode,
      },
    },
  }))
}
