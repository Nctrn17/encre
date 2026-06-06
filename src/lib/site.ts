/**
 * Encre · helpers d'URL absolue.
 *
 * Le domaine final n'est pas encore fixé. Toutes les URLs absolues du site
 * (metadataBase, OpenGraph, sitemap, robots, JSON-LD) passent par ces
 * helpers, qui lisent `NEXT_PUBLIC_SITE_URL` (à définir en prod sur Vercel).
 * Fallback dev : `http://localhost:4000`.
 *
 * Quand le domaine sera tranché, il suffit de poser `NEXT_PUBLIC_SITE_URL`
 * dans les env de prod. Aucun changement de code requis.
 */

const DEV_FALLBACK = 'http://localhost:4000'

export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? DEV_FALLBACK
  return raw.replace(/\/+$/, '')
}

export function absoluteUrl(path: string): string {
  const base = getSiteUrl()
  if (!path) return base
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

export const SITE_NAME = 'Encre'

export const SITE_DESCRIPTION =
  "Résidences, bourses, prix et aides à l'écriture pour scénaristes, autrices et auteurs de cinéma et d'audiovisuel. Toutes régions."
