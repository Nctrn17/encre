const DEFAULT_NEXT = '/aides'

/**
 * Contraint un paramètre `next` de redirection post-auth à un chemin interne.
 *
 * Empêche l'open redirect : une valeur absolue (`https://evil.com`),
 * protocol-relative (`//evil.com`) ou avec backslash (`/\evil.com`, interprété
 * comme protocol-relative par certains navigateurs) est rejetée au profit de
 * la destination par défaut.
 */
export function safeNext(value: string | null | undefined): string {
  if (!value) return DEFAULT_NEXT
  if (!value.startsWith('/')) return DEFAULT_NEXT
  // Rejette `//host` et `/\host` (protocol-relative déguisés).
  if (value.startsWith('//') || value.startsWith('/\\')) return DEFAULT_NEXT
  return value
}
