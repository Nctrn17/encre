import { z } from 'zod'
import { RawItemPayloadSchema } from '../../src/lib/pipeline/schemas'

/**
 * Un scraper retourne une liste de RawScrapedItem.
 * L'orchestrator se charge de les pousser dans raw_items.
 */
const RawScrapedItemSchema = z.object({
  external_id: z.string().min(1),
  payload: RawItemPayloadSchema,
})

export type RawScrapedItem = z.infer<typeof RawScrapedItemSchema>

export interface ScraperRunResult {
  sourceSlug: string
  items: RawScrapedItem[]
  runDurationMs: number
  metrics: {
    itemsFound: number
    itemsSkipped: number
    errors: string[]
  }
}

export interface ScraperModule {
  slug: string
  run: (config: Record<string, unknown>) => Promise<RawScrapedItem[]>
}
