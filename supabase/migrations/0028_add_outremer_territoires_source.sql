-- ============================================================================
-- Migration 0028 — source outremer-territoires
-- ============================================================================
--
-- Bucket d'ingestion pour 6 fonds DROM-COM ciblés :
--   - CNC Aide sélective cultures d'outre-mer
--   - Région Réunion · Aide à l'écriture de scénario (3 000 €)
--   - Région Guadeloupe · Fonds régional 2024-2030
--   - CTM Martinique · Fonds territorial (jusqu'à 100 % des coûts éligibles)
--   - CTG Guyane · Soutien création cinématographique
--   - DAC Mayotte · Résidences d'artistes en territoire (volet audiovisuel)
--
-- Chaque item porte son propre emitter et son hint_region_code (FR-LRE,
-- FR-GP, FR-MQ, FR-GF, FR-YT) pour permettre un filtrage géographique fin.
-- Tous taggés 'outremer' au niveau disciplines_tags.
-- ============================================================================

INSERT INTO sources (slug, name, kind, is_active, config) VALUES (
  'outremer-territoires',
  'Encre · Territoires Outre-mer',
  'manual',
  true,
  jsonb_build_object(
    'description', 'Catalogue éditorial de 6 fonds DROM-COM ciblés (CNC, Régions Réunion / Guadeloupe / Martinique / Guyane / Mayotte). Curation mai 2026. À refresh annuellement.',
    'homepage_url', 'https://encre.xyz/outremer',
    'static_count', 6,
    'last_curation', '2026-05-13',
    'skipped_territories', 'Polynésie française, Nouvelle-Calédonie, Wallis-et-Futuna, Saint-Pierre-et-Miquelon — pas de dispositifs cinéma actifs trouvés en mai 2026'
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true,
  config = EXCLUDED.config;
