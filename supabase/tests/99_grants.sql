-- Privilegi di tabella. Su Supabase li impostano i default privileges del
-- progetto; qui li rendiamo espliciti perche' la RLS agisce DOPO i GRANT:
-- senza questi, i test fallirebbero per il motivo sbagliato.
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on
  public.profiles, public.user_song_progress, public.user_achievements,
  public.user_favorite_songs to authenticated;
grant insert on public.practice_sessions to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
