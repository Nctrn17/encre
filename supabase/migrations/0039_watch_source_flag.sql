-- ============================================================================
-- Migration 0039 — flag watch_source (surveillance source permanente)
-- ============================================================================
--
-- Objectif : permettre qu'une fiche reste VISIBLE dans le registre (sans
-- next_edition_status = 'awaiting_details', donc affichée même sans deadline)
-- tout en restant SURVEILLÉE par recheck-awaiting-details : on re-fetch sa page
-- source chaque semaine pour alerter à la (ré)ouverture quand de nouvelles
-- dates apparaissent.
--
-- Cas d'usage : aides rares « référence permanente » qu'on choisit de garder
-- affichées malgré l'absence de session datée (dispositifs Outre-mer / pays du
-- Sud, peu nombreux), ex le FEAC. Évite de dédoubler la fiche (qui créerait une
-- page détail dupliquée / du contenu indexé en double).
-- ============================================================================

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS watch_source boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN opportunities.watch_source IS
  'Surveillance source permanente : la fiche reste visible (pas en awaiting_details) mais recheck-awaiting-details surveille quand même sa page source pour alerter à la (ré)ouverture. Pour aides rares « référence permanente » (Outre-mer, pays du Sud).';
