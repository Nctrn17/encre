-- Migration 0018 - Sections structurées de la fiche détail
--
-- Contexte : la fiche détail (mockup v6-detail) doit afficher quatre sections
-- distinctes (Présentation / Conditions / Calendrier / Dossier de candidature).
-- Aujourd'hui seul `description` (texte plat) est disponible. Pour éviter
-- les hallucinations LLM lors d'un éventuel rendu markdown libre, on choisit
-- des champs typés stricts : trois listes text[] que le pipeline `classify.ts`
-- doit remplir explicitement, avec instruction anti-invention dans le prompt.
--
-- Chaque liste est nullable (NULL ou empty array) si la source officielle
-- ne mentionne pas la section. La page rendu fait alors un fallback gracieux
-- vers le règlement officiel.
--
-- Ordre de run : après 0017_disable_data_culture_gouv_source.sql
-- Rollback : DROP COLUMN IF EXISTS pour chaque champ.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- Champ 1 : conditions (text[])
-- ═══════════════════════════════════════════════════════════════════════════
-- Critères d'éligibilité, un par ligne, formulés en phrase claire.
-- Exemples attendus :
--   ["Compagnie professionnelle constituée (association, coopérative, etc.)",
--    "Au moins une création antérieure portée publiquement",
--    "Pas d'exigence de producteur"]
-- Empty array '{}' si la source ne précise pas de conditions.
-- Le LLM est instruit de NE PAS inventer : extraction stricte du texte source.
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS conditions text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN opportunities.conditions IS
  'Critères d''éligibilité extraits littéralement de la source officielle. Empty si non précisé. Pas d''invention LLM autorisée.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Champ 2 : calendrier (text[])
-- ═══════════════════════════════════════════════════════════════════════════
-- Étapes du calendrier de sélection, une par ligne, avec date si disponible.
-- Format libre mais conventionnel :
--   ["30 juin 2026 : clôture des candidatures",
--    "15 juillet 2026 : pré-sélection sur dossier",
--    "Septembre 2026 : auditions des présélectionnés",
--    "Octobre 2026 : notification des résultats"]
-- Empty array '{}' si la source ne donne qu'une deadline (déjà dans `deadline`).
-- Le LLM est instruit de NE PAS inventer de date : si la source mentionne
-- "sélection à l'automne" sans date précise, retourner ["Automne 2026 : sélection"].
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS calendrier text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN opportunities.calendrier IS
  'Étapes du calendrier de sélection extraites littéralement de la source. Empty si seule la deadline est connue. Pas d''invention de date autorisée.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Champ 3 : dossier (text[])
-- ═══════════════════════════════════════════════════════════════════════════
-- Pièces à fournir au dossier de candidature, une par ligne.
-- Exemples attendus :
--   ["Présentation de la structure (3 pages maximum)",
--    "Synopsis du projet avec note d'intention (5 pages maximum)",
--    "Échantillon d'écriture représentatif (10 pages maximum)",
--    "Statuts juridiques + RIB"]
-- Empty array '{}' si la source ne détaille pas les pièces.
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS dossier text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN opportunities.dossier IS
  'Pièces à fournir au dossier de candidature, extraites littéralement. Empty si non détaillé.';

COMMIT;
