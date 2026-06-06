-- ============================================================================
-- Migration 0025 — sources Phase 5 (francophonie + séries + formations)
-- ============================================================================
--
-- Contexte (2026-05-13) : ajout de 3 nouvelles sources pour le pilote
-- scénariste élargi :
--
--   1. OIF · Fonds Image de la Francophonie + TV5MONDE+
--      → public éligible : créateurs des 35 pays francophones du Sud.
--      Hors scope FR métropole mais cible naturelle d'Encre côté Sud.
--
--   2. Series Mania Institute (Lille) — Writers Campus + Eureka Series.
--      → formations / résidence-école pour scénaristes séries.
--      Type 'formation' (cf 0023).
--
--   3. Cité Européenne des Scénaristes — Centre de compagnonnage.
--      → formation pour scénaristes émergent·es. Sessions régionales
--      tournantes (IDF, Sud, AuRA, Occitanie, Bretagne). Type 'formation'.
--
-- Toutes en pattern « health-check + static emit ». Les calendriers
-- exacts ne sont pas exposés en HTML stable, on émet des items
-- représentatifs avec next_edition_status pour signaler le prochain
-- cycle attendu.
-- ============================================================================

INSERT INTO sources (slug, name, kind, is_active, config) VALUES (
  'oif-images-francophones',
  'OIF · Fonds Image de la Francophonie',
  'html',
  true,
  jsonb_build_object(
    'description', 'Fonds OIF + TV5MONDE+ pour créateurs des 35 pays francophones du Sud. 4 commissions/an (2 cinéma + 2 docs/séries). Enveloppe annuelle 1 M€. Inéligible aux ressortissants français de métropole.',
    'homepage_url', 'https://www.imagesfrancophones.org/',
    'scope', 'pays-du-sud',
    'static_count', 3
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true,
  config = EXCLUDED.config;

INSERT INTO sources (slug, name, kind, is_active, config) VALUES (
  'series-mania-institute',
  'Series Mania Institute',
  'html',
  true,
  jsonb_build_object(
    'description', 'Institut de formation séries TV adossé au festival Series Mania (Lille). Writers Campus (5 jours intensifs + pitch Forum) et Eureka Series (6 semaines, writers room simulation). Type formation.',
    'homepage_url', 'https://seriesmania.com/institute/',
    'static_count', 2
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true,
  config = EXCLUDED.config;

INSERT INTO sources (slug, name, kind, is_active, config) VALUES (
  'cite-europeenne-scenaristes',
  'Cité Européenne des Scénaristes',
  'html',
  true,
  jsonb_build_object(
    'description', 'Centre de compagnonnage pour scénaristes émergent·es. Sessions régionales tournantes (IDF, Sud, AuRA, Occitanie, Bretagne). Gratuit, financé par les régions. Conditions : inscrit·e France Travail + formation/expérience préalable en écriture.',
    'homepage_url', 'https://cite-europeenne-des-scenaristes.com/',
    'static_count', 1
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true,
  config = EXCLUDED.config;
