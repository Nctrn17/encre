-- ============================================================================
-- Migration 0027 — source niches-metropole
-- ============================================================================
--
-- Bucket d'ingestion pour 6 fonds métropolitains additionnels :
--   - Procirep Commission Cinéma (LM) — requires producteur
--   - Procirep Commission Télévision (séries, doc, animation) — requires producteur
--   - Trégor Cinéma — résidence individuelle, candidatures 4 mai - 30 juin 2026
--   - Cinéma de Demain (Festival Cannes) — résidence pour 12 cinéastes
--     étrangers, deadline 31 mai 2026
--   - L'Atelier des cinéastes Lyon — bourse écriture + atelier transmission
--   - Atelier 105 CNC — résidence post-production cinéma expérimental
--
-- Chaque item porte son propre `emitter`. Le slug 'niches-metropole'
-- sert juste de bucket d'ingestion mensuel.
--
-- Sources skippées faute de données fiables en mai 2026 :
--   - France TV Slash « Appel à concepts » 2026 — pas encore référencé
--   - Festival Polar Cognac « Polar Connection » — prix, pas bourse
--   - Femmes&Cinéma « Plus Belle La Bourse » — introuvable en ligne
-- ============================================================================

INSERT INTO sources (slug, name, kind, is_active, config) VALUES (
  'niches-metropole',
  'Encre · Niches métropole',
  'manual',
  true,
  jsonb_build_object(
    'description', 'Catalogue éditorial de fonds métropolitains additionnels (Procirep, résidences Trégor / Cannes / Lyon, Atelier 105 CNC) curé en mai 2026. À refresh annuellement.',
    'homepage_url', 'https://encre.xyz/opportunites',
    'static_count', 6,
    'last_curation', '2026-05-13'
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true,
  config = EXCLUDED.config;
