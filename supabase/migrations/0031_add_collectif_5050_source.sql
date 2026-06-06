-- ============================================================================
-- Migration 0031 — source collectif-5050
-- ============================================================================
--
-- Source inclusion cinéma/audiovisuel.
--
-- Premier item suivi :
--   - Boost Program — programme européen pour cinéastes femmes et minorités
--     de genre, cycle 2025-2026 clos, prochain appel attendu à l'automne 2026.
--
-- Cette source justifie le garde-fou de matching ajouté sur les critères
-- déclaratifs : tant que le profil ne demande pas explicitement ces infos,
-- l'opportunité reste visible mais ne peut pas être classée "Très adaptée".
-- ============================================================================

INSERT INTO sources (slug, name, kind, is_active, config) VALUES (
  'collectif-5050',
  'Collectif 50/50',
  'html',
  true,
  jsonb_build_object(
    'description', 'Programmes de mentorat et professionnalisation pour la parité et l''inclusion dans le cinéma et l''audiovisuel. Boost Program femmes et minorités de genre suivi pour le prochain cycle.',
    'homepage_url', 'https://collectif5050.com/',
    'static_count', 1,
    'last_curation', '2026-05-14'
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true,
  config = EXCLUDED.config;
