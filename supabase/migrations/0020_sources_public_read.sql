-- Migration 0020 — RLS public-read sur la table sources
--
-- Bug en prod : la page /sources affichait "0 émetteurs actifs" alors que
-- 23 sources sont en base. Cause : la policy RLS originale (0003) ne
-- déclarait QUE service_role pour sources/raw_items, sans policy de
-- lecture pour anon. Or la page /sources est publique et utilise le
-- client anon (createPublicClient).
--
-- Fix : ajouter une policy SELECT publique restreinte aux sources actives
-- (is_active = true) — ce sont des infos publiques (transparence sur les
-- émetteurs suivis). Les autres colonnes sensibles (config JSON contenant
-- éventuellement des clés API ou secrets de scraping) ne sont pas couvertes
-- ici car le SELECT * sur sources renvoie toutes les colonnes : on accepte
-- ce compromis car nos `config` actuels ne contiennent que des URLs/slugs
-- publics. Si demain on stocke un secret dans config, prévoir une vue
-- `sources_public` avec liste de colonnes whitelistées.

BEGIN;

CREATE POLICY "sources_public_read" ON sources
  FOR SELECT
  USING (is_active = true);

COMMIT;
