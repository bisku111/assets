-- =====================================================================
-- 0005 — Dati di riferimento (non sono contenuti musicali)
-- =====================================================================

insert into public.difficulty_levels (key, label_it, description_it, stars, sort_order, requires_premium) values
  ('beginner',     'Principiante', 'Solo mano destra, note lunghe, nessuna alterazione.',   1, 1, false),
  ('easy',         'Facile',       'Mano destra completa e bassi semplici sulla sinistra.', 2, 2, false),
  ('intermediate', 'Intermedio',   'Due mani insieme, accordi e ritmo completo.',           3, 3, true),
  ('advanced',     'Avanzato',     'Arrangiamento fedele, salti e diteggiature complesse.', 4, 4, true),
  ('complete',     'Completo',     'Versione integrale, come la esegue un pianista.',       5, 5, true)
on conflict (key) do update
  set label_it = excluded.label_it, description_it = excluded.description_it,
      stars = excluded.stars, sort_order = excluded.sort_order,
      requires_premium = excluded.requires_premium;

insert into public.achievements (key, title_it, description_it, icon, category, threshold, xp_reward, sort_order) values
  ('first_song',       'Prima canzone completata', 'Hai portato a termine il tuo primo brano.',            'music',  'songs',  1,     100, 1),
  ('streak_7',         '7 giorni consecutivi',     'Hai suonato per sette giorni di fila.',                'flame',  'streak', 7,     150, 2),
  ('streak_30',        'Un mese di costanza',      'Trenta giorni consecutivi di pratica.',                'flame',  'streak', 30,    500, 3),
  ('notes_1000',       '1000 note corrette',       'Hai suonato mille note giuste.',                       'target', 'notes',  1000,  200, 4),
  ('notes_10000',      '10.000 note corrette',     'La mano ormai sa dove andare.',                        'target', 'notes',  10000, 800, 5),
  ('perfect_song',     'Prima canzone al 100%',    'Un brano completato a velocita piena.',                'star',   'songs',  1,     300, 6),
  ('both_hands',       'Due mani insieme',         'Hai completato una sezione con entrambe le mani.',     'hands',  'skill',  1,     150, 7),
  ('minutes_60',       'Prima ora di studio',      'Sessanta minuti di pratica totali.',                   'clock',  'time',   60,    120, 8),
  ('minutes_600',      'Dieci ore al pianoforte',  'Seicento minuti di pratica totali.',                   'clock',  'time',   600,   600, 9),
  ('performance_mode', 'Sotto i riflettori',       'Hai completato un brano in modalita Performance.',     'spark',  'skill',  1,     250, 10)
on conflict (key) do update
  set title_it = excluded.title_it, description_it = excluded.description_it,
      threshold = excluded.threshold, xp_reward = excluded.xp_reward;
