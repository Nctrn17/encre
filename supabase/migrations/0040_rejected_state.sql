-- ============================================================================
-- Migration 0040 — état `rejected` (pierre tombale anti-résurrection)
-- ============================================================================
--
-- Règle métier (2026-06-01) : `is_published = true` ne peut être posé QUE par
-- une validation humaine (Walid). La machine ne publie jamais. Symétriquement,
-- quand Walid écarte une annonce, elle ne doit JAMAIS revenir au scrape suivant.
--
-- Problème corrigé : `process-raw.ts` ressuscite (`reviveOpportunity`) toute
-- fiche dont le fingerprint réapparaît et qui est `is_published = false` — sans
-- distinguer « désactivée par l'audit URL morte » de « rejetée par l'humain ».
-- Une décision de rejet était donc annulée au scrape suivant.
--
-- `rejected = true` = pierre tombale : la ligne RESTE en base (son fingerprint
-- bloque toute recréation), mais le pipeline ne la republie jamais et la file de
-- curation ne la repropose plus. C'est l'état terminal d'une annonce écartée.
-- ============================================================================

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS rejected boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN opportunities.rejected IS
  'Pierre tombale : annonce écartée par curation humaine. La ligne est conservée (le fingerprint bloque la recréation au scrape) mais n''est jamais republiée ni reproposée en revue. Terminal, distinct de is_published=false (qui peut être un candidat en attente).';

-- Lookup dédup : process-raw cherche par fingerprint puis lit `rejected`.
-- L'index fingerprint existe déjà ; on ajoute un index partiel léger pour
-- exclure rapidement les tombstones des files de curation.
CREATE INDEX IF NOT EXISTS opportunities_rejected_idx
  ON opportunities (rejected)
  WHERE rejected = true;
