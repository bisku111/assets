-- =====================================================================
-- 0004 — Row Level Security
--
-- Principi applicati:
--  1. RLS attiva su OGNI tabella, senza eccezioni.
--  2. Nessuna policy `using (true)` sui dati personali.
--  3. Il gating premium e' una funzione SQL: il client non puo'
--     aggirarlo cambiando una variabile o chiamando un altro endpoint.
--  4. Le tabelle di contenuto e di pagamento sono in SOLA LETTURA per i
--     client. Le scritture passano dal service_role, che salta la RLS.
-- =====================================================================

alter table public.difficulty_levels   enable row level security;
alter table public.artists             enable row level security;
alter table public.songs               enable row level security;
alter table public.song_arrangements   enable row level security;
alter table public.song_sections       enable row level security;
alter table public.song_notes          enable row level security;
alter table public.song_chords         enable row level security;
alter table public.profiles            enable row level security;
alter table public.user_song_progress  enable row level security;
alter table public.practice_sessions   enable row level security;
alter table public.achievements        enable row level security;
alter table public.user_achievements   enable row level security;
alter table public.user_favorite_songs enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.payments            enable row level security;

-- ---------------------------------------------------------------------
-- Funzioni di autorizzazione
-- ---------------------------------------------------------------------

-- Un brano e' "servibile" solo se pubblicato e con licenza valida ORA.
-- Chiamata dentro le policy: nessun brano scaduto puo' uscire dal
-- database, nemmeno per un errore del client.
create or replace function public.is_song_servable(p_song public.songs)
returns boolean language sql stable as $$
  select p_song.is_published
     and p_song.license_status in ('original','public_domain','cleared')
     and (p_song.license_start_date is null or p_song.license_start_date <= current_date)
     and (p_song.license_end_date   is null or p_song.license_end_date   >= current_date);
$$;

-- Abbonamento attivo dell'utente corrente.
create or replace function public.has_active_subscription()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions s
     where s.user_id = auth.uid()
       and s.status in ('active','trialing')
       and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

-- Puo' l'utente corrente ricevere le NOTE di questo brano?
-- Il brano resta visibile in catalogo anche se premium: quello che il
-- gating protegge e' il contenuto musicale, non la vetrina.
create or replace function public.can_access_song(p_song_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.songs s
     where s.id = p_song_id
       and public.is_song_servable(s)
       and (s.is_free or public.has_active_subscription())
  );
$$;

revoke all on function public.has_active_subscription() from public;
revoke all on function public.can_access_song(uuid) from public;
grant execute on function public.has_active_subscription() to authenticated;
grant execute on function public.can_access_song(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Contenuti — lettura pubblica ma filtrata, scrittura vietata ai client
-- ---------------------------------------------------------------------

drop policy if exists difficulty_levels_read on public.difficulty_levels;
create policy difficulty_levels_read on public.difficulty_levels
  for select to anon, authenticated using (true);   -- dati di riferimento, non personali

drop policy if exists artists_read on public.artists;
create policy artists_read on public.artists
  for select to anon, authenticated using (true);

drop policy if exists songs_read on public.songs;
create policy songs_read on public.songs
  for select to anon, authenticated using (public.is_song_servable(songs));

drop policy if exists arrangements_read on public.song_arrangements;
create policy arrangements_read on public.song_arrangements
  for select to anon, authenticated
  using (exists (
    select 1 from public.songs s
     where s.id = song_arrangements.song_id and public.is_song_servable(s)
  ));

-- Le sezioni sono la "mappa" del brano: utili anche in anteprima.
drop policy if exists sections_read on public.song_sections;
create policy sections_read on public.song_sections
  for select to anon, authenticated
  using (exists (
    select 1 from public.song_arrangements a
      join public.songs s on s.id = a.song_id
     where a.id = song_sections.arrangement_id and public.is_song_servable(s)
  ));

-- Le NOTE sono il contenuto vero: qui scatta il gating premium.
drop policy if exists notes_read on public.song_notes;
create policy notes_read on public.song_notes
  for select to anon, authenticated
  using (exists (
    select 1 from public.song_arrangements a
     where a.id = song_notes.arrangement_id and public.can_access_song(a.song_id)
  ));

drop policy if exists chords_read on public.song_chords;
create policy chords_read on public.song_chords
  for select to anon, authenticated
  using (exists (
    select 1 from public.song_arrangements a
     where a.id = song_chords.arrangement_id and public.can_access_song(a.song_id)
  ));

-- Nessuna policy di INSERT/UPDATE/DELETE sulle tabelle di contenuto: con
-- RLS attiva, l'assenza di policy significa "vietato". Le importazioni di
-- repertorio licenziato girano con service_role.

-- ---------------------------------------------------------------------
-- Dati personali — ognuno vede e scrive solo i propri
-- ---------------------------------------------------------------------

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Volutamente nessuna DELETE: l'account si cancella da auth.users e il
-- profilo segue in cascata.

drop policy if exists progress_rw_own on public.user_song_progress;
create policy progress_rw_own on public.user_song_progress
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists sessions_select_own on public.practice_sessions;
create policy sessions_select_own on public.practice_sessions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists sessions_insert_own on public.practice_sessions;
create policy sessions_insert_own on public.practice_sessions
  for insert to authenticated with check (user_id = (select auth.uid()));

-- Una sessione conclusa e' un fatto storico: non si riscrive e non si
-- cancella, altrimenti le statistiche non varrebbero nulla.

drop policy if exists achievements_read on public.achievements;
create policy achievements_read on public.achievements
  for select to anon, authenticated using (true);

drop policy if exists user_achievements_rw_own on public.user_achievements;
create policy user_achievements_rw_own on public.user_achievements
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists favorites_rw_own on public.user_favorite_songs;
create policy favorites_rw_own on public.user_favorite_songs
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Abbonamenti e pagamenti — lettura del proprio stato, scrittura mai
-- ---------------------------------------------------------------------

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select to authenticated using (user_id = (select auth.uid()));

-- Nessuna policy di scrittura: solo il webhook lato server
-- (service_role) puo' creare o modificare un abbonamento o un pagamento.
