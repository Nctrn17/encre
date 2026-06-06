/**
 * Scraper — data.culture.gouv.fr (Opendatasoft Explore API v2.1)
 *
 * Ce scraper est un pilote qui interroge la liste des datasets culture pour
 * extraire les appels/subventions. Le vrai dataset varie ; on reste générique
 * et on stocke le payload brut dans raw_items pour laisser la classification
 * IA trancher.
 *
 * Doc API : https://data.culture.gouv.fr/api/explore/v2.1/
 */

import { fetchWithRetry } from '../lib/fetch-helpers'
import type { RawScrapedItem } from '../lib/types'

interface OpendatasoftRecord {
  record: {
    id: string
    timestamp: string
    fields: Record<string, unknown>
  }
}

interface OpendatasoftResponse {
  total_count: number
  results: OpendatasoftRecord['record'][]
}

export const slug = 'data-culture-gouv'

export async function run(config: Record<string, unknown>): Promise<RawScrapedItem[]> {
  const baseUrl = (config.base_url as string) || 'https://data.culture.gouv.fr'
  const dataset = (config.dataset as string) || 'licences-spectacles'
  const limit = (config.fetch_limit as number) || 100

  const url = new URL(
    `/api/explore/v2.1/catalog/datasets/${dataset}/records`,
    baseUrl,
  )
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('order_by', '-_updated_at')

  const response = await fetchWithRetry(url.toString())
  if (!response.ok) {
    throw new Error(`data.culture.gouv.fr returned ${response.status}`)
  }

  const json = (await response.json()) as OpendatasoftResponse

  const items: RawScrapedItem[] = []
  for (const record of json.results) {
    const fields = record.fields
    const title =
      (fields.titre as string) ||
      (fields.title as string) ||
      (fields.nom as string) ||
      null
    if (!title) continue

    const externalId = `dcg-${dataset}-${hashShort(JSON.stringify(record))}`

    items.push({
      external_id: externalId,
      payload: {
        title: String(title),
        description:
          (fields.description as string) || (fields.resume as string) || null,
        emitter:
          (fields.emetteur as string) ||
          (fields.organisme as string) ||
          'Ministère de la Culture',
        url: (fields.url as string) || url.toString(),
        deadline:
          (fields.date_limite as string) || (fields.deadline as string) || null,
        amount_text: (fields.montant as string) || null,
        region_hint: (fields.region as string) || null,
        raw_json: record,
      },
    })
  }

  return items
}

function hashShort(input: string): string {
  // Petit hash non-crypto stable pour external_id
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36).slice(0, 12)
}
