-- Broadcast waitlist : envoi hebdo des nouvelles opportunités publiées aux
-- adresses inscrites sans compte/veille.
--
-- Contexte : jusqu'ici la waitlist était un cul-de-sac (un seul mail de
-- bienvenue, puis plus rien). On la branche sur un envoi récurrent. Pour rester
-- RGPD-propre, chaque inscrit dispose d'un jeton de désinscription stable et
-- d'un horodatage de désabonnement.
--
--   - last_broadcast_at : borne « nouveau depuis » du dernier envoi broadcast.
--                         NULL = jamais envoyé → on prend created_at comme borne
--                         (un nouvel inscrit ne reçoit que ce qui est publié
--                         APRÈS son inscription, jamais un rattrapage massif).
--   - unsubscribed_at   : NULL = abonné. Renseigné = désinscrit (exclu des envois).
--   - unsub_token       : jeton opaque pour le lien de désinscription + l'en-tête
--                         List-Unsubscribe (one-click RFC 8058). Stable par adresse.

alter table public.waitlist
  add column if not exists last_broadcast_at timestamptz,
  add column if not exists unsubscribed_at  timestamptz,
  add column if not exists unsub_token      uuid not null default gen_random_uuid();

-- Lookup par jeton lors de la désinscription (one-click).
create unique index if not exists waitlist_unsub_token_idx
  on public.waitlist (unsub_token);

-- Sélection des destinataires actifs lors d'un cycle broadcast.
create index if not exists waitlist_active_subscribers_idx
  on public.waitlist (last_broadcast_at)
  where unsubscribed_at is null;
