-- ==========================================================================
-- Ajout de la source Région Île-de-France — Aide à l'écriture de scénario
--
-- Scraper "health-check + static emit" : dispositif annuel stable à 1 session
-- unique. Critical pour pilote scénariste car 1 seule date/an (mercredi 10
-- juin 2026, 9h-17h) → si manqué, année perdue.
--
-- Deux catégories : auteurs débutants (hors_reseau_friendly = true) +
-- auteurs confirmés. Dépôt via mesdemarches.iledefrance.fr.
--
-- Scraper : scrapers/sources/region-idf-scenario.ts
-- URL : https://www.iledefrance.fr/aides-et-appels-a-projets/aide-lecriture-de-scenario-cinema-et-audiovisuel
-- Réf doc : docs/PILOTE-SCENARISTES.md section 3.3
-- ==========================================================================

INSERT INTO sources (slug, name, kind, config) VALUES
  ('region-idf-scenario',
   'Région Île-de-France — Aide à l''écriture de scénario',
   'html',
   '{"url":"https://www.iledefrance.fr/aides-et-appels-a-projets/aide-lecriture-de-scenario-cinema-et-audiovisuel"}'::jsonb)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      kind = EXCLUDED.kind,
      config = EXCLUDED.config,
      is_active = true;
