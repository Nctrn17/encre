-- ==========================================================================
-- agreg-culture - Schéma initial
-- 8 tables : sources, raw_items, opportunities, opportunity_embeddings,
-- profiles, alert_profiles, saved_opportunities, pending_digests
-- ==========================================================================

-- ---- ENUMS -----------------------------------------------------------------

CREATE TYPE source_kind AS ENUM ('api', 'rss', 'html', 'email', 'manual');

CREATE TYPE raw_status AS ENUM ('pending', 'processed', 'error', 'duplicate', 'throttled');

CREATE TYPE opportunity_type AS ENUM (
  'residence',
  'subvention',
  'bourse',
  'commande',
  'concours',
  'prix'
);

CREATE TYPE geo_scope AS ENUM (
  'local',
  'regional',
  'national',
  'metropole',
  'europe',
  'international'
);

CREATE TYPE digest_frequency AS ENUM ('daily', 'weekly', 'deadline_only');

-- ---- FONCTIONS UTILITAIRES -------------------------------------------------

-- Wrapper IMMUTABLE autour de unaccent() pour pouvoir l'utiliser
-- dans une colonne GENERATED ALWAYS AS (Postgres exige IMMUTABLE).
-- Référence explicite au dictionnaire pour éviter les shifts de search_path.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

-- ---- TABLES ----------------------------------------------------------------

-- Sources d'ingestion
CREATE TABLE sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  kind source_kind NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_run_metrics jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sources_is_active ON sources (is_active) WHERE is_active = true;

-- Payloads bruts (queue d'ingestion)
CREATE TABLE raw_items (
  id bigserial PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  payload jsonb NOT NULL,
  status raw_status NOT NULL DEFAULT 'pending',
  error_msg text,
  scraped_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (source_id, external_id)
);

CREATE INDEX idx_raw_items_pending ON raw_items (status, scraped_at)
  WHERE status = 'pending';

CREATE INDEX idx_raw_items_errors ON raw_items (source_id, scraped_at DESC)
  WHERE status = 'error';

-- Opportunités canoniques (source of truth)
CREATE TABLE opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  emitter text NOT NULL,
  emitter_slug text NOT NULL,
  type opportunity_type NOT NULL,
  disciplines text[] NOT NULL DEFAULT ARRAY[]::text[],
  audience text[] NOT NULL DEFAULT ARRAY[]::text[],
  geo_scope geo_scope NOT NULL,
  region_code text, -- code INSEE région (FR-XX) ou pays (ISO 3166)
  amount_min integer,
  amount_max integer,
  currency text NOT NULL DEFAULT 'EUR',
  deadline timestamptz,
  published_at timestamptz NOT NULL DEFAULT now(),
  source_url text NOT NULL,
  mirror_urls text[] NOT NULL DEFAULT ARRAY[]::text[],
  fingerprint text NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('french', immutable_unaccent(coalesce(title, ''))), 'A') ||
    setweight(to_tsvector('french', immutable_unaccent(coalesce(emitter, ''))), 'B') ||
    setweight(to_tsvector('french', immutable_unaccent(coalesce(description, ''))), 'C')
  ) STORED,
  classify_confidence numeric(3, 2),
  human_review boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_opp_search ON opportunities USING GIN (search_vector);
CREATE INDEX idx_opp_disciplines ON opportunities USING GIN (disciplines);
CREATE INDEX idx_opp_audience ON opportunities USING GIN (audience);
CREATE INDEX idx_opp_type ON opportunities (type);
CREATE INDEX idx_opp_region ON opportunities (region_code) WHERE region_code IS NOT NULL;
-- Note : on ne peut pas mettre `deadline > now()` en predicate (now() n'est
-- pas IMMUTABLE). On couvre is_published + deadline non-null ; le filtre
-- temporel se fait au runtime dans les queries.
CREATE INDEX idx_opp_deadline_upcoming ON opportunities (deadline)
  WHERE is_published AND deadline IS NOT NULL;
CREATE INDEX idx_opp_fingerprint ON opportunities (fingerprint);
CREATE INDEX idx_opp_emitter_slug ON opportunities (emitter_slug);
CREATE INDEX idx_opp_review ON opportunities (human_review)
  WHERE human_review = true;

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_opp_updated_at
  BEFORE UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Embeddings pour recherche sémantique et dedup
CREATE TABLE opportunity_embeddings (
  opportunity_id uuid PRIMARY KEY REFERENCES opportunities(id) ON DELETE CASCADE,
  embedding vector(768) NOT NULL,
  model text NOT NULL DEFAULT 'voyage-3-lite',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- HNSW index pour recherche ANN rapide
CREATE INDEX idx_opp_embed_hnsw ON opportunity_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- Profils utilisateur (lié auth.users géré par Supabase)
CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Profils d'alerte personnalisés
CREATE TABLE alert_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  disciplines text[] NOT NULL DEFAULT ARRAY[]::text[],
  audience text[] NOT NULL DEFAULT ARRAY[]::text[],
  types opportunity_type[] NOT NULL DEFAULT ARRAY[]::opportunity_type[],
  geo_scopes geo_scope[] NOT NULL DEFAULT ARRAY[]::geo_scope[],
  region_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  min_amount integer,
  frequency digest_frequency NOT NULL DEFAULT 'weekly',
  last_sent_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alert_profiles_active_user ON alert_profiles (user_id)
  WHERE is_active = true;

-- Favoris
CREATE TABLE saved_opportunities (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  note text,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, opportunity_id)
);

CREATE INDEX idx_saved_by_opp ON saved_opportunities (opportunity_id);

-- Queue d'envoi digests
CREATE TABLE pending_digests (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_profile_id uuid NOT NULL REFERENCES alert_profiles(id) ON DELETE CASCADE,
  opportunity_ids uuid[] NOT NULL,
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  error_msg text
);

CREATE INDEX idx_pending_digests_due ON pending_digests (scheduled_for)
  WHERE sent_at IS NULL;

-- Liste d'attente pré-lancement (email seulement)
CREATE TABLE waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  disciplines text[] NOT NULL DEFAULT ARRAY[]::text[],
  region_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  source text, -- UTM ou canal de capture
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

-- Compteurs quotidiens pour hard cap (anti-surcoût LLM)
CREATE TABLE daily_counters (
  counter_date date NOT NULL,
  counter_name text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (counter_date, counter_name)
);
