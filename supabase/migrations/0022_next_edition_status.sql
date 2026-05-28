-- 0022_next_edition_status.sql
-- Flag éditorial pour les opps en transition entre cycles : la dernière
-- édition est connue (modalités, dates), la prochaine est annoncée mais
-- ses détails ne sont pas encore publiés.
--
-- Usage UI : un bandeau « Prochaine édition : modalités pas encore
-- publiées. Données affichées issues de la dernière session connue. »
-- est rendu au-dessus des sections conditions/calendrier/dossier de
-- la fiche, pour que l'utilisateur ne se trompe pas sur la fraîcheur.
--
-- Cas typiques (review 2026-05-04) :
-- - Le Groupe Ouest workshops : modalités publiées par session, page
--   actualités centralise les dates mais pas les pièces
-- - Moulin d'Andé Résidence Francophone : 2026 closed (lauréats picked),
--   2027 dates connues, modalités à venir
-- - SCAM Bourses Albert Londres : cycle 2025 clos, 2026 à confirmer

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS next_edition_status text
    CHECK (next_edition_status IS NULL OR next_edition_status IN ('open', 'awaiting_details'));

COMMENT ON COLUMN opportunities.next_edition_status IS
  'Statut éditorial de la prochaine édition. NULL = cycle ouvert avec toutes les infos publiées (cas par défaut). ''awaiting_details'' = la prochaine édition est annoncée (parfois en dates) mais les modalités/pièces ne sont pas encore publiées ; l''UI affiche un bandeau d''alerte. Le placeholder ''open'' n''est pas utilisé en pratique mais est valide pour un futur usage explicite.';
