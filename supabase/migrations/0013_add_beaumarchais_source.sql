-- ==========================================================================
-- Ajout de la source Beaumarchais-SACD (bourses d'écriture)
--
-- 11 bourses distinctes scrapées depuis les pages détail (URLs stables) :
--   5 audiovisuelles : court métrage, long métrage, TV, animation TV, fiction sonore
--   6 spectacle vivant : théâtre, mise en scène théâtre, cirque, danse,
--                        espace public, spectacle sonore ou musical
--
-- Particularités notables (scraper encode hint_hors_reseau_friendly = true et
-- hint_min_films_produits = 0 dans raw_json pour guider le classifier Haiku) :
--   - Adhésion SACD NON obligatoire
--   - Strictement émergents : max 1 œuvre pro antérieure par discipline
--   - Jamais lauréat Beaumarchais antérieur dans la discipline
--   - Pas de limite d'âge / nationalité / résidence
--
-- Montants vérifiés (live 2026-04-19) :
--   2 000 € court métrage · 5 000 € long + TV + animation TV · 3 500 € autres
--
-- Scraper : scrapers/sources/beaumarchais.ts
-- URL racine : https://beaumarchais.asso.fr/
-- Réf doc : docs/PILOTE-SCENARISTES.md section 3.1 (pépite pilote)
-- ==========================================================================

INSERT INTO sources (slug, name, kind, config) VALUES
  ('beaumarchais',
   'Association Beaumarchais-SACD (11 bourses)',
   'html',
   '{"url":"https://beaumarchais.asso.fr/"}'::jsonb)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      kind = EXCLUDED.kind,
      config = EXCLUDED.config,
      is_active = true;
