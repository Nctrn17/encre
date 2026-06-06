-- Désactivation de la source `data-culture-gouv`.
--
-- Le scraper interrogeait `https://data.culture.gouv.fr/api/explore/v2.1/catalog/datasets/licences-spectacles/records`
-- qui retourne désormais 404 — le dataset `licences-spectacles` a été supprimé
-- ou renommé sur Opendatasoft (vérifié 2026-05-02 : l'API v2.1 répond bien sur
-- les autres datasets, c'est le slug spécifique qui n'existe plus).
--
-- Au-delà du 404 : data.culture.gouv.fr est une plateforme d'open data
-- statistique (dépenses culturelles, équipements, fréquentation), pas un
-- catalogue d'appels à projets. La source était mal calibrée dès le départ.
-- Les vraies sources AAP du ministère sont déjà couvertes via culture-gouv
-- (catalogue-des-demarches-et-subventions) + CNL + CNC + CNM + DRAC RSS.
--
-- On désactive proprement (is_active = false) plutôt que de supprimer la
-- ligne, pour conserver la FK historique avec les raw_items déjà ingérés.
-- Le code du scraper `scrapers/sources/data-culture-gouv.ts` reste en place
-- comme référence pour un éventuel pivot futur vers un autre dataset.

UPDATE sources
SET is_active = false
WHERE slug = 'data-culture-gouv';
