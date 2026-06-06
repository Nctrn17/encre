-- ==========================================================================
-- Seed des sources initiales
-- 10 sources pilotes pour MVP (résidences toutes disciplines France)
-- ==========================================================================

INSERT INTO sources (slug, name, kind, config) VALUES

  -- APIs officielles
  ('data-culture-gouv', 'data.culture.gouv.fr — API Opendatasoft', 'api',
    '{"base_url":"https://data.culture.gouv.fr","dataset":"licences-spectacles","fetch_limit":100}'::jsonb),

  ('data-gouv-culture', 'data.gouv.fr — thématique Culture', 'api',
    '{"base_url":"https://www.data.gouv.fr/api/1","topic":"culture-et-communication"}'::jsonb),

  -- Opérateurs publics
  ('cnap-residences', 'CNAP — Résidences arts visuels', 'html',
    '{"url":"https://www.cnap.fr/residences","selector":".news-item"}'::jsonb),

  ('artcena-appels', 'ARTCENA — Annuaire appels à candidatures', 'html',
    '{"url":"https://www.artcena.fr/actualites/appels-candidatures","selector":"article.news"}'::jsonb),

  ('arts-en-residence', 'Arts en résidence — Réseau national', 'html',
    '{"url":"https://www.artsenresidence.fr/residences","selector":".residency-card"}'::jsonb),

  -- DRAC (pilote : Grand Est, Hauts-de-France, Auvergne-Rhône-Alpes)
  ('drac-grand-est', 'DRAC Grand Est — Appels à projets', 'rss',
    '{"url":"https://www.culture.gouv.fr/regions/drac-grand-est/feed","filter_keywords":["appel","résidence","aide"]}'::jsonb),

  ('drac-hauts-de-france', 'DRAC Hauts-de-France — Appels à projets', 'html',
    '{"url":"https://www.culture.gouv.fr/regions/drac-hauts-de-france/appels-a-projets"}'::jsonb),

  ('drac-ara', 'DRAC Auvergne-Rhône-Alpes — Aides', 'html',
    '{"url":"https://www.culture.gouv.fr/regions/drac-auvergne-rhone-alpes/aides"}'::jsonb),

  -- Fondations privées
  ('fondation-france-culture', 'Fondation de France — Culture', 'html',
    '{"url":"https://www.fondationdefrance.org/fr/appels-a-projets","filter_keywords":["culture","art","résidence"]}'::jsonb),

  ('fondation-carasso', 'Fondation Carasso — Création contemporaine', 'html',
    '{"url":"https://www.fondationcarasso.org/fr/nos-activites/creation-contemporaine/","selector":"article"}'::jsonb),

  -- Canal manuel (admin ajoute à la main depuis dashboard)
  ('manual-admin', 'Soumissions admin (dashboard)', 'manual',
    '{}'::jsonb),

  -- Canal email (webhook Resend inbound, v2)
  ('email-forward', 'Emails transférés (v2)', 'email',
    '{"inbox":"submit@agreg-culture.fr"}'::jsonb)

ON CONFLICT (slug) DO NOTHING;

-- Désactiver le canal email par défaut (pas encore implémenté)
UPDATE sources SET is_active = false WHERE slug = 'email-forward';
