-- =====================================================================
-- 0002 — Catalogo musicale
--
-- Gerarchia:  artists → songs → song_arrangements → song_sections
--                                                 → song_notes
--
-- Un "arrangiamento" e' la stessa canzone scritta per un livello di
-- difficolta' diverso: cambiano le note, non il brano. E' il motivo per
-- cui sezioni e note pendono dall'arrangiamento e non dal brano.
-- =====================================================================

create table if not exists public.difficulty_levels (
  key              public.difficulty_key primary key,
  label_it         text not null,
  description_it   text not null,
  stars            smallint not null check (stars between 1 and 5),
  sort_order       smallint not null,
  requires_premium boolean not null default false
);

create table if not exists public.artists (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  name           text not null,
  bio_it         text,
  image_url      text,
  country        text not null default 'IT',
  -- Un artista senza brani servibili resta visibile come "in arrivo":
  -- e' cosi' che si dimostra il posto per il repertorio ufficiale senza
  -- inserire materiale non licenziato.
  is_placeholder boolean not null default false,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.songs (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  artist_id       uuid not null references public.artists (id) on delete restrict,
  title           text not null,
  subtitle        text,
  cover_url       text,
  bpm             numeric(6,2) not null check (bpm > 20 and bpm < 300),
  key_signature   text not null,
  time_sig_num    smallint not null default 4 check (time_sig_num between 1 and 16),
  time_sig_den    smallint not null default 4 check (time_sig_den in (2,4,8,16)),
  duration_ms     integer not null check (duration_ms > 0),
  base_difficulty public.difficulty_key not null references public.difficulty_levels (key),
  is_free         boolean not null default false,
  is_published    boolean not null default false,
  tags            text[] not null default '{}',
  popularity      integer not null default 0,

  -- ---- Licenza (richiesta esplicitamente dalla specifica) -----------
  license_status     public.license_status not null default 'pending',
  license_owner      text,
  license_type       text,
  territory          text not null default 'WW',
  license_start_date date,
  license_end_date   date,
  -- Provenienza del contenuto: serve all'audit, non alla UI.
  content_origin     text not null default 'original',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint songs_license_window check (
    license_end_date is null or license_start_date is null
    or license_end_date >= license_start_date
  ),
  -- Un brano dichiarato licenziato deve dire da chi.
  constraint songs_cleared_needs_owner check (
    license_status <> 'cleared' or license_owner is not null
  )
);

create index if not exists songs_artist_idx     on public.songs (artist_id);
create index if not exists songs_popularity_idx on public.songs (popularity desc);
create index if not exists songs_title_trgm_idx on public.songs using gin (title gin_trgm_ops);

create table if not exists public.song_arrangements (
  id         uuid primary key default gen_random_uuid(),
  song_id    uuid not null references public.songs (id) on delete cascade,
  difficulty public.difficulty_key not null references public.difficulty_levels (key),
  hands      public.hand[] not null default '{right,left}',
  -- Tempo consigliato di partenza: 0.5 = meta' velocita'.
  suggested_start_rate numeric(3,2) not null default 0.70
    check (suggested_start_rate between 0.25 and 1.00),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (song_id, difficulty)
);

create table if not exists public.song_sections (
  id               uuid primary key default gen_random_uuid(),
  arrangement_id   uuid not null references public.song_arrangements (id) on delete cascade,
  kind             public.section_kind not null,
  name_it          text not null,
  start_ms         integer not null check (start_ms >= 0),
  end_ms           integer not null,
  sort_order       smallint not null,
  loop_recommended boolean not null default false,
  constraint song_sections_range check (end_ms > start_ms),
  unique (arrangement_id, sort_order)
);

create index if not exists song_sections_arrangement_idx
  on public.song_sections (arrangement_id, sort_order);

create table if not exists public.song_notes (
  id             bigint generated always as identity primary key,
  arrangement_id uuid not null references public.song_arrangements (id) on delete cascade,
  section_id     uuid references public.song_sections (id) on delete set null,
  hand           public.hand not null,
  midi           smallint not null check (midi between 21 and 108),
  start_ms       integer not null check (start_ms >= 0),
  duration_ms    integer not null check (duration_ms > 0),
  velocity       numeric(3,2) not null default 0.80 check (velocity between 0 and 1),
  finger         smallint check (finger between 1 and 5),
  is_sustained   boolean not null default false
);

-- Il player legge sempre "le note di un arrangiamento in ordine di
-- tempo": questo indice e' esattamente quella query.
create index if not exists song_notes_playback_idx
  on public.song_notes (arrangement_id, start_ms);

create table if not exists public.song_chords (
  id             bigint generated always as identity primary key,
  arrangement_id uuid not null references public.song_arrangements (id) on delete cascade,
  symbol         text not null,
  start_ms       integer not null check (start_ms >= 0),
  duration_ms    integer not null check (duration_ms > 0)
);

create index if not exists song_chords_playback_idx
  on public.song_chords (arrangement_id, start_ms);

drop trigger if exists artists_touch on public.artists;
create trigger artists_touch before update on public.artists
  for each row execute function public.touch_updated_at();

drop trigger if exists songs_touch on public.songs;
create trigger songs_touch before update on public.songs
  for each row execute function public.touch_updated_at();

drop trigger if exists song_arrangements_touch on public.song_arrangements;
create trigger song_arrangements_touch before update on public.song_arrangements
  for each row execute function public.touch_updated_at();
