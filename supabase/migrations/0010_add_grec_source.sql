-- ==========================================================================
-- Ajout de la source GREC (Groupe de Recherche et d'Essais Cinématographiques)
--
-- Première source "hors-État" : association privée qui produit les premiers
-- courts-métrages d'auteurs débutants. Référence pour jeunes cinéastes
-- hors-réseau — pile la promesse produit.
--
-- Scraper : scrapers/sources/grec.ts
-- URL : https://www.grec-info.com/appels.php
-- ==========================================================================

INSERT INTO sources (slug, name, kind, config) VALUES
  ('grec', 'Le GREC — Groupe de Recherche et d''Essais Cinématographiques', 'html',
    '{"url":"https://www.grec-info.com/appels.php"}'::jsonb)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      kind = EXCLUDED.kind,
      config = EXCLUDED.config,
      is_active = true;
