-- 0021_search_fuzzy.sql
-- Recherche tolérante aux accents, sous-chaînes, et fautes de frappe.
--
-- Avant : `search_vector` (tsvector + immutable_unaccent) couvre stemming FR
-- mais ne gère pas les saisies partielles ni les fautes (`résidance` →
-- `résidence`). Le test scénaristes/auteurs a remonté que `scénario` ne
-- matchait pas une opp dont le titre contient `Scénario` (cause : la query
-- côté JS arrivait accentuée alors que le vector est unaccent).
--
-- Ajouts :
-- 1. Colonne générée `searchable_text` : concat unaccent + lowercase du
--    titre, émetteur, description. Indexée trigramme (gin_trgm_ops) pour
--    autoriser ILIKE sur sous-chaînes et similarité (`%`).
-- 2. RPC `search_opportunities_fuzzy(q)` : retourne les ids matchants
--    via FTS OR ILIKE OR similarité trigramme (seuil 0.3), ordonnés par
--    score décroissant. Utilisé côté Next pour les requêtes utilisateur.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS searchable_text text GENERATED ALWAYS AS (
    immutable_unaccent(lower(
      coalesce(title, '') || ' ' ||
      coalesce(emitter, '') || ' ' ||
      coalesce(description, '')
    ))
  ) STORED;

-- Note : Supabase installe pg_trgm dans le schéma `extensions`, pas `public`.
-- On référence donc explicitement `extensions.gin_trgm_ops` et on force le
-- search_path sur la fonction RPC pour que `similarity()` et l'opérateur `%`
-- soient résolus quel que soit le rôle appelant.
CREATE INDEX IF NOT EXISTS idx_opp_searchable_trgm
  ON opportunities
  USING GIN (searchable_text extensions.gin_trgm_ops);

-- Fonction RPC : retourne (id, score) pour les opps publiées qui matchent
-- la query (FTS ou ILIKE ou trigram similarity > 0.3). L'appelant Next
-- combine ensuite avec les autres filtres via .in('id', ...).
CREATE OR REPLACE FUNCTION public.search_opportunities_fuzzy(q text)
RETURNS TABLE(id uuid, score real)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  WITH n AS (
    SELECT immutable_unaccent(lower(trim(q))) AS qn
  )
  SELECT
    o.id,
    GREATEST(
      CASE
        WHEN o.search_vector @@ websearch_to_tsquery('french', (SELECT qn FROM n))
        THEN ts_rank_cd(o.search_vector, websearch_to_tsquery('french', (SELECT qn FROM n)))
        ELSE 0
      END,
      similarity(o.searchable_text, (SELECT qn FROM n)),
      CASE WHEN o.searchable_text ILIKE '%' || (SELECT qn FROM n) || '%' THEN 0.4 ELSE 0 END
    )::real AS score
  FROM opportunities o
  WHERE
    (SELECT qn FROM n) <> ''
    AND (
      o.search_vector @@ websearch_to_tsquery('french', (SELECT qn FROM n))
      OR o.searchable_text ILIKE '%' || (SELECT qn FROM n) || '%'
      OR o.searchable_text % (SELECT qn FROM n)
    );
$$;

-- Le client public (anon) doit pouvoir appeler la RPC.
GRANT EXECUTE ON FUNCTION public.search_opportunities_fuzzy(text) TO anon, authenticated;

COMMENT ON FUNCTION public.search_opportunities_fuzzy IS
  'Recherche tolérante aux accents, substrings et fautes de frappe (~30 % edit). Retourne (id, score) à filtrer ensuite côté queries.ts.';
