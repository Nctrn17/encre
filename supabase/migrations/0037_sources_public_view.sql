-- Migration 0037 — Vue sources_public + retrait de la lecture anon sur sources
--
-- Durcissement de la migration 0020 (cf. son commentaire « time-bomb ») : la
-- policy RLS publique exposait TOUTES les colonnes de `sources`, dont `config`
-- (JSONB). Aujourd'hui `config` ne contient que des URLs/descriptions publiques,
-- mais rien n'empêche d'y stocker demain une clé API de scraping (Firecrawl,
-- token RSS privé…), qui fuiterait alors via le client anon de la page /sources.
--
-- Solution pérenne : une vue `sources_public` qui
--   1. ne garde que les colonnes publiques ;
--   2. purge de `config` les clés au nom sensible (api_key, token, secret…).
-- Le client anon lit désormais cette vue ; l'accès direct à la table brute lui
-- est retiré. Le service_role (scrapers, admin) continue de lire `sources`
-- intégralement (il bypasse la RLS).
--
-- ⚠️ Ordre de déploiement : appliquer cette migration AVANT (ou avec) le code
-- qui bascule les requêtes anon sur `sources_public` (features/sources/queries
-- + app/sources). Sinon la page /sources renverra une erreur le temps que la
-- vue existe.

BEGIN;

-- La vue tourne avec les droits du propriétaire (security_invoker = false par
-- défaut sous Postgres) : elle peut donc lire `sources` même après retrait de
-- la policy anon, et n'expose à anon que ce qu'on a whitelisté.
CREATE OR REPLACE VIEW sources_public AS
SELECT
  id,
  slug,
  name,
  kind,
  is_active,
  last_run_at,
  last_run_metrics,
  -- Retire les clés top-level susceptibles de contenir un secret. `config`
  -- ne garde alors que des champs publics (url, description, selectors…).
  (
    config
    - 'api_key' - 'apikey' - 'token' - 'secret' - 'password'
    - 'auth' - 'authorization' - 'jwt' - 'cookie' - 'bearer'
    - 'credentials' - 'private_key'
  ) AS config
FROM sources
WHERE is_active = true;

-- Lecture publique sur la vue uniquement.
GRANT SELECT ON sources_public TO anon, authenticated;

-- On coupe la lecture anon directe sur la table brute (introduite en 0020).
DROP POLICY IF EXISTS "sources_public_read" ON sources;

COMMIT;
