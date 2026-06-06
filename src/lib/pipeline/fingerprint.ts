import { createHash } from 'node:crypto'
import { slugify } from '@/lib/utils'

/**
 * Calcule le fingerprint d'une opportunité — utilisé pour la déduplication
 * rapide (niveau 2 après la clé naturelle `(source, external_id)`).
 *
 * Formule : sha256(lower(trim(title)) + emitter_slug + deadline_iso)
 *
 * Deux sources qui publient la même opportunité produisent ~80 % du temps
 * le même fingerprint. Les ~20 % restants sont attrapés par la similarité
 * cosine sur les embeddings (niveau 3, dans similarity.ts).
 */
export function computeFingerprint(params: {
  title: string
  emitter: string | null
  deadline: string | Date | null
}): string {
  const title = params.title.trim().toLowerCase().normalize('NFC')
  const emitter = params.emitter ? slugify(params.emitter) : 'unknown-emitter'
  const deadline = params.deadline
    ? typeof params.deadline === 'string'
      ? params.deadline
      : params.deadline.toISOString()
    : 'no-deadline'

  const raw = `${title}||${emitter}||${deadline}`

  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

/**
 * Génère un slug URL-safe pour une opportunité, combinant titre et émetteur.
 * Unique dans la base via la contrainte UNIQUE sur `opportunities.slug`.
 */
export function generateOpportunitySlug(params: {
  title: string
  emitter: string | null
  /**
   * Hash court (fingerprint ou assimilé) ajouté en suffixe pour garantir
   * l'unicité même sur titres longs qui se tronquent identiques après
   * slugify. Sans ce suffixe, des items CNL comme "Subvention pour les
   * projets de publication d'ouvrage en langue française liés à [X]" et
   * "... liés à [Y]" généraient la même slug après coupe à 80 chars.
   */
  fingerprint?: string
}): string {
  const titlePart = slugify(params.title, 80)
  const emitterSlug = params.emitter ? slugify(params.emitter, 30) : ''
  // Dedupe : si le slug-émetteur est déjà présent comme sous-chaîne du
  // slug-titre (cas fréquent : « Moulin d'Andé CÉCI — Résidence X » avec
  // émetteur « Moulin d'Andé — CÉCI »), on n'ajoute pas le suffixe émetteur
  // pour éviter `moulin-d-ande-ceci-residence-x-moulin-d-ande-ceci`.
  // On accepte aussi le cas inverse (émetteur contient titre) — rare mais
  // valide après normalisation.
  const emitterAlreadyInTitle =
    emitterSlug.length > 0 && (titlePart.includes(emitterSlug) || emitterSlug.includes(titlePart))
  const emitterPart = emitterSlug && !emitterAlreadyInTitle ? `-${emitterSlug}` : ''
  const hashSuffix = params.fingerprint ? `-${params.fingerprint.slice(0, 8)}` : ''
  // La colonne opportunities.slug tolère jusqu'à 220 chars ; on laisse de la marge.
  return `${titlePart}${emitterPart}${hashSuffix}`.slice(0, 200)
}
