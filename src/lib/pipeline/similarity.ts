/**
 * Déduplication niveau 3 : similarité cosine sur embeddings.
 *
 * Utilisé uniquement quand fingerprint ne matche pas, pour attraper
 * les doublons sémantiques (mêmes appels publiés sur plusieurs sites
 * avec des titres légèrement différents).
 */

import { createServiceClient } from '@/lib/supabase/server'

const SIMILARITY_THRESHOLD = 0.92 // cosine similarity (= 1 - distance)
const SIMILARITY_DEADLINE_TOLERANCE_DAYS = 30

/**
 * Recherche un doublon sémantique potentiel via pgvector.
 * Retourne l'ID de l'opportunité existante si match, sinon null.
 *
 * Garde-fou : jamais de merge si les deadlines diffèrent de plus de 30 jours
 * (évite fusionner "Résidence 2026" et "Résidence 2027" du même émetteur).
 */
export async function findSemanticDuplicate(params: {
  embedding: number[]
  deadline: string | null
  emitterSlug: string
}): Promise<{ opportunityId: string; similarity: number } | null> {
  const supabase = createServiceClient()

  const { data, error } = await supabase.rpc('search_similar_opportunities', {
    query_embedding: params.embedding,
    match_count: 5,
    min_similarity: SIMILARITY_THRESHOLD,
  })

  if (error) {
    console.error('[similarity] RPC error:', error)
    return null
  }
  if (!data || data.length === 0) return null

  // Pour chaque candidat, vérifier la condition deadline + emitter
  for (const candidate of data) {
    const { data: opp } = await supabase
      .from('opportunities')
      .select('id, deadline, emitter_slug')
      .eq('id', candidate.opportunity_id)
      .single()

    if (!opp) continue

    // Garde-fou deadline
    if (opp.deadline && params.deadline) {
      const diffMs = Math.abs(
        new Date(opp.deadline).getTime() - new Date(params.deadline).getTime(),
      )
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      if (diffDays > SIMILARITY_DEADLINE_TOLERANCE_DAYS) continue
    }

    // Préférence : même émetteur = confirmation forte
    if (opp.emitter_slug === params.emitterSlug) {
      return { opportunityId: candidate.opportunity_id, similarity: candidate.similarity }
    }
    // Si émetteur différent mais similarité très haute, mentionner quand même
    if (candidate.similarity > 0.96) {
      return { opportunityId: candidate.opportunity_id, similarity: candidate.similarity }
    }
  }

  return null
}

/**
 * Appel à Voyage AI pour générer un embedding.
 * ⚠️ Pas testé live au scaffolding.
 */
export async function embedText(
  text: string,
  options: { apiKey?: string; model?: string; fetchImpl?: typeof fetch } = {},
): Promise<number[]> {
  const apiKey = options.apiKey ?? process.env.VOYAGE_API_KEY
  if (!apiKey) throw new Error('VOYAGE_API_KEY not configured')

  const fetchImpl = options.fetchImpl ?? fetch
  const model = options.model ?? 'voyage-3-lite'

  const response = await fetchImpl('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: text.slice(0, 8000),
      model,
      input_type: 'document',
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Voyage API error ${response.status}: ${errText.slice(0, 300)}`)
  }

  const json = (await response.json()) as { data: Array<{ embedding: number[] }> }
  const emb = json.data[0]?.embedding
  if (!emb || emb.length !== 768) {
    throw new Error(`Unexpected embedding dimension: ${emb?.length}`)
  }
  return emb
}
