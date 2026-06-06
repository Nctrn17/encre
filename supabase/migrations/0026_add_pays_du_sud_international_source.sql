-- ============================================================================
-- Migration 0026 — source pays-du-sud-international
-- ============================================================================
--
-- Bucket d'ingestion pour 8 fonds majeurs accessibles aux créateurs des
-- pays du Sud :
--   - World Cinema Fund (Berlinale)
--   - Hubert Bals Fund (IFFR Rotterdam)
--   - IDFA Bertha Fund (Amsterdam)
--   - Aide aux Cinémas du Monde (CNC + MEAE)
--   - Atlas Workshops (Festival Marrakech)
--   - Africadoc / Tënk (Saint-Louis, Sénégal)
--   - Carthage Pro Chabaka + Takmil (JCC Tunisie)
--   - FESPACO Yennenga Academy (Ouagadougou)
--
-- Chaque item porte son propre `emitter` correct, ce slug-source sert
-- juste de bucket d'ingestion mensuel pour la curation manuelle.
-- ============================================================================

INSERT INTO sources (slug, name, kind, is_active, config) VALUES (
  'pays-du-sud-international',
  'Encre · Catalogue pays du Sud',
  'manual',
  true,
  jsonb_build_object(
    'description', 'Catalogue éditorial de 8 fonds internationaux et régionaux ouverts aux créateurs des pays du Sud (Afrique, Caraïbes, Asie, Amérique latine). Mis à jour annuellement à la main car chaque fonds expose son calendrier dans des structures HTML hétérogènes (souvent SPA + PDF).',
    'homepage_url', 'https://encre.xyz/pays-du-sud',
    'static_count', 8,
    'last_curation', '2026-05-13'
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true,
  config = EXCLUDED.config;
