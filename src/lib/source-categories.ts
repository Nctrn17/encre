/**
 * Mapping slug source → catégorie éditoriale.
 *
 * Le champ `sources.kind` est la méthode de scraping (api/rss/html/email/manual).
 * Pour la page /sources qui catégorise par type d'organisme, on utilise ce
 * mapping. Toute source non mappée tombe dans `autres`.
 */

export type SourceCategory = 'public' | 'societes-auteurs' | 'fondations' | 'agences-regionales' | 'residences' | 'autres'

export const SOURCE_CATEGORY_LABELS: Record<SourceCategory, string> = {
  public: 'État & service public',
  'societes-auteurs': "Sociétés d'auteurs",
  fondations: 'Fondations & associations',
  'agences-regionales': 'Agences régionales',
  residences: "Résidences & maisons d'écriture",
  autres: 'Autres',
}

/**
 * Ordre d'affichage des catégories sur la page /sources.
 */
export const SOURCE_CATEGORY_ORDER: SourceCategory[] = [
  'public',
  'societes-auteurs',
  'fondations',
  'agences-regionales',
  'residences',
  'autres',
]

/**
 * Règles de catégorisation par slug source.
 * - Les `startsWith` sont évalués avant les exacts.
 * - L'ordre des règles compte : la première qui matche gagne.
 */
const RULES: Array<{ test: (slug: string) => boolean; cat: SourceCategory }> = [
  // État & service public
  { test: (s) => s === 'cnc' || s.startsWith('cnc-'), cat: 'public' },
  { test: (s) => s === 'cnl' || s.startsWith('cnl-'), cat: 'public' },
  { test: (s) => s === 'cnm' || s.startsWith('cnm-'), cat: 'public' },
  { test: (s) => s === 'cnap' || s.startsWith('cnap-'), cat: 'public' },
  { test: (s) => s.startsWith('drac-'), cat: 'public' },
  { test: (s) => s === 'culture-gouv' || s.startsWith('culture-gouv-'), cat: 'public' },
  { test: (s) => s === 'data-culture-gouv', cat: 'public' },
  { test: (s) => s === 'data-gouv-culture', cat: 'public' },
  { test: (s) => s === 'artcena-appels' || s === 'artcena', cat: 'public' },
  { test: (s) => s === 'region-idf' || s.startsWith('region-'), cat: 'public' },
  { test: (s) => s === 'manual-admin', cat: 'public' },

  // Sociétés d'auteurs
  { test: (s) => s === 'scam' || s.startsWith('scam-'), cat: 'societes-auteurs' },
  { test: (s) => s === 'sacd' || s.startsWith('sacd-') || s === 'beaumarchais' || s.startsWith('beaumarchais-'), cat: 'societes-auteurs' },
  { test: (s) => s === 'sopadin' || s.startsWith('sopadin-'), cat: 'societes-auteurs' },
  { test: (s) => s === 'sacem' || s.startsWith('sacem-'), cat: 'societes-auteurs' },
  { test: (s) => s === 'adagp' || s.startsWith('adagp-'), cat: 'societes-auteurs' },

  // Fondations & associations
  { test: (s) => s.startsWith('fondation-'), cat: 'fondations' },
  { test: (s) => s === 'grec' || s.startsWith('grec-'), cat: 'fondations' },
  { test: (s) => s === 'emergence' || s.startsWith('emergence-'), cat: 'fondations' },
  { test: (s) => s === 'institut-francais', cat: 'fondations' },

  // Agences régionales
  { test: (s) => s.startsWith('alca-'), cat: 'agences-regionales' },
  { test: (s) => s.startsWith('aura-') || s === 'aura-cinema', cat: 'agences-regionales' },
  { test: (s) => s === 'pictanovo' || s.startsWith('pictanovo-'), cat: 'agences-regionales' },

  // Résidences & maisons d'écriture
  { test: (s) => s === 'arts-en-residence', cat: 'residences' },
  { test: (s) => s === 'groupe-ouest' || s.startsWith('groupe-ouest-'), cat: 'residences' },
  { test: (s) => s === 'moulin-ande' || s.startsWith('moulin-'), cat: 'residences' },
  { test: (s) => s.startsWith('villa-') || s === 'kujoyama' || s === 'medicis', cat: 'residences' },
  { test: (s) => s.startsWith('cite-') || s === 'maison-poesie', cat: 'residences' },
]

export function categorizeSource(slug: string): SourceCategory {
  for (const rule of RULES) {
    if (rule.test(slug)) return rule.cat
  }
  return 'autres'
}

/**
 * Description par défaut d'une source quand `sources.config.description`
 * n'est pas défini. Utilisé comme fallback éditorial.
 */
export function defaultSourceDescription(name: string, kind: string): string {
  const kindLabel: Record<string, string> = {
    api: 'flux API',
    rss: 'flux RSS',
    html: 'page HTML',
    email: 'newsletter',
    manual: 'saisie manuelle',
  }
  return `${name} (collecte via ${kindLabel[kind] ?? kind}).`
}

/**
 * Hostname canonique d'une source si présent dans son `config.url` ou
 * `config.base_url`. Utilisé pour afficher un lien lisible (ex: "cnl.fr").
 */
export function sourceHostname(config: Record<string, unknown> | null | undefined): string | null {
  if (!config) return null
  const url = (config.url as string | undefined) ?? (config.base_url as string | undefined)
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
