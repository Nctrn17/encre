-- ============================================================================
-- Migration 0023 — formation enum + tag pays-du-sud
-- ============================================================================
--
-- Contexte (2026-05-13) : extension du scope Encre :
--   1. Ajout du type 'formation' à l'enum opportunity_type — couvre les
--      compagnonnages (Cité Européenne des Scénaristes), résidences-école
--      (Series Mania Institute Writers Campus, Eureka Series) et bourses
--      de formation. Distinct de 'residence' (qui est une période de
--      création) et de 'subvention' (financement sans pédagogie).
--
--   2. Pas de migration de schéma pour les tags pays-du-sud, bible,
--      pilote-tv, formation : ils sont stockés dans disciplines_tags
--      (text[]), donc pas besoin d'enum. La détection se fait au
--      tagging (normalize.ts + script de reclassif).
--
-- Postgres exige ALTER TYPE ADD VALUE hors transaction.
-- Sur Supabase, on l'exécute via la console SQL ou via migration sans
-- BEGIN/COMMIT. supabase db push gère.
-- ============================================================================

ALTER TYPE opportunity_type ADD VALUE IF NOT EXISTS 'formation';

-- Pas de changement de table : opportunities.type accepte déjà tous les
-- enum values, et les filtres SQL existants fonctionnent par égalité de
-- chaîne. Les nouveaux items 'formation' sortiront naturellement.

COMMENT ON TYPE opportunity_type IS
  'Types d''appels : résidence (séjour création), subvention (financement direct), bourse (allocation auteur), commande (œuvre commandée), concours (compétition jury), prix (récompense), formation (compagnonnage / résidence-école / atelier de formation, ajouté en 0023).';
