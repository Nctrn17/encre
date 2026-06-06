-- Migration 0019 — Champ requires_editor pour filtre auteurs littéraires
--
-- Contexte : pour les pilotes auteurs littéraires (post-V1), beaucoup d'aides
-- exigent qu'un éditeur (maison d'édition) soit déjà attaché au projet —
-- équivalent du `requires_producer` existant pour le cinéma. Un auteur
-- non-publié ou en début de carrière a besoin de filtrer ces aides pour ne
-- voir que celles candidatables seul.
--
-- Le champ `hors_reseau_friendly` existe déjà mais agrège éditeur/producteur/
-- agent en un seul booléen. On veut une granularité par axe pour le filtre
-- "Sans éditeur" sans bloquer les aides qui nécessitent juste un producteur
-- (cinéma).
--
-- Ordre de run : après 0018_structured_sections.sql.
-- Rollback : DROP COLUMN IF EXISTS requires_editor;

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- Champ : requires_editor
-- ═══════════════════════════════════════════════════════════════════════════
-- Distinct de hors_reseau_friendly et requires_producer : signal binaire
-- spécifique à l'édition / littérature.
--
-- TRUE  = une maison d'édition doit être attachée au dossier (ex : aides CNL
--         à la traduction côté éditeur, aides régionales à la publication, etc.)
-- FALSE = pas d'éditeur requis, l'auteur peut candidater seul (ex : bourse
--         d'écriture CNL auteur, résidence d'écriture sans condition d'édition)
--
-- Default FALSE : on préfère faux-négatifs (proposer une aide même si elle
-- requiert finalement un éditeur — l'utilisateur lira les détails) à
-- faux-positifs (cacher des aides accessibles).
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS requires_editor boolean DEFAULT false;

COMMENT ON COLUMN opportunities.requires_editor IS
  'TRUE si une maison d''édition doit être attachée au dossier de candidature. Filtre dédié pour auteurs littéraires non-publiés. Distinct de hors_reseau_friendly (agrégat éditeur+producteur+agent) et de requires_producer (cinéma).';

-- Index partiel sur les opps SANS éditeur — c'est la valeur la plus filtrée
-- (les auteurs qui cochent "pas d'éditeur" veulent voir requires_editor = false).
CREATE INDEX IF NOT EXISTS idx_opps_requires_editor_false
  ON opportunities (requires_editor)
  WHERE requires_editor = false;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTES D'IMPLÉMENTATION (suite en code)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. Étendre src/lib/pipeline/schemas.ts : ajouter requires_editor au schema
--    Zod ClassificationOutputSchema (default false), idem pour OpportunityDraft.
--
-- 2. Mettre à jour src/lib/pipeline/classify.ts : ajouter requires_editor à
--    la function declaration Gemini, prompt avec garde anti-hallucination
--    ("FALSE par défaut. TRUE seulement si la source dit explicitement qu'un
--    éditeur ou maison d'édition est requis.").
--
-- 3. Mettre à jour src/lib/pipeline/normalize.ts pour passer le champ au draft.
--
-- 4. Étendre extractPilotFields (normalize.ts) : patterns FR pour fallback
--    inférence texte ("éditeur attaché", "via maison d'édition", "porté par
--    un éditeur", etc.).
--
-- 5. Mettre à jour src/features/opportunities/queries.ts : filtre
--    `withoutEditor` (= eq('requires_editor', false)).
--
-- 6. Étendre src/components/opportunities/OpportunityFilters.tsx : checkbox
--    "Sans éditeur" dans la sidebar (URL-piloted, query param `ne`).
--
-- 7. Reclassif sur les opps existantes via npm run reclassify:sections
--    (le script appelle déjà classifyOpportunity qui retourne tout).
