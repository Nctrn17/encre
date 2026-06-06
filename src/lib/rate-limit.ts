/**
 * Limiteur de débit en mémoire (fenêtre fixe), sans dépendance externe.
 *
 * Limites : l'état vit par instance serverless chaude — un attaquant réparti
 * sur plusieurs instances est moins contraint. C'est une défense-en-profondeur
 * suffisante pour la beta (anti-flood naïf, anti-énumération). Pour une montée
 * en charge publique, basculer sur un store partagé (Upstash Redis / Vercel KV).
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export interface RateLimitResult {
  ok: boolean
  /** Secondes avant réinitialisation de la fenêtre (0 si autorisé). */
  retryAfter: number
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()

  // Purge opportuniste des fenêtres expirées pour borner la mémoire.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) {
      if (now >= b.resetAt) buckets.delete(k)
    }
  }

  const bucket = buckets.get(key)
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfter: 0 }
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) }
  }
  bucket.count += 1
  return { ok: true, retryAfter: 0 }
}

/** Extrait l'IP cliente des en-têtes de proxy (Vercel pose x-forwarded-for). */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}
