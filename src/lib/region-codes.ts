/**
 * Codes INSEE des régions françaises (métropole + outre-mer).
 * Utilisés dans `opportunities.region_code` et `alert_profiles.region_codes`.
 * Format FR-XX suit le standard ISO 3166-2:FR.
 */

export const FR_REGION_CODES = {
  'FR-ARA': 'Auvergne-Rhône-Alpes',
  'FR-BFC': 'Bourgogne-Franche-Comté',
  'FR-BRE': 'Bretagne',
  'FR-CVL': 'Centre-Val de Loire',
  'FR-COR': 'Corse',
  'FR-GES': 'Grand Est',
  'FR-HDF': 'Hauts-de-France',
  'FR-IDF': 'Île-de-France',
  'FR-NOR': 'Normandie',
  'FR-NAQ': 'Nouvelle-Aquitaine',
  'FR-OCC': 'Occitanie',
  'FR-PDL': 'Pays de la Loire',
  'FR-PAC': "Provence-Alpes-Côte d'Azur",
  'FR-GUA': 'Guadeloupe',
  'FR-MAY': 'Mayotte',
  'FR-MAR': 'Martinique',
  'FR-GUF': 'Guyane',
  'FR-LRE': 'La Réunion',
} as const

export type FrRegionCode = keyof typeof FR_REGION_CODES

export const FR_REGION_SLUGS: Record<FrRegionCode, string> = {
  'FR-ARA': 'auvergne-rhone-alpes',
  'FR-BFC': 'bourgogne-franche-comte',
  'FR-BRE': 'bretagne',
  'FR-CVL': 'centre-val-de-loire',
  'FR-COR': 'corse',
  'FR-GES': 'grand-est',
  'FR-HDF': 'hauts-de-france',
  'FR-IDF': 'ile-de-france',
  'FR-NOR': 'normandie',
  'FR-NAQ': 'nouvelle-aquitaine',
  'FR-OCC': 'occitanie',
  'FR-PDL': 'pays-de-la-loire',
  'FR-PAC': 'provence-alpes-cote-d-azur',
  'FR-GUA': 'guadeloupe',
  'FR-MAY': 'mayotte',
  'FR-MAR': 'martinique',
  'FR-GUF': 'guyane',
  'FR-LRE': 'la-reunion',
}

export function labelForRegion(code: string | null | undefined): string {
  if (!code) return 'France'
  if (code in FR_REGION_CODES) {
    return FR_REGION_CODES[code as FrRegionCode]
  }
  return code
}

export function regionCodeFromSlug(slug: string): FrRegionCode | null {
  const entries = Object.entries(FR_REGION_SLUGS) as [FrRegionCode, string][]
  const match = entries.find(([, s]) => s === slug)
  return match ? match[0] : null
}
