/**
 * Scraper Région Île-de-France — Aide à l'écriture de scénario.
 *
 * Source : https://www.iledefrance.fr/aides-et-appels-a-projets/aide-lecriture-de-scenario-cinema-et-audiovisuel
 *
 * CMS : site régional iledefrance.fr (structure peu prédictible), mais
 * l'aide est un dispositif annuel **stable** avec 1 session unique/an.
 * On fait donc un scraper "health-check + static emit" (pattern Sopadin).
 *
 * Spécifique session 2026 :
 *   - Session unique : **mercredi 10 juin 2026, 9h-17h** (dépôt en ligne)
 *   - Deux catégories : auteurs débutants / auteurs confirmés
 *   - Bourse + accompagnement individualisé scénariste consultant pour débutants
 *   - Préparation pitch avec producteurs
 *
 * Critique pour la cible pilote : 1 seule date/an → si un jeune scénariste
 * la rate, il perd une année. Le produit DOIT la remonter avec priorité.
 *
 * Réf doc : docs/PILOTE-SCENARISTES.md section 3.3
 */

import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'region-idf-scenario'

const PAGE_URL =
  'https://www.iledefrance.fr/aides-et-appels-a-projets/aide-lecriture-de-scenario-cinema-et-audiovisuel'
const APPLY_URL = 'https://mesdemarches.iledefrance.fr'
const EMITTER = 'Région Île-de-France'

/**
 * Paramètres de la session en cours. À actualiser chaque année.
 */
const SESSION_2026 = {
  deadlineIso: '2026-06-10T17:00:00+02:00', // mercredi 10 juin 2026, 17h00
  year: 2026,
}

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  // Health-check
  const resp = await fetchWithRetry(PAGE_URL)
  if (!resp.ok) {
    console.warn(`  [region-idf-scenario] page HTTP ${resp.status} — dispositif peut-être modifié`)
    return []
  }
  const html = (await resp.text()).toLowerCase()

  // Garde-fou : la page doit encore parler d'écriture scénario. Si renommée,
  // on n'émet pas (évite désinfo).
  if (!html.includes('scénario') && !html.includes('scenario')) {
    console.warn(`  [region-idf-scenario] page ne mentionne plus "scénario" — suspect`)
    return []
  }

  return [
    // Item 1 : auteurs débutants (cible prioritaire pilote hors-réseau)
    {
      external_id: `region-idf-scenario-debutants-${SESSION_2026.year}`,
      payload: {
        title: `Île-de-France — Aide à l'écriture de scénario (auteurs débutants) ${SESSION_2026.year}`,
        description:
          `Bourse régionale pour l'écriture de scénario fiction, animation ou documentaire ` +
          `(cinéma et audiovisuel) au stade de commencement d'écriture. ` +
          `Les **auteurs débutants** bénéficient d'un accompagnement individualisé par un ` +
          `scénariste consultant + préparation aux séances de pitch avec producteurs/réalisateurs. ` +
          `**Session unique : mercredi 10 juin 2026, de 9h à 17h**. ` +
          `Dépôt uniquement en ligne via ${APPLY_URL}, sélection dans l'ordre d'inscription.`,
        emitter: EMITTER,
        url: PAGE_URL,
        deadline: SESSION_2026.deadlineIso,
        amount_text: null, // non public sur la page d'aperçu
        discipline_hints: ['cinema', 'audiovisuel'],
        region_hint: 'IDF',
        raw_json: {
          source_slug: 'region-idf-scenario',
          category: 'debutants',
          session_year: SESSION_2026.year,
          apply_url: APPLY_URL,
          contact: 'julitte.michel@iledefrance.fr',
          hint_hors_reseau_friendly: true,
          hint_min_films_produits: 0,
          hint_requires_producer: false,
        },
      },
    },
    // Item 2 : auteurs confirmés
    {
      external_id: `region-idf-scenario-confirmes-${SESSION_2026.year}`,
      payload: {
        title: `Île-de-France — Aide à l'écriture de scénario (auteurs confirmés) ${SESSION_2026.year}`,
        description:
          `Bourse régionale pour l'écriture de scénario fiction, animation ou documentaire ` +
          `(cinéma et audiovisuel), catégorie **auteurs confirmés**. ` +
          `**Session unique : mercredi 10 juin 2026, de 9h à 17h**. ` +
          `Dépôt uniquement en ligne via ${APPLY_URL}, sélection dans l'ordre d'inscription.`,
        emitter: EMITTER,
        url: PAGE_URL,
        deadline: SESSION_2026.deadlineIso,
        amount_text: null,
        discipline_hints: ['cinema', 'audiovisuel'],
        region_hint: 'IDF',
        raw_json: {
          source_slug: 'region-idf-scenario',
          category: 'confirmes',
          session_year: SESSION_2026.year,
          apply_url: APPLY_URL,
          contact: 'julitte.michel@iledefrance.fr',
          hint_hors_reseau_friendly: true,
          hint_min_films_produits: 1,
          hint_requires_producer: false,
        },
      },
    },
  ]
}
