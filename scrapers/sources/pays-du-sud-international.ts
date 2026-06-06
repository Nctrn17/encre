/**
 * Scraper pays-du-sud-international — agrégat de 8 fonds majeurs
 * accessibles aux créateurs des pays du Sud.
 *
 * Pattern « health-check + static emit » : chaque fonds a son site
 * propre, son cycle propre, et expose ses appels dans des structures
 * HTML hétérogènes (souvent SPA + PDF). Une couverture exhaustive
 * par scraping individuel demanderait 8 scrapers + 8 migrations + un
 * tour Firecrawl pour les SPA — ROI faible. À la place, on émet ici
 * 8 items représentatifs avec lien vers la source officielle, mis à
 * jour 1× par an quand les calendriers tournent.
 *
 * Chaque item porte son propre `emitter` correct — ils ne sont pas
 * agrégés sous un faux émetteur. La source slug 'pays-du-sud-international'
 * sert juste de bucket d'ingestion.
 *
 * Critères de sélection :
 *   - Fonds international ou régional reconnu (Berlinale, IFFR, IDFA,
 *     CNC, Festival Marrakech, FESPACO, JCC Carthage, Africadoc).
 *   - Accessible aux auteurs (pas exclusivement aux producteurs, sauf
 *     ACM CNC et WCF qui requièrent un producteur partenaire).
 *   - Calendrier annuel stable ou cycles glissants.
 */

import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'pays-du-sud-international'

interface FundItem {
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
  hintDisciplinesTags: string[]
}

const FUNDS_2026: FundItem[] = [
  {
    externalId: 'wcf-berlinale-2026',
    emitter: 'World Cinema Fund · Berlinale',
    title: 'World Cinema Fund — production + post-production + distribution',
    description:
      "Fonds de la Berlinale et de la Kulturstiftung des Bundes pour la production, " +
      "post-production et distribution de longs métrages et documentaires de création " +
      "venant d'Amérique latine, Caraïbes, Pacifique, Afrique, Moyen-Orient, Asie centrale " +
      "et du Sud-Est, Caucase, plus Bangladesh, Népal, Mongolie, Sri Lanka. Subventions " +
      "30 000 à 60 000 € pour 10-15 films par an. Exigence structurante : coopération " +
      "avec une société de production allemande (ou UE avec branche allemande). Long " +
      "métrage 70 min mini, sortie salle prévue. Cycles plusieurs fois par an.",
    url: 'https://www.berlinale.de/en/wcf/funding-programmes/production-support/all-programmes.html',
    amountText: '30 000 à 60 000 €',
    deadline: null,
    healthCheckUrl: 'https://www.berlinale.de/en/wcf/home/welcome.html',
    healthCheckKeyword: 'world cinema fund',
    hintRequiresProducer: true,
    hintDisciplinesTags: ['long-metrage', 'documentaire', 'pays-du-sud'],
  },
  {
    externalId: 'hbf-rotterdam-2026',
    emitter: 'Hubert Bals Fund · IFFR Rotterdam',
    title: 'Hubert Bals Fund — script and project development support',
    description:
      "Soutien au développement de scénario du Hubert Bals Fund (IFFR Rotterdam) : " +
      "jusqu'à 10 000 € pour la recherche, écriture, traduction, recours à un coach " +
      "ou un script consultant, ou présentation du projet à des rencontres de " +
      "coproduction internationales. Cible : auteurs/réalisateurs de pays où le " +
      "financement local est limité ou restrictif. Candidature en early development. " +
      "Une candidature par cycle, deux projets max par an. Calendrier des prochaines " +
      "deadlines mis à jour sur le site IFFR.",
    url: 'https://iffr.com/en/hubert-bals-fund/funding-schemes/hbf-script-and-project-development-support',
    amountText: "jusqu'à 10 000 €",
    deadline: null,
    healthCheckUrl: 'https://iffr.com/en/hubert-bals-fund',
    healthCheckKeyword: 'hubert bals',
    hintRequiresProducer: false,
    hintDisciplinesTags: ['scenario', 'long-metrage', 'pays-du-sud'],
  },
  {
    externalId: 'idfa-bertha-classic-2026',
    emitter: 'IDFA Bertha Fund · Amsterdam',
    title: 'IDFA Bertha Fund — IBF Classic (development + production + post-prod)',
    description:
      "Fonds de l'IDFA (Amsterdam) pour le documentaire de création indépendant. " +
      "Deux types d'aides : développement (jusqu'à 7 500 €) ou production/post-production " +
      "(jusqu'à 25 000 €). Cible : auteurs documentaires originaires et résidant dans un " +
      "pays de la liste IBF Classic (Afrique, Asie, Europe de l'Est, Amérique latine, " +
      "Caraïbes, Océanie). La prochaine deadline sera annoncée — la session de février " +
      "2026 est close. Le 1er avril 2026 reste ouvert pour le volet IBF Europe Minority " +
      "Co-production.",
    url: 'https://professionals.idfa.nl/training-funding/funding/ibf-classic/',
    amountText: 'jusqu\'à 25 000 € (production)',
    deadline: null,
    healthCheckUrl: 'https://professionals.idfa.nl/training-funding/funding/about-the-idfa-bertha-fund/',
    healthCheckKeyword: 'bertha fund',
    hintRequiresProducer: false,
    hintDisciplinesTags: ['documentaire', 'pays-du-sud'],
  },
  {
    externalId: 'cnc-acm-2026',
    emitter: 'CNC · Aide aux Cinémas du Monde',
    title: 'Aide aux Cinémas du Monde — 3 commissions (CNC + MEAE)',
    description:
      "Co-financée par le CNC et le ministère de l'Europe et des Affaires étrangères. " +
      "Aide aux co-productions internationales entre la France et les pays du monde, " +
      "structurée en 3 commissions : avant réalisation 1ers/2es films (présidée par " +
      "Frédérique Dumas et Jacques Fieschi), avant réalisation cinéastes confirmés, " +
      "post-production. Nouvelles modalités depuis le 1er janvier 2026. Société de " +
      "production française obligatoire ; le réalisateur peut être originaire de " +
      "n'importe quel pays. Fiction, animation, documentaire de création, sortie salle " +
      "France prévue.",
    url: 'https://www.cnc.fr/professionnels/aides-et-financements/multi-sectoriel/production/aide-aux-cinemas-du-monde_190862',
    amountText: null,
    deadline: null,
    healthCheckUrl: 'https://www.cnc.fr/professionnels/aides-et-financements/multi-sectoriel/production/aide-aux-cinemas-du-monde_190862',
    healthCheckKeyword: 'cinémas du monde',
    hintRequiresProducer: true,
    hintDisciplinesTags: ['long-metrage', 'documentaire', 'animation', 'pays-du-sud'],
  },
  {
    externalId: 'atlas-marrakech-2026',
    emitter: 'Festival International du Film de Marrakech · Atlas Workshops',
    title: 'Atlas Workshops Marrakech — projets en développement + films en post-prod',
    description:
      "Programme d'accompagnement de talents lancé en 2018 par le FIFM. Soutient les " +
      "cinéastes marocains, arabes et africains travaillant sur leur 1er, 2e ou 3e long " +
      "métrage de fiction, documentaire ou animation, à deux stades : projets en " +
      "développement et films en post-production. Mentorat sur scénario, production, " +
      "distribution, montage, musique. Édition 2025 : 30 nov - 4 déc 2025, 27 projets " +
      "sélectionnés. Prochaine édition fin 2026, candidatures ouvrent généralement à " +
      "l'été.",
    url: 'https://atlasateliers.marrakech-festival.com/en/open-call',
    amountText: null,
    deadline: null,
    healthCheckUrl: 'https://atlasateliers.marrakech-festival.com/fr',
    healthCheckKeyword: 'atlas',
    hintRequiresProducer: false,
    hintDisciplinesTags: ['long-metrage', 'documentaire', 'animation', 'scenario', 'pays-du-sud'],
  },
  {
    externalId: 'africadoc-tenk-2026',
    emitter: 'Africadoc · Tënk Saint-Louis',
    title: 'Africadoc Tënk — rencontres + formation scénariste documentaire',
    description:
      "Programme de rencontres de coproduction documentaire à Saint-Louis du Sénégal, " +
      "co-construit avec Docmonde. Cible : scénaristes documentaires d'Afrique " +
      "francophone (centrale et de l'Ouest). Formation à l'écriture, mentorat producteur, " +
      "ouverture marché international. Adossé au Master 2 Documentaire de l'Université " +
      "Gaston Berger. Cycles annuels, candidatures par appel via Docmonde et OIF.",
    url: 'http://africadoc.org/',
    amountText: 'Formation, pas de bourse directe',
    deadline: null,
    healthCheckUrl: 'http://www.docmonde.org/africadoc/',
    healthCheckKeyword: 'africadoc',
    hintRequiresProducer: false,
    hintDisciplinesTags: ['documentaire', 'scenario', 'formation', 'pays-du-sud'],
  },
  {
    externalId: 'jcc-carthage-pro-2026',
    emitter: 'JCC Carthage Pro — Chabaka & Takmil',
    title: 'Carthage Pro (JCC Tunisie) — ateliers Chabaka (dev) et Takmil (post-prod)',
    description:
      "Section professionnelle des Journées Cinématographiques de Carthage (Tunisie), " +
      "structurée en deux ateliers complémentaires : Chabaka pour les projets en " +
      "développement (long métrage fiction/doc), Takmil pour les films en post-production. " +
      "Mentorat scénario, producteur, distribution. Cible : cinéastes arabes et africains. " +
      "Édition 2025 : 15-18 décembre 2025, 17 projets sélectionnés (9 Chabaka + 8 Takmil). " +
      "Candidatures pour l'édition 2026 généralement en août-septembre.",
    url: 'https://jcctunisie.org/fr',
    amountText: null,
    deadline: null,
    healthCheckUrl: 'https://jcctunisie.org/fr',
    healthCheckKeyword: 'carthage',
    hintRequiresProducer: false,
    hintDisciplinesTags: ['long-metrage', 'documentaire', 'scenario', 'pays-du-sud'],
  },
  {
    externalId: 'fespaco-yennenga-academy-2027',
    emitter: 'FESPACO · Yennenga Academy',
    title: 'Yennenga Academy 2027 — résidence FESPACO Ouagadougou',
    description:
      "Programme de la FESPACO (Festival panafricain du cinéma de Ouagadougou) destiné " +
      "aux jeunes cinéastes émergents d'Afrique et de la diaspora. Quatrième édition " +
      "intégrée à la 30e FESPACO (27 février - 6 mars 2027). 15 participants sélectionnés " +
      "pour des activités du 28 février au 5 mars 2027 : ateliers, masterclasses, " +
      "rencontres avec professionnels du secteur. Candidatures ouvertes depuis le " +
      "30 mars 2026, jusqu'au 20 septembre 2026 (23h59 UTC).",
    url: 'https://fespaco.org/en/our-services/call-for-projects-yennenga-academy/',
    amountText: 'Programme gratuit',
    deadline: '2026-09-20T23:59:59+00:00',
    healthCheckUrl: 'https://fespaco.org/',
    healthCheckKeyword: 'fespaco',
    hintRequiresProducer: false,
    hintDisciplinesTags: ['scenario', 'long-metrage', 'documentaire', 'formation', 'pays-du-sud'],
  },
]

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  // Health-check parallèle sur chaque fonds : si la racine répond, l'item
  // est émis. Si elle 404 / timeout, on skip cet item (le fonds peut avoir
  // changé d'URL). Cela évite de propager des liens cassés.
  const results = await Promise.allSettled(
    FUNDS_2026.map(async (f) => {
      try {
        const resp = await fetchWithRetry(f.healthCheckUrl, { timeoutMs: 8000 })
        if (!resp.ok) {
          console.warn(`  [pays-du-sud] ${f.emitter}: health-check HTTP ${resp.status} — skip`)
          return null
        }
        const html = (await resp.text()).toLowerCase()
        if (!html.includes(f.healthCheckKeyword)) {
          console.warn(`  [pays-du-sud] ${f.emitter}: keyword "${f.healthCheckKeyword}" absent — skip`)
          return null
        }
        return f
      } catch (err) {
        console.warn(`  [pays-du-sud] ${f.emitter}: ${(err as Error).message} — skip`)
        return null
      }
    }),
  )

  const surviving = results
    .filter((r): r is PromiseFulfilledResult<FundItem | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((v): v is FundItem => v !== null)

  return surviving.map((f) => ({
    external_id: f.externalId,
    payload: {
      emitter: f.emitter,
      title: f.title,
      description: f.description,
      deadline: f.deadline,
      url: f.url,
      amount_text: f.amountText,
      region_hint: 'international',
      discipline_hints: ['audiovisuel'],
      raw_json: {
        source_slug: slug,
        fund_external_id: f.externalId,
        hint_geo_scope: 'international',
        hint_pays_du_sud: true,
        hint_disciplines_tags: f.hintDisciplinesTags,
        hint_requires_producer: f.hintRequiresProducer,
        hint_hors_reseau_friendly: !f.hintRequiresProducer,
      },
    },
  }))
}
