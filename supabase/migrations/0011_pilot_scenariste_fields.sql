-- Migration 0011 - Pilote scénariste : champs d'accessibilité et filtrage
--
-- Cette migration ajoute les 5 champs nécessaires au matcher pour le pilote
-- scénariste/réalisateur hors-réseau. Les champs sont nullable pour permettre
-- un remplissage progressif (par le classifier LLM lors de la reclassif des
-- items existants, puis systématiquement à l'insertion des nouveaux items).
--
-- Rollback possible : oui (DROP COLUMN IF EXISTS pour chaque champ)

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- Champ 1 : hors_reseau_friendly
-- ═══════════════════════════════════════════════════════════════════════════
-- Signal binaire : l'auteur peut-il candidater sans éditeur/producteur/agent ?
-- TRUE = candidature libre auteur seul (ex: GREC, Beaumarchais, Brouillon d'un rêve)
-- FALSE = requis éditeur/producteur/jury fermé (ex: Goncourt, Gan, CNC réécriture)
-- NULL = non renseigné (à retagger)
-- Default FALSE car on préfère faux-négatifs (cacher par défaut)
--   à faux-positifs (promettre de l'accès qui n'existe pas)
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS hors_reseau_friendly boolean DEFAULT false;

COMMENT ON COLUMN opportunities.hors_reseau_friendly IS
  'TRUE si un auteur peut candidater seul (pas d''éditeur/producteur/agent requis). Défaut FALSE par précaution - préfère cacher qu''inventer de l''accès.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Champ 2 : min_films_produits
-- ═══════════════════════════════════════════════════════════════════════════
-- Nombre minimum de films déjà produits/réalisés pour être éligible.
-- 0 = aucun film préalable requis (ex: GREC, Sopadin Junior, CNC Talent)
-- 1 = au moins un court métrage / premier film (ex: Emergence, CNC écriture long)
-- 2 = scénariste/réalisateur avec expérience (ex: Villa Albertine)
-- NULL = non applicable ou non renseigné
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS min_films_produits integer;

COMMENT ON COLUMN opportunities.min_films_produits IS
  'Min films produits/réalisés requis pour candidater. 0 = accessible jamais-filmé. NULL = non applicable.';

-- Contrainte de cohérence : valeurs raisonnables uniquement
ALTER TABLE opportunities
  ADD CONSTRAINT min_films_produits_range
  CHECK (min_films_produits IS NULL OR (min_films_produits >= 0 AND min_films_produits <= 10));

-- ═══════════════════════════════════════════════════════════════════════════
-- Champ 3 : requires_producer
-- ═══════════════════════════════════════════════════════════════════════════
-- Distinct de hors_reseau_friendly : certaines aides sont candidatables par
-- l'auteur en amont mais nécessitent une société de production pour être
-- effectivement décaissées (ex: CNC réécriture, Fondation Gan).
-- À filtrer pour les utilisateurs qui cochent "pas encore de producteur" à l'onboarding.
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS requires_producer boolean DEFAULT false;

COMMENT ON COLUMN opportunities.requires_producer IS
  'TRUE si une société de production doit être attachée au dossier (même si l''auteur peut initier seul). Critère de filtre distinct de hors_reseau_friendly.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Champ 4 : age_max
-- ═══════════════════════════════════════════════════════════════════════════
-- Âge maximal pour candidater (en années). Pour prix "jeune talent" (Sopadin
-- Junior <28, Vocation Bleustein-Blanchet <30, Fénéon <35, etc.).
-- NULL = pas de limite d'âge
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS age_max integer;

COMMENT ON COLUMN opportunities.age_max IS
  'Âge maximum pour candidater. NULL = pas de limite. Utilisé pour filtrer selon l''onboarding (question âge).';

ALTER TABLE opportunities
  ADD CONSTRAINT age_max_range
  CHECK (age_max IS NULL OR (age_max >= 16 AND age_max <= 99));

-- ═══════════════════════════════════════════════════════════════════════════
-- Champ 5 : disciplines_tags (text[])
-- ═══════════════════════════════════════════════════════════════════════════
-- Tags disciplinaires fins pour matcher le pilote scénariste (qui filtre sur
-- ['cinéma', 'audiovisuel', 'scénario', 'documentaire', 'sonore', 'animation',
-- 'web']) vs un pilote littérature (qui filtre sur ['littérature', 'poésie',
-- 'essai', 'traduction']). Plus granulaire que la colonne existante `discipline`.
--
-- Valeurs permises (recommandation, non enforced au niveau DB) :
--   Audiovisuel : 'cinéma', 'audiovisuel', 'scénario', 'documentaire',
--                 'sonore', 'animation', 'web', 'court-métrage', 'série',
--                 'long-métrage', 'doc-sonore'
--   Littérature : 'littérature', 'poésie', 'essai', 'nouvelle', 'traduction',
--                 'jeunesse', 'bd'
--   Scène : 'théâtre', 'danse', 'cirque', 'marionnette', 'rue'
--   Autres : 'arts-visuels', 'photographie', 'musique', 'arts-numériques'
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS disciplines_tags text[] DEFAULT '{}';

COMMENT ON COLUMN opportunities.disciplines_tags IS
  'Tags disciplinaires fins pour matcher pilote-par-pilote. Ex pilote scénariste : [''cinéma'',''audiovisuel'',''scénario'',''documentaire'']. Plus granulaire que `discipline`.';

-- Index GIN pour les requêtes de recouvrement (tags && user_disciplines)
CREATE INDEX IF NOT EXISTS idx_opps_disciplines_tags
  ON opportunities USING GIN (disciplines_tags);

-- Index partiel sur hors_reseau_friendly (boost perf pour le filtre par défaut)
CREATE INDEX IF NOT EXISTS idx_opps_hors_reseau_friendly
  ON opportunities (hors_reseau_friendly)
  WHERE hors_reseau_friendly = true;

-- Index sur age_max pour les filtres jeunes auteurs
CREATE INDEX IF NOT EXISTS idx_opps_age_max
  ON opportunities (age_max)
  WHERE age_max IS NOT NULL;

COMMIT;
