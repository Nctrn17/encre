-- 0036_search_queries.sql
-- Journal minimal des recherches libres sur /aides.
--
-- Objectif produit : savoir quels mots les beta testeurs cherchent avant le
-- launch, sans tracer les visiteurs. On stocke donc la requete et le contexte
-- de filtres, mais pas d'IP, pas de user-agent, pas de cookie, pas de user_id.

CREATE TABLE IF NOT EXISTS public.search_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query text NOT NULL,
  normalized_query text NOT NULL,
  result_count integer NOT NULL DEFAULT 0 CHECK (result_count >= 0),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  page_path text NOT NULL DEFAULT '/aides',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_queries_created_at
  ON public.search_queries (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_queries_normalized
  ON public.search_queries (normalized_query);

CREATE INDEX IF NOT EXISTS idx_search_queries_filters_gin
  ON public.search_queries USING GIN (filters);

ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;

-- Pas de policy anon/authenticated : l'insertion passe uniquement par le
-- service_role cote serveur, et la lecture reste reservee aux outils admin.

COMMENT ON TABLE public.search_queries IS
  'Journal prive et minimal des recherches libres /aides, sans identifiant visiteur.';
