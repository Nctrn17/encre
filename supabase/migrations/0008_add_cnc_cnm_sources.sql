-- ==========================================================================
-- Ajout des sources CNC (cinéma/audiovisuel) et CNM (musique)
--
-- CNC : stratégie sitemap XML + fetch individuel pour meta tags
-- CNM : stratégie API REST WordPress (wp-json/wp/v2/aide)
-- ==========================================================================

INSERT INTO sources (slug, name, kind, config) VALUES
  ('cnc', 'CNC — Centre national du cinéma et de l''image animée', 'html',
    '{"sitemap_url":"https://www.cnc.fr/sitemap.xml","fetch_limit":50,"throttle_ms":150}'::jsonb),
  ('cnm', 'CNM — Centre national de la musique', 'api',
    '{"per_page":100}'::jsonb)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      kind = EXCLUDED.kind,
      config = EXCLUDED.config,
      is_active = true;
