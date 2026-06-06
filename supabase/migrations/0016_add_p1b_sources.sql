-- ==========================================================================
-- Ajout des 6 sources P1B du pilote scénariste
--
-- Agences régionales audiovisuelles + résidences scénario/réalisation :
--   1. ALCA Nouvelle-Aquitaine (4 aides cinéma/audiovisuel)
--   2. Auvergne-Rhône-Alpes Cinéma (4 fonds)
--   3. Emergence Cinéma (résidence 7 mois 1er long métrage, IDF)
--   4. Le Groupe Ouest (5 workshops scénario, Bretagne)
--   5. Moulin d'Andé CÉCI (3 résidences, Normandie)
--   6. PictanovO (10 fonds audiovisuel, Hauts-de-France)
--
-- Tous en pattern "health-check + static emit" — détails/dates dans
-- règlements PDF ou calendriers annuels stables.
--
-- Scrapers : scrapers/sources/{alca-nouvelle-aquitaine,aura-cinema,
--   emergence-cinema,le-groupe-ouest,moulin-ande-ceci,pictanovo}.ts
-- Réf doc : docs/PILOTE-SCENARISTES.md sections 3.2 et 3.3
-- ==========================================================================

INSERT INTO sources (slug, name, kind, config) VALUES
  ('alca-nouvelle-aquitaine',
   'ALCA Nouvelle-Aquitaine — Cinéma & Audiovisuel',
   'html',
   '{"url":"https://alca-nouvelle-aquitaine.fr/fr/cinema-audiovisuel"}'::jsonb),

  ('aura-cinema',
   'Auvergne-Rhône-Alpes Cinéma',
   'html',
   '{"url":"https://www.auvergnerhonealpes-cinema.fr/professionnels/financement-des-projets/"}'::jsonb),

  ('emergence-cinema',
   'Emergence Cinéma (résidence 1er long métrage)',
   'html',
   '{"url":"https://www.emergence-cinema.fr/"}'::jsonb),

  ('le-groupe-ouest',
   'Le Groupe Ouest (workshops scénario, Bretagne)',
   'html',
   '{"url":"https://www.legroupeouest.com/workshops-en-residence/"}'::jsonb),

  ('moulin-ande-ceci',
   'Moulin d''Andé — CÉCI (résidences scénario, Normandie)',
   'html',
   '{"url":"https://moulinande.com/ceci-candidature/"}'::jsonb),

  ('pictanovo',
   'PictanovO (Hauts-de-France audiovisuel, 10 fonds)',
   'html',
   '{"url":"https://www.pictanovo.com/fonds/"}'::jsonb)

ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      kind = EXCLUDED.kind,
      config = EXCLUDED.config,
      is_active = true;
