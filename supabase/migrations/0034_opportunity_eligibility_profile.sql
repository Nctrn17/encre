-- ============================================================================
-- Migration 0034 - éligibilité structurée des opportunités
-- ============================================================================
--
-- Objectif : sortir les critères d'éligibilité sensibles du mélange
-- conditions/tags pour éviter les faux "Très adapté" et préparer les profils
-- pays du Sud, Outre-mer, femmes/minorités de genre, sociétaires, etc.
-- ============================================================================

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS eligibility_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS eligibility_summary text,
  ADD COLUMN IF NOT EXISTS eligibility_confidence text NOT NULL DEFAULT 'unknown';

ALTER TABLE opportunities
  DROP CONSTRAINT IF EXISTS opportunities_eligibility_confidence_check;

ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_eligibility_confidence_check
  CHECK (eligibility_confidence IN ('explicit', 'inferred', 'unknown'));

CREATE INDEX IF NOT EXISTS idx_opportunities_eligibility_profile
  ON opportunities USING GIN (eligibility_profile);

COMMENT ON COLUMN opportunities.eligibility_profile IS
  'Critères d''éligibilité structurés : nationalité, résidence, genre ciblé, producteur, éditeur, âge, expérience, statut pro.';

COMMENT ON COLUMN opportunities.eligibility_summary IS
  'Résumé court et lisible des critères d''éligibilité extraits.';

COMMENT ON COLUMN opportunities.eligibility_confidence IS
  'Niveau de confiance de l''éligibilité structurée : explicit, inferred ou unknown.';
