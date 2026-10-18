-- =====================================================================
-- 0006 — Statistiche aggregate
--
-- Calcolate in SQL e non nel client: le stesse cifre devono comparire
-- identiche su telefono, tablet e web.
-- =====================================================================

create or replace function public.user_practice_stats(p_days integer default 30)
returns table (
  total_sessions      bigint,
  total_practice_ms   bigint,
  total_notes_correct bigint,
  total_notes_wrong   bigint,
  avg_score           numeric,
  best_score          smallint,
  distinct_songs      bigint,
  active_days         bigint
)
language sql stable security invoker set search_path = public as $$
  select
    count(*)::bigint,
    coalesce(sum(ps.duration_ms), 0)::bigint,
    coalesce(sum(ps.notes_correct), 0)::bigint,
    coalesce(sum(ps.notes_wrong), 0)::bigint,
    round(coalesce(avg(ps.score), 0), 1),
    coalesce(max(ps.score), 0)::smallint,
    count(distinct ps.song_id)::bigint,
    count(distinct ps.started_at::date)::bigint
  from public.practice_sessions ps
  where ps.user_id = (select auth.uid())
    and ps.started_at >= now() - make_interval(days => greatest(p_days, 1));
$$;

grant execute on function public.user_practice_stats(integer) to authenticated;

-- Ricalcola la striscia dai FATTI (le sessioni), non da un contatore che
-- puo' desincronizzarsi. Idempotente: si puo' chiamare a ogni avvio.
create or replace function public.recalculate_streak()
returns table (streak_current smallint, streak_longest smallint)
language plpgsql security invoker set search_path = public as $$
declare
  v_uid     uuid := (select auth.uid());
  v_day     date;
  v_prev    date := null;
  v_run     integer := 0;
  v_longest integer := 0;
  v_current integer := 0;
  v_today   date := current_date;
begin
  if v_uid is null then
    raise exception 'utente non autenticato';
  end if;

  for v_day in
    select distinct started_at::date as d from public.practice_sessions
     where user_id = v_uid order by d
  loop
    if v_prev is not null and v_day = v_prev + 1 then
      v_run := v_run + 1;
    else
      v_run := 1;
    end if;
    v_longest := greatest(v_longest, v_run);
    v_prev := v_day;
  end loop;

  -- La striscia corrente vale solo se l'ultimo giorno e' oggi o ieri.
  if v_prev is not null and v_prev >= v_today - 1 then
    v_current := v_run;
  else
    v_current := 0;
  end if;

  update public.profiles p
     set streak_current = v_current,
         streak_longest = greatest(v_longest, p.streak_longest),
         last_practice_date = v_prev
   where p.id = v_uid;

  return query select v_current::smallint, greatest(v_longest, 0)::smallint;
end;
$$;

grant execute on function public.recalculate_streak() to authenticated;
