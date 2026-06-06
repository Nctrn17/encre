-- ==========================================================================
-- Ajout de la source CNL (Centre national du livre)
-- Drupal 8, structure bien indexée, scraper dans scrapers/sources/cnl.ts
-- ==========================================================================

INSERT INTO sources (slug, name, kind, config) VALUES
  ('cnl', 'CNL — Centre national du livre', 'html',
    '{"url":"https://centrenationaldulivre.fr/aides"}'::jsonb)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      kind = EXCLUDED.kind,
      config = EXCLUDED.config,
      is_active = true;
