/**
 * Filtre des items administratifs qui ne sont PAS des appels/aides/résidences
 * mais qui polluent les listings (culture.gouv.fr notamment).
 *
 * Exemples typiques à exclure :
 *   - "Commission d'agrément : décision de nomination du 6 janvier 2026"
 *   - "Procès-verbal de la commission..."
 *   - "Arrêté du 15 mars portant..."
 *   - "Composition de la commission..."
 *   - "Rapport annuel d'activité..."
 *   - "Décret n° 2026-..."
 *
 * Règle : si le titre OU la description contient un de ces patterns,
 * l'item est exclu au niveau scraper (pas stocké en raw_items).
 *
 * Ces patterns sont safe (très peu de risque de faux positifs sur des
 * vrais appels à projets).
 */

const ADMIN_PATTERNS: RegExp[] = [
  // Actes administratifs
  /\bprocès[-\s]?verbal\b/i,
  /\bproces[-\s]?verbal\b/i,
  /\bcompte[-\s]?rendu\b/i,
  /\bd[éeÉE]cision de nomination\b/i,
  /\bnomination\b/i,
  /\barrêt[éeÉE] du\b/i,
  /\barrete du\b/i,
  /\bd[éeÉE]cret\b/i,
  /\bcirculaire\b/i,
  /\bcomposition de la commission\b/i,
  /\bcommission d['’]agr[éeÉE]ment\b/i,
  /\brèglement intérieur\b/i,
  /\breglement interieur\b/i,

  // Rapports / bilans
  /\brapport annuel\b/i,
  /\brapport d['’]activit[éeÉE]\b/i,
  /\bbilan d['’]activit[éeÉE]\b/i,
  /\bbilan annuel\b/i,

  // Résultats d'appels passés (pas des nouveaux appels)
  /\br[éeÉE]sultats? de[s]? (?:commission|appel)/i,
  /\bresultats? de[s]? (?:commission|appel)/i,
  /\bliste des laur[éeÉE]ats?\b/i,
  /\bliste des laureat/i,
  /\bpalmar[èeÉE]s\b/i,

  // Dates de sessions (annonces de dates, pas d'appels en eux-mêmes)
  /^session du \d/i,
  /^r[ée]union du \d/i,

  // Calendriers / plannings (pas un appel en soi)
  /^calendrier g[ée]n[ée]ral\b/i,
  /^planning (?:des commissions|annuel)\b/i,
]

/**
 * Retourne true si le titre (ou titre+description) match un pattern admin.
 */
export function isAdministrativeNoise(title: string, description?: string | null): boolean {
  const haystack = [title, description ?? ''].join(' ')
  return ADMIN_PATTERNS.some((re) => re.test(haystack))
}

/**
 * Filtre URL-based : élimine en AMONT (avant fetch HTTP) les URLs qui ne
 * peuvent pas être des AAP candidatables.
 *
 * Avantage : économise un round-trip HTTP par URL filtrée. Complément du
 * filtre title+description qui agit après extraction (et qu'on garde pour
 * les sites qui n'ont pas un path révélateur).
 *
 * Patterns identifiés sur les sites institutionnels FR :
 *   - CNC : /decisions-de-nomination/, /composition-de-la-commission/
 *           (PV de commissions, pas des appels à projets)
 *   - culture.gouv.fr : /decret-, /arrete-, /circulaire- (textes réglementaires)
 *   - en général : /laureats/, /resultats/, /palmares/, /rapport-annuel/,
 *                  /bilan-annuel/
 */
const ADMIN_URL_PATTERNS: RegExp[] = [
  /\/decisions?-de-nomination\//i,
  /\/decisions?-de-la-commission\//i,
  /\/composition-de-la-commission\//i,
  /\/proces[-_]?verbal\//i,
  /\/arrete-/i,
  /\/decret-/i,
  /\/circulaire-/i,
  /\/laureats?\//i,
  /\/resultats?\//i,
  /\/palmares\//i,
  /\/rapport[-_]?annuel\//i,
  /\/bilan[-_]?annuel\//i,
]

export function isAdministrativeUrl(url: string): boolean {
  return ADMIN_URL_PATTERNS.some((re) => re.test(url))
}
