-- ==========================================================================
-- Ajout de la source Sopadin — Prix du Scénariste
--
-- Scraper "health-check + static emit" : le site SPA + règlement PDF ne sont
-- pas parsables de façon fiable, donc on émet 2 items statiques vérifiés
-- (Grand Prix + Prix Junior <28 ans) avec les dates de l'édition en cours.
-- À actualiser le 15 sept chaque année (bloc EDITION_YYYY dans le scraper).
--
-- 39e édition (2026) : dépôt 15 sept → 4 oct 2026.
-- Prix Junior = <28 ans → pile la cible pilote scénariste hors-réseau.
--
-- Scraper : scrapers/sources/sopadin.ts
-- URL racine : https://prix-scenariste.org/
-- Réf doc : docs/PILOTE-SCENARISTES.md section 3.4
-- ==========================================================================

INSERT INTO sources (slug, name, kind, config) VALUES
  ('sopadin',
   'Sopadin — Prix du Scénariste (Grand Prix + Junior)',
   'html',
   '{"url":"https://prix-scenariste.org/"}'::jsonb)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      kind = EXCLUDED.kind,
      config = EXCLUDED.config,
      is_active = true;
