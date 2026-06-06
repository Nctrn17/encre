-- ==========================================================================
-- Seed démo : opportunités fictives pour le dev / preview UI
--
-- ⚠ NE PAS APPLIQUER EN PROD. Garde-fou actif :
--    Le INSERT n'a lieu QUE si la session/database GUC `app.allow_demo_seed`
--    vaut 'true'. En prod, le GUC n'est pas défini → la migration s'applique
--    sans erreur mais ne fait rien (pas d'opps fictives en base prod).
--
-- Pour activer en local :
--   psql ... -c "ALTER DATABASE postgres SET app.allow_demo_seed = 'true';"
--   supabase db push
--   psql ... -c "ALTER DATABASE postgres RESET app.allow_demo_seed;"  -- recommandé
--
-- Note : les opportunités pointent vers leurs pages officielles via source_url
-- (pas de FK vers sources au niveau des opportunities). On insère directement.
-- ==========================================================================

DO $demo_seed$
BEGIN
  IF current_setting('app.allow_demo_seed', true) IS DISTINCT FROM 'true' THEN
    RAISE NOTICE '[0006_seed_demo_opportunities] app.allow_demo_seed != true, skip seed.';
    RETURN;
  END IF;

INSERT INTO opportunities (
  slug, title, description, emitter, emitter_slug, type,
  disciplines, audience, geo_scope, region_code,
  amount_min, amount_max, deadline, source_url, fingerprint,
  classify_confidence
) VALUES

('residence-villa-albertine-2026',
  'Résidence Villa Albertine — Saison 2026',
  'Programme de résidences de recherche de 1 à 3 mois dans 10 villes américaines. Ouvert aux artistes de toutes disciplines. Dotation pour couvrir frais de vie et recherche.',
  'Institut français', 'institut-francais',
  'residence',
  ARRAY['arts_visuels', 'theatre', 'danse', 'musique', 'litterature', 'cinema', 'transdisciplinaire'],
  ARRAY['individuel', 'etabli'],
  'international', 'US',
  2000, 6000,
  '2026-06-30 23:59:00+02',
  'https://villa-albertine.org/residences-2026',
  'demo-villa-albertine-2026', 0.95),

('residence-moly-sabata-2026',
  'Résidence Moly-Sabata — Arts visuels',
  'Résidence de 3 mois à Sablons (Isère) pour artistes plasticiens émergents. Atelier, logement et bourse 1500€/mois.',
  'Fondation Albert Gleizes', 'fondation-gleizes',
  'residence',
  ARRAY['arts_visuels', 'arts_plastiques'],
  ARRAY['individuel', 'emergent'],
  'regional', 'FR-ARA',
  1500, 4500,
  '2026-05-15 23:59:00+02',
  'https://moly-sabata.com/residences',
  'demo-moly-sabata-2026', 0.92),

('aide-creation-drac-grand-est-2026',
  'Aide à la création — Théâtre DRAC Grand Est',
  'Subvention d''aide à la création théâtrale pour compagnies professionnelles implantées en Grand Est. Budget max 30 000€ par projet.',
  'DRAC Grand Est', 'drac-grand-est',
  'subvention',
  ARRAY['theatre', 'spectacle_vivant'],
  ARRAY['compagnie', 'association'],
  'regional', 'FR-GES',
  5000, 30000,
  '2026-05-02 23:59:00+02',
  'https://www.culture.gouv.fr/regions/drac-grand-est/aides/theatre',
  'demo-drac-ge-theatre-2026', 0.88),

('bourse-adagp-emergence-2026',
  'Bourse ADAGP Émergence — Arts visuels',
  'Bourse de soutien aux jeunes artistes plasticiens en début de carrière. Montant 5000€, 10 lauréats par an.',
  'ADAGP', 'adagp',
  'bourse',
  ARRAY['arts_visuels', 'arts_plastiques', 'photographie'],
  ARRAY['individuel', 'emergent'],
  'national', NULL,
  5000, 5000,
  '2026-06-10 23:59:00+02',
  'https://www.adagp.fr/fr/bourses/emergence',
  'demo-adagp-emergence-2026', 0.94),

('residence-kujoyama-2027',
  'Villa Kujoyama — Résidence Kyoto 2027',
  'Résidence de 4 à 6 mois à Kyoto pour artistes confirmés. Toutes disciplines. Dotation complète (voyage + logement + production).',
  'Institut français', 'institut-francais',
  'residence',
  ARRAY['arts_visuels', 'theatre', 'danse', 'musique', 'litterature', 'transdisciplinaire'],
  ARRAY['individuel', 'etabli'],
  'international', 'JP',
  NULL, NULL,
  '2026-04-30 23:59:00+02',
  'https://www.villakujoyama.jp/candidater',
  'demo-kujoyama-2027', 0.96),

('prix-coal-art-ecologie-2026',
  'Prix COAL Art & Écologie 2026',
  'Prix annuel récompensant un·e artiste pour un projet en lien avec les enjeux écologiques. Dotation 10 000€ + exposition.',
  'COAL', 'coal',
  'prix',
  ARRAY['arts_visuels', 'transdisciplinaire'],
  ARRAY['individuel'],
  'national', NULL,
  10000, 10000,
  '2026-09-15 23:59:00+02',
  'https://www.projetcoal.org/coal/prix-coal/',
  'demo-prix-coal-2026', 0.91),

('residence-fnagp-2026',
  'Résidence FNAGP — Maison des Artistes',
  'Résidence d''atelier à Nogent-sur-Marne, 12 mois, pour artistes plasticiens ou auteurs/illustrateurs.',
  'FNAGP', 'fnagp',
  'residence',
  ARRAY['arts_visuels', 'arts_plastiques', 'litterature'],
  ARRAY['individuel'],
  'regional', 'FR-IDF',
  NULL, NULL,
  '2026-05-31 23:59:00+02',
  'https://www.fnagp.fr/residences',
  'demo-fnagp-2026', 0.89),

('fondation-carasso-composer-2026',
  'Fondation Carasso — Programme Composer les savoirs',
  'Soutien à des projets artistiques contemporains explorant les liens entre création et savoirs. Budget 30 000 à 80 000€.',
  'Fondation Carasso', 'fondation-carasso',
  'subvention',
  ARRAY['transdisciplinaire', 'arts_visuels', 'spectacle_vivant'],
  ARRAY['collectif', 'association', 'compagnie'],
  'national', NULL,
  30000, 80000,
  '2026-07-01 23:59:00+02',
  'https://www.fondationcarasso.org/fr/appels/composer-savoirs',
  'demo-carasso-composer-2026', 0.93)

ON CONFLICT (slug) DO NOTHING;

END $demo_seed$;
