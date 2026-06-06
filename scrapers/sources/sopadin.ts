/**
 * Scraper Prix Sopadin du Scénariste.
 *
 * Source : https://prix-scenariste.org/
 * CMS : SPA avec URLs dynamiques + règlement en PDF binaire → HTML non scrapable
 * de façon fiable. Pour ce dispositif stable (39 éditions depuis 1986), on
 * fait un scraper "health-check + static emit" :
 *
 *   1. On fetch la racine — si elle 200, le dispositif est toujours actif.
 *   2. On émet 2 items statiques vérifiés (Grand Prix + Prix Junior) avec les
 *      données connues pour l'édition courante.
 *   3. Les dates de l'édition 2026 sont hardcodées dans `EDITION_2026` ;
 *      mettre à jour ce bloc une fois par an quand la nouvelle édition ouvre.
 *
 * Particularité pilote scénariste :
 *   - Prix Junior = **< 28 ans** → pile la cible jeune scénariste
 *   - Candidature libre auteur seul (hors-réseau OK)
 *
 * Réf doc : docs/PILOTE-SCENARISTES.md section 3.4
 */

import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'
import { isStaticEditionStale } from '../lib/edition-guard'

export const slug = 'sopadin'

const BASE_URL = 'https://prix-scenariste.org'
const EMITTER = 'Sopadin'

/**
 * Calendrier de l'édition en cours.
 * À actualiser chaque année depuis le site officiel ou le règlement PDF.
 * Sources : règlement sopadin 2026 + WebSearch 2026-04-19.
 */
const EDITION_2026 = {
  year: 2026,
  numero: '39e',
  openDate: '2026-09-15', // Inscription ouverte
  deadlineIso: '2026-10-04T23:59:59+02:00', // Cachet de la poste + dépôt en ligne
  applyUrl: 'https://projet-prix-scenariste.festicine.fr',
  rulebookPdf: 'https://prix-scenariste.org/sopadin/up/reglements/sopadin2026.pdf',
}

export async function run(_config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  // Health-check : on vérifie que le site est vivant avant d'émettre les items.
  // Si le site disparaît (404, etc.), on ne retourne rien — évite de
  // propager des données obsolètes.
  const resp = await fetchWithRetry(BASE_URL)
  if (!resp.ok) {
    console.warn(`  [sopadin] site racine HTTP ${resp.status} — dispositif peut-être inactif`)
    return []
  }
  const html = await resp.text()

  // Garde-fou : si la page ne mentionne plus "Sopadin" ou "scénario", on
  // considère le dispositif disparu/renommé et on n'émet rien.
  const htmlLower = html.toLowerCase()
  if (!htmlLower.includes('scénari') && !htmlLower.includes('scenari')) {
    console.warn(`  [sopadin] site ne mentionne plus "scénariste" — dispositif suspect`)
    return []
  }

  const commonPayload = {
    emitter: EMITTER,
    deadline: EDITION_2026.deadlineIso,
    region_hint: null,
    discipline_hints: ['cinema', 'audiovisuel'],
  }

  // Garde-fou de péremption : si l'édition codée en dur est close, on cesse
  // d'émettre et on alerte (EDITION_2026 à rafraîchir).
  if (isStaticEditionStale('sopadin', EDITION_2026.deadlineIso)) return []

  return [
    {
      external_id: `sopadin-grand-prix-${EDITION_2026.year}`,
      payload: {
        ...commonPayload,
        title: `Grand Prix du Scénariste Sopadin — ${EDITION_2026.numero} édition`,
        description:
          `Prix national du scénario de long métrage cinéma au stade de l'écriture. ` +
          `Candidature libre par l'auteur·rice (pas de limite d'âge). ` +
          `Appel à projets ouvert du 15 septembre au 4 octobre 2026 ` +
          `(cachet de la poste faisant foi). Dossier via ${EDITION_2026.applyUrl}.`,
        url: `${BASE_URL}/fr/accueil/appel-a-projets-2/2/-2/21`,
        amount_text: null, // Montant non publié sur site — à enrichir si retrouvé
        raw_json: {
          source_slug: 'sopadin',
          prize_slug: 'grand-prix',
          edition_year: EDITION_2026.year,
          edition_number: EDITION_2026.numero,
          apply_url: EDITION_2026.applyUrl,
          rulebook_pdf: EDITION_2026.rulebookPdf,
          hint_hors_reseau_friendly: true,
          hint_requires_producer: false,
        },
      },
    },
    {
      external_id: `sopadin-prix-junior-${EDITION_2026.year}`,
      payload: {
        ...commonPayload,
        title: `Prix Junior du Scénariste Sopadin — ${EDITION_2026.numero} édition`,
        description:
          `Prix national du scénario de long métrage cinéma pour auteur·rices de moins de 28 ans. ` +
          `15e édition du Prix Junior. Candidature libre. ` +
          `Appel à projets ouvert du 15 septembre au 4 octobre 2026. ` +
          `Dossier via ${EDITION_2026.applyUrl}.`,
        url: `${BASE_URL}/fr/accueil/appel-a-projets-2/2/-2/21`,
        amount_text: null,
        raw_json: {
          source_slug: 'sopadin',
          prize_slug: 'prix-junior',
          edition_year: EDITION_2026.year,
          edition_number: EDITION_2026.numero,
          apply_url: EDITION_2026.applyUrl,
          rulebook_pdf: EDITION_2026.rulebookPdf,
          hint_hors_reseau_friendly: true,
          hint_requires_producer: false,
          hint_age_max: 28,
        },
      },
    },
  ]
}
