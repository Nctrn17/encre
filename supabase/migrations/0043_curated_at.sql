-- Marqueur de revue humaine en curation.
--
-- Problème : « À traiter maintenant » recalcule ses files en direct selon l'état
-- de la fiche, sans notion de « déjà traité ». Une fiche revue (Sauvegarder /
-- Marquer OK) revenait quand même dans les files « molles » (nouveauté de la
-- semaine, sections manquantes, éligibilité), car ces files ne dépendent pas
-- d'une action qui change la propriété qu'elles testent.
--
-- curated_at = horodatage de la dernière revue humaine. Les files molles
-- excluent désormais les fiches curées. Les files « dures » (à publier, à
-- valider, expirée, attente) gardent leur logique propre.

alter table public.opportunities
  add column if not exists curated_at timestamptz;

comment on column public.opportunities.curated_at is
  'Derniere revue humaine en curation (Sauvegarder / Marquer OK / action rapide). Sort la fiche des files molles une fois traitee.';
