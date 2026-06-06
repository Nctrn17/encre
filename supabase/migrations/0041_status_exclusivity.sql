-- ============================================================================
-- Migration 0041 — exclusivité des états + la machine ne publie jamais
-- ============================================================================
--
-- Problème : `is_published`, `human_review`, `next_edition_status` et `rejected`
-- sont des colonnes indépendantes. Rien n'empêchait une fiche d'être à la fois
-- `is_published=true` ET `awaiting_details` (ou en review, ou rejetée) — un état
-- contradictoire visible dans l'admin de curation.
--
-- 1) Défaut `is_published = false` : seule la curation humaine publie. Le
--    pipeline insérait jusqu'ici avec le défaut `true` => tout était auto-publié
--    (cause racine du bug « aides publiées sans validation »).
--
-- 2) Contraintes CHECK : la base REFUSE physiquement les combinaisons
--    contradictoires. Une fiche PUBLIÉE (dans le registre) est forcément dans un
--    état propre ; une fiche REJETÉE (pierre tombale) aussi. La contradiction
--    devient impossible à écrire, pas juste à corriger après coup.
--
-- Données déjà conformes au moment de la migration (audit : 0 violation sur ces
-- 5 combos). Le combo review+awaiting (human_review étant un flag qualité, pas
-- un état de visibilité) n'est volontairement PAS contraint ici.
-- ============================================================================

ALTER TABLE opportunities ALTER COLUMN is_published SET DEFAULT false;

ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_published_not_review
    CHECK (NOT (is_published AND human_review)),
  ADD CONSTRAINT opportunities_published_not_rejected
    CHECK (NOT (is_published AND rejected)),
  ADD CONSTRAINT opportunities_published_not_awaiting
    CHECK (NOT (is_published AND next_edition_status = 'awaiting_details')),
  ADD CONSTRAINT opportunities_rejected_not_review
    CHECK (NOT (rejected AND human_review)),
  ADD CONSTRAINT opportunities_rejected_not_awaiting
    CHECK (NOT (rejected AND next_edition_status = 'awaiting_details'));
