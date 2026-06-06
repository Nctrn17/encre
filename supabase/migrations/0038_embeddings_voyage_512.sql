-- Migration 0038 — aligne la dimension des embeddings sur Voyage voyage-3-lite
--
-- Le scaffolding supposait 768 dims, mais voyage-3-lite renvoie 512 (vérifié en
-- live). Aucun modèle Voyage ne fait 768 (512 / 1024 / 2048). La table
-- opportunity_embeddings est vide (le dédup sémantique n'a jamais tourné faute
-- de clé), donc le changement de dimension est sans risque et sans impact sur
-- le site (table non lue par les pages publiques).

BEGIN;

DROP INDEX IF EXISTS idx_opp_embed_hnsw;

ALTER TABLE opportunity_embeddings
  ALTER COLUMN embedding TYPE vector(512);

CREATE INDEX IF NOT EXISTS idx_opp_embed_hnsw
  ON opportunity_embeddings
  USING hnsw (embedding vector_cosine_ops);

COMMIT;
