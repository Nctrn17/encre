/**
 * Fetch + parse texte d'un PDF règlement linké depuis une page HTML.
 *
 * Usage prévu : enrichir le texte donné au LLM quand la page HTML d'une
 * opp ne contient que des métadonnées et que les conditions / dossier /
 * calendrier détaillés sont dans un PDF règlement téléchargeable.
 *
 * Cas typique : Beaumarchais, PictanovO, certaines opps Ministère
 * Culture (résidences PDF règlement détaillé).
 *
 * Stratégie :
 *   - fetch via fetchWithRetry (User-Agent honnête, throttle, robots)
 *   - skip si Content-Type ≠ application/pdf (lien faux PDF)
 *   - skip si Content-Length > MAX_PDF_BYTES (10 MB) — probable PDF
 *     scanné lourd, peu utile pour le texte
 *   - parse via `pdf-parse` (sync, robuste, gère la majorité des PDFs FR)
 *   - normalise les blancs, tronque à `maxChars`
 *   - retourne `null` si parsing échoue ou texte trop court (< 200 chars)
 *
 * Note pdf-parse : ne sait PAS gérer les PDFs scannés (images sans OCR).
 * Pour ces cas, on retourne null et on fail-open (le LLM continuera avec
 * juste le texte HTML).
 */

import { fetchWithRetry } from './fetch-helpers'

const MAX_PDF_BYTES = 10 * 1024 * 1024 // 10 MB
const DEFAULT_MAX_CHARS = 8000
const MIN_USEFUL_CHARS = 200

export interface ExtractedPdf {
  /** Texte plein du PDF, normalisé. */
  text: string
  /** Nombre de chars du texte après normalisation et truncate. */
  textSize: number
  /** Nombre de pages indiqué par pdf-parse. */
  pages: number
  /** Taille du PDF binary en bytes. */
  pdfBytes: number
  /** True si le texte a été tronqué. */
  truncated: boolean
}

export interface ExtractPdfOptions {
  maxChars?: number
}

export async function extractPdfText(
  url: string,
  options: ExtractPdfOptions = {},
): Promise<ExtractedPdf | null> {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS

  let resp: Response
  try {
    resp = await fetchWithRetry(url)
  } catch (err) {
    console.warn(`  [extract-pdf] fetch fail ${url} : ${(err as Error).message.slice(0, 120)}`)
    return null
  }
  if (!resp.ok) {
    console.warn(`  [extract-pdf] HTTP ${resp.status} sur ${url}`)
    return null
  }
  const ct = resp.headers.get('content-type') ?? ''
  if (!/application\/pdf/i.test(ct)) {
    console.warn(`  [extract-pdf] content-type non-PDF (${ct}) sur ${url}`)
    return null
  }

  const buffer = await resp.arrayBuffer()
  const pdfBytes = buffer.byteLength
  if (pdfBytes > MAX_PDF_BYTES) {
    console.warn(`  [extract-pdf] PDF trop lourd (${(pdfBytes / 1024 / 1024).toFixed(1)} MB) sur ${url}`)
    return null
  }

  // Import dynamique pour éviter le coût au cold start
  let PDFParse: typeof import('pdf-parse').PDFParse
  try {
    PDFParse = (await import('pdf-parse')).PDFParse
  } catch (err) {
    console.warn(`  [extract-pdf] pdf-parse non installé : ${(err as Error).message.slice(0, 120)}`)
    return null
  }

  let rawText = ''
  let pages = 0
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const result = await parser.getText()
    rawText = result.text ?? ''
    pages = result.total ?? 0
  } catch (err) {
    console.warn(`  [extract-pdf] parsing fail ${url} : ${(err as Error).message.slice(0, 120)}`)
    await parser.destroy().catch(() => {})
    return null
  }
  await parser.destroy().catch(() => {})

  const normalized = normalizePdfText(rawText)
  if (normalized.length < MIN_USEFUL_CHARS) {
    console.warn(`  [extract-pdf] texte trop court (${normalized.length} chars) sur ${url} — probablement PDF scanné`)
    return null
  }

  const truncated = normalized.length > maxChars
  const text = truncated ? truncateOnWord(normalized, maxChars) : normalized
  return { text, textSize: text.length, pages, pdfBytes, truncated }
}

/**
 * Normalise le texte extrait par pdf-parse :
 *   - retire les form-feed et NBSP
 *   - collapse les multiples espaces / lignes vides
 *   - enlève les lignes de page-break du type "—— Page 5 ——" si présentes
 */
function normalizePdfText(raw: string): string {
  return raw
    .replace(/\f/g, '\n') // form-feed → newline
    .replace(/ /g, ' ') // NBSP → space
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !/^[-—_=]{3,}\s*page\s+\d+\s*[-—_=]{3,}$/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function truncateOnWord(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s
  const cut = s.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > maxChars * 0.8 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…'
}
