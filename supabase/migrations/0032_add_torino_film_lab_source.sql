-- ============================================================================
-- Migration 0032 — source torino-film-lab
-- ============================================================================
--
-- Labs européens scénario / développement :
--   - ScriptLab
--   - FeatureLab
--   - SeriesLab
--   - ComedyLab
--
-- Les cycles 2026 sont clos en mai 2026, mais la source est stable et revient
-- chaque automne. On la suit pour capter rapidement les appels 2027.
-- ============================================================================

INSERT INTO sources (slug, name, kind, is_active, config) VALUES (
  'torino-film-lab',
  'TorinoFilmLab',
  'html',
  true,
  jsonb_build_object(
    'description', 'Labs européens scénario, développement long métrage, séries et comédie. Appels annuels à l''automne ; source suivie pour les prochains cycles.',
    'homepage_url', 'https://torinofilmlab.it/labs',
    'static_count', 4,
    'last_curation', '2026-05-14'
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true,
  config = EXCLUDED.config;
