/**
 * Scraper Fondation Jean-Luc Lagardère — bourses individuelles auteurs.
 *
 * Source : https://www.lagardere.com/fondation/bourses/
 * Six bourses annuelles attribuées en novembre, calendrier stable depuis
 * 1990. La plus pertinente pour Encre pilote : **Bourse Scénariste TV**
 * (15 000 €), livrables = bible série + pilote ou 3 premiers épisodes.
 *
 * Particularité workflow scénariste TV : c'est l'aide « bible + pitch »
 * la plus emblématique en France pour les jeunes auteurs (< 35 ans),
 * candidature libre sans producteur attaché.
 *
 * Stratégie : pattern « health-check + static emit » (cf sopadin.ts).
 * Le site WordPress de la fondation est stable mais le règlement complet
 * est en PDF, donc on hardcode les données vérifiées et on émet uniquement
 * si la racine répond.
 *
 * Bourses émises :
 *   1. Scénariste TV         (< 35 ans, 15 000 €) — pilote
 *   2. Auteur de Film        (< 30 ans, 15 000 €) — long métrage
 *   3. Écrivain              (< 30 ans, 25 000 €) — premier roman
 *   4. Photographe           (< 30 ans, 15 000 €) — projet photo
 *   5. Journaliste reporter  (< 30 ans, 10 000 €) — reportage
 *   6. Créateur Numérique    (< 30 ans, 25 000 €) — projet digital
 *
 * Réf doc : docs/PILOTE-SCENARISTES.md (à mettre à jour avec section
 * Lagardère après ce commit).
 */

import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'
import { isStaticEditionStale } from '../lib/edition-guard'

export const slug = 'fondation-lagardere'

const BASE_URL = 'https://www.lagardere.com'
const BOURSES_INDEX = `${BASE_URL}/fondation/bourses/`
const EMITTER = 'Fondation Jean-Luc Lagardère'

/**
 * Calendrier 2026 vérifié 2026-05-13 sur le site lagardere.com.
 * Toutes les bourses partagent la même deadline et le même jury annuel,
 * proclamation en novembre.
 * À actualiser une fois par an quand le règlement de l'édition suivante
 * est publié (généralement mars-avril).
 */
const EDITION_2026 = {
  year: 2026,
  deadlineIso: '2026-06-14T23:59:59+02:00', // 14 juin 2026
  applyUrl: `${BASE_URL}/fondation/page/depot-des-candidatures-en-ligne/`,
  resultsExpected: '2026-11', // Proclamation novembre
}

interface BourseSpec {
  slug: string
  title: string
  url: string
  rulebookPdf: string
  amountEur: number
  ageMax: number
  disciplineHints: string[]
  disciplinesTagsHint: string[]
  description: string
}

const BOURSES_2026: BourseSpec[] = [
  {
    slug: 'scenariste-tv',
    title: 'Bourse Scénariste TV — Fondation Jean-Luc Lagardère',
    url: `${BASE_URL}/fondation/bourses/scenariste-tv/`,
    rulebookPdf: `${BASE_URL}/wp-content/uploads/2026/03/26_scenariste-tv_complet.pdf`,
    amountEur: 15000,
    ageMax: 35,
    disciplineHints: ['audiovisuel'],
    disciplinesTagsHint: ['scenario', 'serie', 'bible', 'pilote-tv'],
    description:
      "Bourse destinée à un·e jeune scénariste (ou une équipe co-scénariste / scénariste-dialoguiste) " +
      "de moins de 35 ans portant un projet de série de fiction en langue française pour la télévision " +
      "ou les plateformes de streaming. Livrables attendus : bible de la série et scénario du pilote, " +
      "ou des trois premiers épisodes pour les formats courts. Tous genres (feuilletonnante, bouclée, " +
      "mini-série, sitcom, short). Montant 15 000 €. Édition 2026 : candidatures jusqu'au 14 juin 2026, " +
      "proclamation en novembre 2026. Candidature libre, pas de producteur requis.",
  },
  {
    slug: 'auteur-de-film',
    title: 'Bourse Auteur de Film — Fondation Jean-Luc Lagardère',
    url: `${BASE_URL}/fondation/bourses/auteur-de-film/`,
    rulebookPdf: `${BASE_URL}/wp-content/uploads/2026/03/26_auteur-de-film_complet.pdf`,
    amountEur: 15000,
    ageMax: 30,
    disciplineHints: ['cinema', 'audiovisuel'],
    disciplinesTagsHint: ['scenario', 'long-metrage'],
    description:
      "Bourse destinée à un·e jeune auteur·ice de moins de 30 ans portant un projet de premier ou " +
      "deuxième long métrage de fiction en langue française. Soutien à l'écriture du scénario. " +
      "Montant 15 000 €. Édition 2026 : candidatures jusqu'au 14 juin 2026. Candidature libre, " +
      "sans producteur attaché requis.",
  },
  {
    slug: 'ecrivain',
    title: 'Bourse Écrivain — Fondation Jean-Luc Lagardère',
    url: `${BASE_URL}/fondation/bourses/ecrivain/`,
    rulebookPdf: `${BASE_URL}/wp-content/uploads/2026/03/26_ecrivain_complet.pdf`,
    amountEur: 25000,
    ageMax: 30,
    disciplineHints: ['litterature'],
    disciplinesTagsHint: ['litterature', 'roman'],
    description:
      "Bourse destinée à un·e jeune écrivain·e francophone de moins de 30 ans pour l'écriture " +
      "d'un premier ouvrage de fiction (roman, nouvelle, récit). Montant 25 000 €. Édition 2026 : " +
      "candidatures jusqu'au 14 juin 2026, proclamation en novembre.",
  },
  {
    slug: 'photographe',
    title: 'Bourse Photographe — Fondation Jean-Luc Lagardère',
    url: `${BASE_URL}/fondation/bourses/photographe/`,
    rulebookPdf: `${BASE_URL}/wp-content/uploads/2026/03/26_photographe_complet.pdf`,
    amountEur: 15000,
    ageMax: 30,
    disciplineHints: ['arts-visuels', 'photographie'],
    disciplinesTagsHint: ['photographie'],
    description:
      "Bourse destinée à un·e jeune photographe de moins de 30 ans pour la réalisation d'un projet " +
      "photographique de création (reportage, série, documentaire visuel). Montant 15 000 €. " +
      "Édition 2026 : candidatures jusqu'au 14 juin 2026.",
  },
  {
    slug: 'journaliste-de-reportage',
    title: 'Bourse Journaliste de Reportage — Fondation Jean-Luc Lagardère',
    url: `${BASE_URL}/fondation/bourses/journaliste-de-reportage/`,
    rulebookPdf: `${BASE_URL}/wp-content/uploads/2026/03/26_journaliste_complet.pdf`,
    amountEur: 10000,
    ageMax: 30,
    disciplineHints: ['litterature'], // journalisme assimilé écriture pour notre taxo
    disciplinesTagsHint: ['journalisme'],
    description:
      "Bourse destinée à un·e jeune journaliste de moins de 30 ans pour la réalisation d'un projet " +
      "de reportage de presse écrite ou photographique. Montant 10 000 €. Édition 2026 : candidatures " +
      "jusqu'au 14 juin 2026.",
  },
  {
    slug: 'createur-numerique',
    title: 'Bourse Créateur Numérique — Fondation Jean-Luc Lagardère',
    url: `${BASE_URL}/fondation/bourses/createur-numerique/`,
    rulebookPdf: `${BASE_URL}/wp-content/uploads/2026/03/26_createur-numerique_complet.pdf`,
    amountEur: 25000,
    ageMax: 30,
    disciplineHints: ['numerique'],
    disciplinesTagsHint: ['web', 'numerique'],
    description:
      "Bourse destinée à un·e jeune créateur·ice numérique de moins de 30 ans portant un projet " +
      "innovant de création digitale (web, application, narrative interactive, transmédia). " +
      "Montant 25 000 €. Édition 2026 : candidatures jusqu'au 14 juin 2026.",
  },
]

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  // Health-check : on vérifie que la page index des bourses est vivante.
  // Si elle disparaît, on n'émet rien pour éviter de propager des données
  // obsolètes (règle produit : pas d'opp avec donnée partielle).
  const resp = await fetchWithRetry(BOURSES_INDEX)
  if (!resp.ok) {
    console.warn(
      `  [fondation-lagardere] page index HTTP ${resp.status} — fondation peut-être restructurée`,
    )
    return []
  }
  const html = await resp.text()

  // Garde-fou : on s'assure que la page mentionne toujours "bourse"
  // pour détecter une restructuration majeure du site.
  if (!html.toLowerCase().includes('bourse')) {
    console.warn(
      "  [fondation-lagardere] page index ne mentionne plus 'bourse' — dispositif suspect",
    )
    return []
  }

  // Garde-fou de péremption : si l'édition codée en dur est close, on cesse
  // d'émettre et on alerte (EDITION_2026 à rafraîchir).
  if (isStaticEditionStale('fondation-lagardere', EDITION_2026.deadlineIso)) return []

  return BOURSES_2026.map((b) => ({
    external_id: `lagardere-${b.slug}-${EDITION_2026.year}`,
    payload: {
      emitter: EMITTER,
      title: `${b.title} — édition ${EDITION_2026.year}`,
      description: b.description,
      deadline: EDITION_2026.deadlineIso,
      url: b.url,
      amount_text: `${b.amountEur.toLocaleString('fr-FR')} €`,
      region_hint: null,
      discipline_hints: b.disciplineHints,
      raw_json: {
        source_slug: slug,
        bourse_slug: b.slug,
        edition_year: EDITION_2026.year,
        apply_url: EDITION_2026.applyUrl,
        rulebook_pdf: b.rulebookPdf,
        results_expected: EDITION_2026.resultsExpected,
        hint_age_max: b.ageMax,
        hint_amount_min: b.amountEur,
        hint_amount_max: b.amountEur,
        hint_hors_reseau_friendly: true,
        hint_requires_producer: false,
        hint_requires_editor: false,
        hint_disciplines_tags: b.disciplinesTagsHint,
      },
    },
  }))
}
