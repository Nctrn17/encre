-- ==========================================================================
-- Ajout de la source SCAM — Brouillon d'un rêve
--
-- Deuxième source "hors-État" pour le pilote scénariste : 9 bourses distinctes
-- (documentaire, journalisme, sonore, littéraire, photo, écritures émergentes,
-- Impact vidéastes web, Albert Londres, France Culture audio).
--
-- Particularité pour la cible hors-réseau :
--   - Candidature ouverte aux non-sociétaires SCAM la première fois
--   - Volet Documentaire = 6 commissions/an (cycle le plus dense du marché)
--   - Montants 2 500–6 000 € cumulables
--
-- Scraper : scrapers/sources/scam-brouillon-dun-reve.ts
-- URL racine : https://www.lascam.fr/lessentiel/bourses-brouillon-dun-reve/
-- Réf doc : docs/PILOTE-SCENARISTES.md section 3.1
-- ==========================================================================

INSERT INTO sources (slug, name, kind, config) VALUES
  ('scam-brouillon-dun-reve',
   'SCAM — Brouillon d''un rêve (9 bourses)',
   'html',
   '{"url":"https://www.lascam.fr/lessentiel/bourses-brouillon-dun-reve/"}'::jsonb)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      kind = EXCLUDED.kind,
      config = EXCLUDED.config,
      is_active = true;
