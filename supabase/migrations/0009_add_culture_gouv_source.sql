-- ==========================================================================
-- Ajout de la source culture-gouv (catalogue centralisé du Ministère Culture)
--
-- URL : https://www.culture.gouv.fr/catalogue-des-demarches-et-subventions/
-- ~571 URLs indexées dans les 12 sitemaps culture.gouv.fr.
-- Couvre national + régional (DRAC alimentent ce catalogue).
--
-- Scraper : scrapers/sources/culture-gouv.ts
-- Utilise scrapers/lib/sitemap-scraper.ts (fetch sitemaps + meta OpenGraph).
-- ==========================================================================

INSERT INTO sources (slug, name, kind, config) VALUES
  ('culture-gouv', 'Ministère de la Culture — Catalogue des démarches et subventions', 'html',
    '{"fetch_limit":60,"throttle_ms":200}'::jsonb)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      kind = EXCLUDED.kind,
      config = EXCLUDED.config,
      is_active = true;
