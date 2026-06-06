/**
 * Scraper Fonds Image de la Francophonie (OIF + TV5MONDE+).
 *
 * Source : https://www.imagesfrancophones.org/
 * Portail unifié OIF + TV5MONDE+ qui gère 4 commissions par an
 * (2 cinéma-fiction + 2 documentaires/séries) + le Fonds Francophonie
 * TV5MONDE+ (séries jeunesse 15-25 ans).
 *
 * Éligibilité : créateurs des 35 pays francophones du Sud (Afrique,
 * Caraïbes, Asie, Amérique latine), low/middle income countries.
 * **PAS** éligible aux résidents français.
 *
 * Stratégie : pattern « health-check + static emit » car le calendrier
 * exact des sessions n'est dans aucune page HTML stable (publié dans le
 * Notice PDF qui change chaque année). On émet 3 items représentatifs
 * du cycle annuel avec tag 'pays-du-sud' pour la section dédiée.
 *
 * Migration 0022 prévoit `next_edition_status` pour signaler « cycle
 * en cours, dates exactes publiées sur le Notice PDF ».
 */

import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'
import { warnIfEditionYearStale } from '../lib/edition-guard'

export const slug = 'oif-images-francophones'

const BASE_URL = 'https://www.imagesfrancophones.org'
const EMITTER = 'OIF · Fonds Image de la Francophonie'

const EDITION_2026 = {
  year: 2026,
  // Pas de deadline ferme exposée : 4 sessions/an alternées entre
  // cinéma-fiction et docs/séries. On affiche null + une note dans la
  // description, le bouton « Voir le calendrier officiel » pointe vers
  // imagesfrancophones.org/accespro/.
  applyUrl: `${BASE_URL}/accespro/`,
  presentationUrl: `${BASE_URL}/soutiens/fonds-image-de-la-francophonie/presentation`,
  modalitesUrl: `${BASE_URL}/soutiens/fonds-image-de-la-francophonie/modalites`,
}

interface Volet {
  slug: string
  title: string
  description: string
  disciplinesTagsHint: string[]
  url: string
}

const VOLETS: Volet[] = [
  {
    slug: 'cinema-fiction',
    title: 'OIF · Fonds Image de la Francophonie — Cinéma fiction',
    description:
      "Soutien au développement, à la production ou à la finition de longs métrages de fiction " +
      "portés par des créateurs ressortissants de l'un des 35 pays du Sud membres de l'OIF " +
      "(Afrique, Caraïbes, Asie, Amérique latine). Deux commissions par an. Enveloppe annuelle " +
      "globale : 1 million d'euros répartis entre fictions et documentaires/séries. " +
      "Le calendrier précis des sessions est publié dans le Notice annuel. " +
      "Éligibilité strictement réservée aux nationalités des pays éligibles — pas ouvert aux " +
      "ressortissants français de métropole.",
    disciplinesTagsHint: ['long-metrage', 'scenario', 'pays-du-sud'],
    url: `${BASE_URL}/soutiens/fonds-image-de-la-francophonie/presentation`,
  },
  {
    slug: 'documentaire-serie',
    title: 'OIF · Fonds Image de la Francophonie — Documentaires & séries',
    description:
      "Soutien au développement, à la production ou à la finition de documentaires et de séries " +
      "(fiction et animation) portés par des créateurs ressortissants des 35 pays du Sud membres " +
      "de l'OIF. Deux commissions par an. Livrables types pour les séries : bible (5-10 pages : " +
      "concept, personnages, arches narratives) + scénario (5-10 pages). " +
      "Éligibilité strictement réservée aux nationalités des pays éligibles.",
    disciplinesTagsHint: ['documentaire', 'serie', 'bible', 'animation', 'pays-du-sud'],
    url: `${BASE_URL}/soutiens/fonds-image-de-la-francophonie/presentation`,
  },
  {
    slug: 'tv5mondeplus-francophonie',
    title: 'Fonds Francophonie TV5MONDE+ — séries jeunesse',
    description:
      "Co-financé par TV5MONDE et l'OIF, soutient la production d'œuvres audiovisuelles innovantes " +
      "pour les 15-25 ans dans une approche 360° (TV + numérique + réseaux sociaux). " +
      "Financement jusqu'à 100 000 euros + diffusion mondiale sur la plateforme TV5MONDE+. " +
      "Producteur enregistré dans un pays francophone du Sud requis. Création originale en français.",
    disciplinesTagsHint: ['serie', 'web', 'pays-du-sud'],
    url: `${BASE_URL}/soutiens/fonds-francophonie-tv5mondeplus/presentation`,
  },
]

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const resp = await fetchWithRetry(BASE_URL)
  if (!resp.ok) {
    console.warn(`  [oif] portail HTTP ${resp.status} — dispositif suspect`)
    return []
  }
  const html = await resp.text()
  if (!html.toLowerCase().includes('francophonie') && !html.toLowerCase().includes('fonds image')) {
    console.warn('  [oif] portail ne mentionne plus Francophonie / Fonds Image — restructuré ?')
    return []
  }

  // Dépôt glissant (4 sessions/an, pas de deadline unique) : on n'émet pas de
  // péremption dure, mais on alerte si le bloc édition vieillit.
  warnIfEditionYearStale('oif-images-francophones', EDITION_2026.year)

  return VOLETS.map((v) => ({
    external_id: `oif-${v.slug}-${EDITION_2026.year}`,
    payload: {
      emitter: EMITTER,
      title: v.title,
      description: v.description,
      deadline: null, // 4 sessions glissantes, pas de deadline unique
      url: v.url,
      amount_text: v.slug === 'tv5mondeplus-francophonie' ? "jusqu'à 100 000 €" : null,
      region_hint: 'international',
      discipline_hints: ['audiovisuel'],
      raw_json: {
        source_slug: slug,
        volet_slug: v.slug,
        edition_year: EDITION_2026.year,
        apply_url: EDITION_2026.applyUrl,
        presentation_url: EDITION_2026.presentationUrl,
        modalites_url: EDITION_2026.modalitesUrl,
        next_edition_status: 'rolling-quarterly',
        hint_geo_scope: 'international',
        hint_pays_du_sud: true,
        hint_disciplines_tags: v.disciplinesTagsHint,
        // Le fonds requiert un producteur enregistré dans un pays du Sud,
        // donc pas hors-réseau friendly au sens FR — flagué pour info.
        hint_requires_producer: v.slug === 'tv5mondeplus-francophonie',
        hint_hors_reseau_friendly: v.slug !== 'tv5mondeplus-francophonie',
      },
    },
  }))
}
