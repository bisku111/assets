-- =====================================================================
-- Test della Row Level Security.
--
-- Verifica che le policy facciano quello che dicono. Un test che passa
-- perche' "la query non da' errore" non serve a niente: qui si controlla
-- il NUMERO di righe che ogni ruolo riesce a vedere, e che le scritture
-- vietate falliscano davvero.
--
-- Esecuzione: ./scripts/test-db.sh
-- =====================================================================

\set ON_ERROR_STOP on
set client_min_messages to notice;

-- ---------- Helper: impersona un utente come fa PostgREST -------------
create or replace function public.test_login(p_uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, false);
  execute 'set role authenticated';
end $$;

create or replace function public.test_logout_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'set role anon';
end $$;

create or replace function public.test_admin()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', false);
end $$;

-- =====================================================================
-- Dati di prova (creati come amministratore)
-- =====================================================================
select public.test_admin();

delete from auth.users;
delete from public.songs;
delete from public.artists;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'anna@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bruno@example.com');

insert into public.artists (id, slug, name) values
  ('aaaa1111-0000-0000-0000-000000000001', 'test-artist', 'Artista di prova');

insert into public.songs
  (id, slug, artist_id, title, bpm, key_signature, duration_ms, base_difficulty,
   is_free, is_published, license_status, license_owner, license_end_date)
values
  ('bbbb1111-0000-0000-0000-000000000001', 'gratis',    'aaaa1111-0000-0000-0000-000000000001',
   'Brano gratuito',       100, 'C', 60000, 'beginner', true,  true,  'original', 'Maestro', null),
  ('bbbb1111-0000-0000-0000-000000000002', 'premium',   'aaaa1111-0000-0000-0000-000000000001',
   'Brano premium',        100, 'C', 60000, 'easy',     false, true,  'original', 'Maestro', null),
  ('bbbb1111-0000-0000-0000-000000000003', 'scaduto',   'aaaa1111-0000-0000-0000-000000000001',
   'Licenza scaduta',      100, 'C', 60000, 'easy',     true,  true,  'cleared',  'Editore', current_date - 1),
  ('bbbb1111-0000-0000-0000-000000000004', 'bozza',     'aaaa1111-0000-0000-0000-000000000001',
   'Non pubblicato',       100, 'C', 60000, 'easy',     true,  false, 'original', 'Maestro', null),
  ('bbbb1111-0000-0000-0000-000000000005', 'in-attesa', 'aaaa1111-0000-0000-0000-000000000001',
   'In attesa di licenza', 100, 'C', 60000, 'easy',     true,  true,  'pending',  null,      null);

insert into public.song_arrangements (id, song_id, difficulty) values
  ('cccc1111-0000-0000-0000-000000000001', 'bbbb1111-0000-0000-0000-000000000001', 'beginner'),
  ('cccc1111-0000-0000-0000-000000000002', 'bbbb1111-0000-0000-0000-000000000002', 'easy');

insert into public.song_notes (arrangement_id, hand, midi, start_ms, duration_ms) values
  ('cccc1111-0000-0000-0000-000000000001', 'right', 60, 0, 500),
  ('cccc1111-0000-0000-0000-000000000001', 'right', 62, 500, 500),
  ('cccc1111-0000-0000-0000-000000000002', 'right', 64, 0, 500);

-- =====================================================================
do $$
declare n bigint; ok boolean;
begin
  -- 1. Il profilo viene creato automaticamente alla registrazione
  select count(*) into n from public.profiles
   where id = '11111111-1111-1111-1111-111111111111';
  assert n = 1, '1. il trigger non ha creato il profilo';

  -- 2. Catalogo: solo i brani servibili escono dal database
  perform public.test_logout_anon();
  select count(*) into n from public.songs;
  assert n = 2, format('2. anon vede %s brani invece di 2 (gratis + premium)', n);

  select count(*) into n from public.songs where slug in ('scaduto','bozza','in-attesa');
  assert n = 0, '2b. un brano scaduto, non pubblicato o non licenziato e uscito dal database';

  -- 3. Note: l'utente senza abbonamento vede solo quelle del brano free
  perform public.test_login('11111111-1111-1111-1111-111111111111');
  select count(*) into n from public.song_notes;
  assert n = 2, format('3. utente free vede %s note invece di 2', n);

  select public.has_active_subscription() into ok;
  assert ok = false, '3b. utente senza abbonamento risulta abbonato';

  -- 4. Con abbonamento attivo compaiono anche le note premium
  perform public.test_admin();
  insert into public.subscriptions (user_id, plan, status, current_period_end)
  values ('11111111-1111-1111-1111-111111111111', 'premium_monthly', 'active', now() + interval '30 days');

  perform public.test_login('11111111-1111-1111-1111-111111111111');
  select count(*) into n from public.song_notes;
  assert n = 3, format('4. utente premium vede %s note invece di 3', n);

  -- Il premium e' per utente, non globale.
  perform public.test_login('22222222-2222-2222-2222-222222222222');
  select count(*) into n from public.song_notes;
  assert n = 2, format('4b. il premium di Anna ha sbloccato le note di Bruno (%s)', n);

  -- 5. Isolamento dei dati personali
  perform public.test_login('11111111-1111-1111-1111-111111111111');
  select count(*) into n from public.profiles;
  assert n = 1, format('5. un utente vede %s profili invece del solo suo', n);

  update public.profiles set display_name = 'Hacker'
   where id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  assert n = 0, '5b. un utente ha modificato il profilo di un altro';

  -- 6. Sessioni di studio: si inseriscono solo le proprie
  insert into public.practice_sessions
    (user_id, song_id, arrangement_id, mode, input, rate_pct, duration_ms, score)
  values ('11111111-1111-1111-1111-111111111111', 'bbbb1111-0000-0000-0000-000000000001',
          'cccc1111-0000-0000-0000-000000000001', 'practice', 'virtual_keyboard', 70, 60000, 88);

  begin
    insert into public.practice_sessions (user_id, mode, input, rate_pct, duration_ms)
    values ('22222222-2222-2222-2222-222222222222', 'practice', 'midi', 70, 1000);
    raise exception '6. un utente ha scritto una sessione a nome di un altro';
  exception when insufficient_privilege then null;  -- atteso
  end;

  -- 7. Il client non puo' regalarsi il premium
  begin
    insert into public.subscriptions (user_id, plan, status)
    values ('11111111-1111-1111-1111-111111111111', 'premium_yearly', 'active');
    raise exception '7. un utente si e creato un abbonamento da solo';
  exception when insufficient_privilege then null;
  end;

  -- 8. Il client non puo' scrivere nel catalogo
  begin
    insert into public.songs (slug, artist_id, title, bpm, key_signature, duration_ms, base_difficulty)
    values ('pirata', 'aaaa1111-0000-0000-0000-000000000001', 'Brano caricato dal client',
            120, 'C', 1000, 'easy');
    raise exception '8. un utente ha inserito un brano nel catalogo';
  exception when insufficient_privilege then null;
  end;

  -- 9. Statistiche e striscia
  select total_sessions into n from public.user_practice_stats(30);
  assert n = 1, format('9. le statistiche riportano %s sessioni invece di 1', n);

  select streak_current into n from public.recalculate_streak();
  assert n = 1, format('9b. striscia calcolata %s invece di 1', n);

  perform public.test_admin();
  raise notice 'TUTTI I TEST RLS SUPERATI';
end $$;

-- ---------------------------------------------------------------------
-- 10. Nessuna tabella pubblica senza RLS. Controllo strutturale: vale
--     anche per le tabelle che verranno aggiunte in futuro.
-- ---------------------------------------------------------------------
do $$
declare v_missing text;
begin
  select string_agg(c.relname, ', ') into v_missing
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  assert v_missing is null, format('10. tabelle senza RLS: %s', v_missing);
  raise notice 'RLS attiva su tutte le tabelle di public';
end $$;

-- ---------------------------------------------------------------------
-- 11. Nessuna policy permissiva (`using (true)`) sui dati personali.
-- ---------------------------------------------------------------------
do $$
declare v_bad text;
begin
  select string_agg(format('%s.%s', tablename, policyname), ', ') into v_bad
    from pg_policies
   where schemaname = 'public'
     and tablename in ('profiles','user_song_progress','practice_sessions',
                       'user_achievements','user_favorite_songs','subscriptions','payments')
     and coalesce(qual, 'true') = 'true' and coalesce(with_check, 'true') = 'true';
  assert v_bad is null, format('11. policy permissive su dati personali: %s', v_bad);
  raise notice 'Nessuna policy permissiva sui dati personali';
end $$;
