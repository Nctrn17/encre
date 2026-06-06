/**
 * Scraper Moulin d'Andé — CÉCI (Centre des Écritures Cinématographiques).
 *
 * Site : https://moulinande.com/
 *
 * 4 sources distinctes (1 par URL candidature CÉCI) :
 *   - /ceci-residence-francophone   → Résidence Francophone (long métrage)
 *   - /ceci-residences-partenariat  → Résidence Croisée (Suzanne Lipinska)
 *   - /ceci-autres-programmes       → Création Normande (court métrage)
 *   - /ceci-concours-scenario       → Prix Suzanne Lipinska (concours scénario)
 *
 * URLs intentionnellement non scrapées :
 *   - /ceci-candidature   : page-index, pas une opportunité en soi
 *   - /ceci-hors-programme: candidature spontanée permanente, pas de deadline
 *   - /residences         : overview général
 *
 * Réf : docs/PILOTE-SCENARISTES.md section 3.2 + observations 5031-5036.
 */

import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'

export const slug = 'moulin-ande-ceci'

const BASE = 'https://moulinande.com'
const PROBE_URL = `${BASE}/ceci-candidature/`
const EMITTER = "Moulin d'Andé — CÉCI"

const RESIDENCES = [
  {
    slug: 'francophone-long-metrage',
    path: '/ceci-residence-francophone',
    title: 'Moulin d’Andé CÉCI — Résidence Francophone (long métrage)',
    description:
      '40 jours maximum en pension complète pour 8 cinéastes en écriture de long métrage (fiction ou documentaire) en langue française. Consultations professionnelles et accompagnement CÉCI. Cycle annuel récurrent : candidatures ouvertes mi-septembre à mi-octobre.',
    // Estimation depuis le calendrier récurrent ; sera reclassifiée par le LLM
    // dès que la date 2026 (ou 2027) sera publiée sur la page.
    deadline_iso: '2026-10-15T23:59:59+02:00',
    region_hint: 'NOR',
    hors_reseau_friendly: true,
  },
  {
    slug: 'residence-croisee-lipinska',
    path: '/ceci-residences-partenariat',
    title: 'Moulin d’Andé CÉCI — Résidence Croisée (collège Suzanne Lipinska)',
    description:
      'Résidence avril-mai pour 1 cinéaste en écriture de long métrage (fiction ou documentaire). Volet transmission avec collège partenaire. Modalités annoncées en mars de l’année courante.',
    deadline_iso: null, // à confirmer chaque année
    region_hint: 'NOR',
    hors_reseau_friendly: true,
  },
  {
    slug: 'creation-normande-court-metrage',
    path: '/ceci-autres-programmes',
    title: 'Moulin d’Andé CÉCI — Résidence Création Normande (court métrage)',
    description:
      'Résidence en 2 sessions automnales pour 8 cinéastes normands développant un court métrage. Ouvert à tous niveaux d’expérience. Accompagnement par 2 cinéastes pro + spécialistes. Cycle annuel : candidatures fin juin à mi-septembre, sessions octobre-novembre.',
    deadline_iso: '2026-09-13T23:59:59+02:00',
    region_hint: 'NOR',
    hors_reseau_friendly: true,
  },
  {
    slug: 'prix-suzanne-lipinska-concours-scenario',
    path: '/ceci-concours-scenario',
    title: 'Moulin d’Andé CÉCI — Prix Suzanne Lipinska (concours scénario court-métrage)',
    description:
      'Concours de scénarios de court-métrage de l’Eure (fictions de moins de 15 min se déroulant dans le Département de l’Eure). 12 projets pré-sélectionnés par des professionnels, 6 lauréats désignés par des élèves de Première. Candidatures via Framaforms. Note : appel actuellement suspendu en attente de directives du Département de l’Eure ; restera référencé sur Encre pour visibilité du programme dès sa réouverture.',
    deadline_iso: null,
    region_hint: 'NOR',
    hors_reseau_friendly: true,
  },
] as const

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  // Liveness probe sur la page-index pour détecter une coupure du site.
  // Si le hub répond, on émet les 4 entrées (chacune sera fingerprintée
  // indépendamment côté pipeline ; pas de fetch par URL ici puisque le
  // contenu est connu et stable).
  const resp = await fetchWithRetry(PROBE_URL)
  if (!resp.ok) {
    console.warn(`  [moulin-ande-ceci] probe HTTP ${resp.status} sur ${PROBE_URL}`)
    return []
  }

  return RESIDENCES.map((r) => ({
    external_id: `moulin-ande-ceci-${r.slug}`,
    payload: {
      title: r.title,
      description: r.description,
      emitter: EMITTER,
      url: `${BASE}${r.path}`,
      deadline: r.deadline_iso,
      amount_text: 'Pension complète + accompagnement',
      discipline_hints: ['cinema', 'audiovisuel'],
      region_hint: r.region_hint,
      raw_json: {
        source_slug: 'moulin-ande-ceci',
        residence_slug: r.slug,
        hint_hors_reseau_friendly: r.hors_reseau_friendly,
        hint_requires_producer: false,
      },
    },
  }))
}
