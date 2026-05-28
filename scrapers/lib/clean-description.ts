/**
 * Helper d'extraction d'une description « propre » à partir du body
 * d'une page de festival/concours :
 *   - aggrège les <p> et <li> du main content
 *   - filtre le boilerplate CNIL/RGPD/contact/horaires de bureau
 *   - cape à ~1500 chars pour éviter de saturer la fiche pendant que
 *     le LLM enrich-from-page extraira les sections détaillées
 *
 * Patterns à filtrer (matchés en regex insensitive sur le texte du <p>) :
 *   - références CNIL / RGPD / données personnelles
 *   - règlement UE 2016/679, loi 78-17, loi 2018-493
 *   - DPO, droit d'accès, courrier postal protection des données
 *   - emails de contact (mailto: en majorité)
 *   - horaires de bureaux fermés / ouverts
 *   - mentions Référent à la Protection des Données
 */
import type { CheerioAPI } from 'cheerio'

const LEGAL_BOILERPLATE_RE =
  /\b(?:CNIL|RGPD|R[èe]glement\s+Europ[ée]en|donn[ée]es\s+(?:à\s+caract[èe]re\s+personnel|personnelles)|loi\s+n°\s*\d{4}-\d{2,3}|protection\s+des\s+donn[ée]es|D\.?P\.?O\b|R[ée]f[ée]rent\s+(?:à\s+la\s+)?Protection|titre\s+d['']identit[ée]\s+sign[ée]|RGPD|cnil\.fr)/i

const ADMIN_NOISE_RE =
  /\b(?:bureaux\s+(?:sont\s+)?(?:ferm[ée]s?|ouverts?)|congé[s]?\s+annuel|t[ée]l\.?\s*:?\s*\d|^\s*\d{2}[\s.]\d{2}[\s.]\d{2}[\s.]\d{2}|^\s*[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\s*$)/i

const MAX_CHARS = 1500
const MAX_PARAGRAPHS = 10

export function extractCleanDescription($: CheerioAPI): string | null {
  const candidates = $('main p, main li, article p, article li, .content p, .entry-content p, body p')
    .map((_i, el) => $(el).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter((t) => t.length > 20)

  // Dedup tout en gardant l'ordre
  const seen = new Set<string>()
  const filtered: string[] = []
  for (const p of candidates) {
    if (seen.has(p)) continue
    seen.add(p)
    if (LEGAL_BOILERPLATE_RE.test(p)) continue
    if (ADMIN_NOISE_RE.test(p)) continue
    filtered.push(p)
    if (filtered.length >= MAX_PARAGRAPHS) break
  }
  if (filtered.length === 0) return null
  const joined = filtered.join('\n')
  return joined.length > MAX_CHARS ? joined.slice(0, MAX_CHARS).trimEnd() + '…' : joined
}
