-- ============================================================================
-- Migration 0033 — sources internationales FR + régions AV manquantes
-- ============================================================================
--
-- Ajoute deux buckets d'ingestion éditoriaux :
--
--   1. residences-internationales-fr
--      Villa Albertine, MIRA, Villa Kujoyama, Villa Médicis.
--
--   2. regional-av-manquantes
--      Ciclic, Bretagne Cinéma, Normandie, Occitanie, Grand Est, Région Sud.
--
-- Les items sont émis avec `next_edition_status` / `suggest_awaiting_details`
-- quand les calendriers précis doivent encore être vérifiés en curation.
-- ============================================================================

INSERT INTO sources (slug, name, kind, is_active, config) VALUES (
  'residences-internationales-fr',
  'Encre · Résidences internationales ouvertes FR',
  'html',
  true,
  jsonb_build_object(
    'description', 'Bucket de veille pour résidences internationales ouvertes aux créateurs français ou installés en France : Villa Albertine, MIRA, Villa Kujoyama, Villa Médicis.',
    'homepage_url', 'https://www.institutfrancais.com/fr/programme/residence-mobilite-professionnelle/mira',
    'static_count', 4,
    'last_curation', '2026-05-14'
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true,
  config = EXCLUDED.config;

INSERT INTO sources (slug, name, kind, is_active, config) VALUES (
  'regional-av-manquantes',
  'Encre · Régions audiovisuelles à compléter',
  'html',
  true,
  jsonb_build_object(
    'description', 'Bucket de veille pour guichets régionaux audiovisuel encore absents du pilote : Ciclic, Bretagne Cinéma, Normandie, Occitanie, Grand Est, Région Sud.',
    'homepage_url', 'https://ciclic.fr/cinema-audiovisuel/les-missions/les-aides-selectives',
    'static_count', 6,
    'last_curation', '2026-05-14'
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true,
  config = EXCLUDED.config;
