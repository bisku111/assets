-- =====================================================================
-- 0003 — Utenti, progressi, gamification, abbonamenti
--
-- Gli account vivono in auth.users (Supabase Auth). Qui c'e' tutto il
-- resto: profilo, progressi, sessioni, medaglie, abbonamenti.
-- =====================================================================

create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text not null default 'Pianista',
  avatar_url          text,
  skill_level         public.skill_level not null default 'never_played',
  daily_goal_minutes  smallint not null default 10 check (daily_goal_minutes between 5 and 240),
  favorite_artist_ids uuid[] not null default '{}',
  favorite_genres     text[] not null default '{}',

  -- Gamification
  xp                 integer not null default 0 check (xp >= 0),
  level              smallint not null default 1 check (level >= 1),
  streak_current     smallint not null default 0 check (streak_current >= 0),
  streak_longest     smallint not null default 0 check (streak_longest >= 0),
  last_practice_date date,
  total_practice_ms  bigint not null default 0 check (total_practice_ms >= 0),

  -- Calibrazione della latenza: dipende dal dispositivo dell'utente,
  -- quindi va salvata con l'utente.
  input_latency_ms smallint not null default 0 check (input_latency_ms between -500 and 500),
  preferred_input  public.input_source not null default 'virtual_keyboard',

  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Creazione automatica del profilo alla registrazione: senza questo, un
-- utente autenticato senza profilo manderebbe in errore mezza app.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(coalesce(new.email, 'pianista@maestro'), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Progressi per brano
-- ---------------------------------------------------------------------
create table if not exists public.user_song_progress (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  song_id        uuid not null references public.songs (id) on delete cascade,
  arrangement_id uuid not null references public.song_arrangements (id) on delete cascade,
  best_score     smallint not null default 0 check (best_score between 0 and 100),
  best_accuracy  numeric(5,2) not null default 0 check (best_accuracy between 0 and 100),
  stars          smallint not null default 0 check (stars between 0 and 5),
  completion_pct smallint not null default 0 check (completion_pct between 0 and 100),
  -- Velocita' raggiunta nella progressione 50→100%.
  current_rate_pct smallint not null default 50 check (current_rate_pct between 25 and 100),
  -- Sezioni gia' superate: {"<section_id>": {"clearedRatePct": 80, ...}}
  section_state  jsonb not null default '{}'::jsonb,
  attempts       integer not null default 0 check (attempts >= 0),
  total_practice_ms bigint not null default 0 check (total_practice_ms >= 0),
  last_practiced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, arrangement_id)
);

create index if not exists user_song_progress_recent_idx
  on public.user_song_progress (user_id, last_practiced_at desc nulls last);

drop trigger if exists user_song_progress_touch on public.user_song_progress;
create trigger user_song_progress_touch before update on public.user_song_progress
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Sessioni di studio: una riga per esercizio concluso.
-- E' la fonte di verita' per streak, minuti suonati e statistiche.
-- ---------------------------------------------------------------------
create table if not exists public.practice_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  song_id        uuid references public.songs (id) on delete set null,
  arrangement_id uuid references public.song_arrangements (id) on delete set null,
  section_id     uuid references public.song_sections (id) on delete set null,
  mode           public.practice_mode not null,
  input          public.input_source not null,
  rate_pct       smallint not null check (rate_pct between 25 and 100),

  started_at  timestamptz not null default now(),
  duration_ms integer not null check (duration_ms >= 0),

  notes_expected integer not null default 0 check (notes_expected >= 0),
  notes_correct  integer not null default 0 check (notes_correct >= 0),
  notes_wrong    integer not null default 0 check (notes_wrong >= 0),
  notes_missed   integer not null default 0 check (notes_missed >= 0),

  accuracy_pct numeric(5,2) not null default 0 check (accuracy_pct between 0 and 100),
  rhythm_pct   numeric(5,2) not null default 0 check (rhythm_pct between 0 and 100),
  timing_pct   numeric(5,2) not null default 0 check (timing_pct between 0 and 100),
  score        smallint not null default 0 check (score between 0 and 100),
  completed    boolean not null default false,
  created_at   timestamptz not null default now(),

  constraint practice_sessions_note_totals check (notes_correct <= notes_expected)
);

create index if not exists practice_sessions_user_time_idx
  on public.practice_sessions (user_id, started_at desc);

-- ---------------------------------------------------------------------
-- Medaglie
-- ---------------------------------------------------------------------
create table if not exists public.achievements (
  key            text primary key,
  title_it       text not null,
  description_it text not null,
  icon           text not null default 'medal',
  category       text not null default 'general',
  threshold      integer not null default 1 check (threshold >= 1),
  xp_reward      integer not null default 50 check (xp_reward >= 0),
  sort_order     smallint not null default 0
);

create table if not exists public.user_achievements (
  user_id         uuid not null references auth.users (id) on delete cascade,
  achievement_key text not null references public.achievements (key) on delete cascade,
  progress        integer not null default 0 check (progress >= 0),
  unlocked_at     timestamptz,
  primary key (user_id, achievement_key)
);

create table if not exists public.user_favorite_songs (
  user_id    uuid not null references auth.users (id) on delete cascade,
  song_id    uuid not null references public.songs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);

-- ---------------------------------------------------------------------
-- Abbonamenti e pagamenti
--
-- Nessun pagamento reale e' implementato nell'MVP. Queste tabelle sono
-- scrivibili SOLO dal service_role: le riempira' la Edge Function che
-- ricevera' i webhook dello store. Un client non puo' regalarsi il premium.
-- ---------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  plan                  public.subscription_plan not null default 'free',
  status                public.subscription_status not null default 'expired',
  store                 text not null default 'none',   -- app_store | play_store | stripe
  store_subscription_id text,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  trial_end             timestamptz,
  cancel_at_period_end  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store, store_subscription_id)
);

create index if not exists subscriptions_user_idx on public.subscriptions (user_id, status);

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

create table if not exists public.payments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  subscription_id      uuid references public.subscriptions (id) on delete set null,
  amount_cents         integer not null check (amount_cents >= 0),
  currency             char(3) not null default 'EUR',
  status               public.payment_status not null default 'pending',
  store                text not null default 'none',
  store_transaction_id text unique,
  processed_at         timestamptz,
  created_at           timestamptz not null default now()
);

create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
