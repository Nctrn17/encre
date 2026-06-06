-- ============================================================================
-- Migration 0024 — source Fondation Jean-Luc Lagardère
-- ============================================================================
--
-- Contexte (2026-05-13) : ajout de la Fondation Jean-Luc Lagardère, qui
-- gère six bourses individuelles annuelles pour les jeunes auteurs
-- (< 30-35 ans). La plus emblématique pour le pilote Encre : la Bourse
-- Scénariste TV (15 000 €), spécifique au workflow bible série + pilote.
--
-- Calendrier unifié : appel ouvre en mars, deadline 14 juin, proclamation
-- en novembre. Six dispositifs partagent ce calendrier, gérés par un seul
-- scraper qui émet 6 items.
--
-- Pattern : health-check + static emit (cf. sopadin). Pas de scraping
-- profond car les règlements complets sont en PDF.
-- ============================================================================

-- Note : la table `sources` n'a pas de colonne `homepage_url` dédiée
-- (cf 0002_schema.sql). L'URL d'accueil et autres métadonnées vont dans
-- le champ `config` JSONB.
INSERT INTO sources (
  slug,
  name,
  kind,
  is_active,
  config
) VALUES (
  'fondation-lagardere',
  'Fondation Jean-Luc Lagardère',
  'html',
  true,
  jsonb_build_object(
    'description', 'Six bourses annuelles pour jeunes auteur·ices (< 30-35 ans) : Scénariste TV, Auteur de Film, Écrivain, Photographe, Journaliste, Créateur Numérique. Pattern health-check + static emit.',
    'homepage_url', 'https://www.lagardere.com/fondation/bourses/',
    'edition_year', 2026,
    'deadline_iso', '2026-06-14T23:59:59+02:00',
    'static_count', 6
  )
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true,
  config = EXCLUDED.config;
