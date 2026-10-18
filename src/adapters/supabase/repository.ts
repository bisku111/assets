import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuthPort, AuthSession, CatalogPort, InputPreference, PracticeSessionRecord,
  ProgressPort, SongProgressRecord, UserProfile,
} from '../../core/ports/repository';
import { UserFacingError } from '../../core/ports/repository';
import type { Artist, DifficultyKey, Song, SongArrangement } from '../../core/song/types';
import { defaultProfile } from '../storage/localRepository';

/**
 * Implementazione remota delle porte dati.
 *
 * Regola di questo file: nessun errore tecnico raggiunge la UI. Ogni
 * fallimento viene tradotto in una frase che l'utente possa capire e su
 * cui possa agire. "PGRST301" non e' un messaggio, e' un dispetto.
 */

function tradurreErrore(error: { message?: string; code?: string } | null, cosa: string): UserFacingError {
  const codice = error?.code ?? '';
  const messaggio = error?.message ?? '';

  if (codice === 'PGRST301' || messaggio.includes('JWT')) {
    return new UserFacingError('La sessione e scaduta. Accedi di nuovo per continuare.', error);
  }
  if (messaggio.toLowerCase().includes('fetch') || messaggio.toLowerCase().includes('network')) {
    return new UserFacingError(
      'Non riesco a raggiungere il servizio. Controlla la connessione: puoi continuare a esercitarti offline.',
      error,
    );
  }
  return new UserFacingError(`Non sono riuscito a ${cosa}. Riprova fra un momento.`, error);
}

export class SupabaseAuth implements AuthPort {
  constructor(private readonly client: SupabaseClient) {}

  async getSession(): Promise<AuthSession | null> {
    const { data } = await this.client.auth.getSession();
    const user = data.session?.user;
    return user ? { userId: user.id, email: user.email ?? null, local: false } : null;
  }

  async signUp(email: string, password: string, displayName: string): Promise<AuthSession> {
    const { data, error } = await this.client.auth.signUp({
      email, password, options: { data: { display_name: displayName } },
    });
    if (error) throw tradurreRegistrazione(error);
    if (!data.user) {
      throw new UserFacingError('Controlla la posta: ti ho inviato un link per confermare l indirizzo.');
    }
    return { userId: data.user.id, email: data.user.email ?? null, local: false };
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) {
      throw error.message.includes('Invalid login')
        ? new UserFacingError('Email o password non corretti.')
        : tradurreErrore(error, 'accedere');
    }
    return { userId: data.user.id, email: data.user.email ?? null, local: false };
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  async continueOffline(): Promise<AuthSession> {
    throw new UserFacingError('Questa modalita non e disponibile quando si usa un account.');
  }
}

function tradurreRegistrazione(error: { message: string }): UserFacingError {
  const m = error.message.toLowerCase();
  if (m.includes('already registered') || m.includes('already been registered')) {
    return new UserFacingError('Esiste gia un account con questa email. Prova ad accedere.');
  }
  if (m.includes('password')) return new UserFacingError('La password deve essere di almeno 6 caratteri.');
  if (m.includes('email')) return new UserFacingError('Questo indirizzo email non sembra valido.');
  return new UserFacingError('Non sono riuscito a creare l account. Riprova fra un momento.');
}

const SONG_COLUMNS = `id, slug, title, subtitle, bpm, key_signature, time_sig_num, time_sig_den,
  duration_ms, base_difficulty, is_free, tags, license_status, license_owner, license_type,
  territory, license_start_date, license_end_date, artists(id, name)`;

export class SupabaseCatalog implements CatalogPort {
  constructor(private readonly client: SupabaseClient) {}

  async listArtists(): Promise<Artist[]> {
    const { data, error } = await this.client
      .from('artists')
      .select('id, slug, name, bio_it, is_placeholder, sort_order')
      .order('sort_order');
    if (error) throw tradurreErrore(error, 'caricare gli artisti');

    return (data ?? []).map((row) => ({
      id: row.id as string,
      slug: row.slug as string,
      name: row.name as string,
      ...(row.bio_it ? { bio: row.bio_it as string } : {}),
      isPlaceholder: Boolean(row.is_placeholder),
      coverColors: ['#2B1B4D', '#5B3FA8'] as [string, string],
      sortOrder: (row.sort_order as number) ?? 0,
    }));
  }

  /**
   * Elenco per il catalogo: SENZA le note.
   * Sono migliaia di righe per brano e servono solo quando si apre il
   * player; scaricarle per riempire una lista sarebbe uno spreco che si
   * paga in secondi di attesa e in traffico dati dell'utente.
   */
  async listSongs(): Promise<Song[]> {
    const { data, error } = await this.client
      .from('songs')
      .select(SONG_COLUMNS)
      .eq('is_published', true)
      .order('popularity', { ascending: false });
    if (error) throw tradurreErrore(error, 'caricare il catalogo');
    return (data ?? []).map((row) => mapSong(row as unknown as SongRow, []));
  }

  async getSong(songId: string): Promise<Song | null> {
    const { data, error } = await this.client
      .from('songs')
      .select(`${SONG_COLUMNS}, song_arrangements(id, difficulty, hands, suggested_start_rate,
                 song_sections(id, kind, name_it, start_ms, end_ms, sort_order, loop_recommended),
                 song_notes(hand, midi, start_ms, duration_ms, velocity, finger, section_id),
                 song_chords(symbol, start_ms, duration_ms))`)
      .eq('id', songId)
      .maybeSingle();

    if (error) throw tradurreErrore(error, 'aprire il brano');
    if (!data) return null;

    const row = data as unknown as SongRow & { song_arrangements?: ArrangementRow[] };
    const arrangements = (row.song_arrangements ?? [])
      .map(mapArrangement)
      // Un arrangiamento senza note significa che la RLS ha negato il
      // contenuto premium: va nascosto, non mostrato vuoto.
      .filter((a) => a.notes.length > 0);

    return mapSong(row, arrangements);
  }
}

interface SongRow {
  id: string; slug: string; title: string; subtitle: string | null;
  bpm: number; key_signature: string; time_sig_num: number; time_sig_den: number;
  duration_ms: number; base_difficulty: DifficultyKey; is_free: boolean; tags: string[] | null;
  license_status: string; license_owner: string | null; license_type: string | null;
  territory: string; license_start_date: string | null; license_end_date: string | null;
  // PostgREST restituisce la relazione come array o come oggetto a
  // seconda di come e' dichiarata la chiave esterna: si gestiscono entrambi.
  artists?: { id: string; name: string } | Array<{ id: string; name: string }> | null;
}

interface ArrangementRow {
  id: string; difficulty: DifficultyKey; hands: string[]; suggested_start_rate: number;
  song_sections?: Array<{ id: string; kind: string; name_it: string; start_ms: number; end_ms: number; sort_order: number; loop_recommended: boolean }>;
  song_notes?: Array<{ hand: string; midi: number; start_ms: number; duration_ms: number; velocity: number; finger: number | null; section_id: string | null }>;
  song_chords?: Array<{ symbol: string; start_ms: number; duration_ms: number }>;
}

function artistOf(row: SongRow): { id: string; name: string } | null {
  if (!row.artists) return null;
  return Array.isArray(row.artists) ? (row.artists[0] ?? null) : row.artists;
}

function mapSong(row: SongRow, arrangements: SongArrangement[]): Song {
  const song: Song = {
    schemaVersion: 1,
    id: row.id,
    slug: row.slug,
    title: row.title,
    artistId: artistOf(row)?.id ?? '',
    artistName: artistOf(row)?.name ?? 'Artista',
    coverColors: ['#2B1B4D', '#5B3FA8'],
    bpm: Number(row.bpm),
    keySignature: row.key_signature,
    timeSignature: [row.time_sig_num, row.time_sig_den],
    durationMs: row.duration_ms,
    baseDifficulty: row.base_difficulty,
    isFree: row.is_free,
    tags: row.tags ?? [],
    license: {
      status: row.license_status as Song['license']['status'],
      owner: row.license_owner,
      type: row.license_type,
      territory: row.territory,
      startDate: row.license_start_date,
      endDate: row.license_end_date,
    },
    arrangements,
  };
  if (row.subtitle) song.subtitle = row.subtitle;
  return song;
}

function mapArrangement(row: ArrangementRow): SongArrangement {
  const sections = (row.song_sections ?? [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => ({
      id: s.id,
      kind: s.kind as SongArrangement['sections'][number]['kind'],
      name: s.name_it,
      startMs: s.start_ms,
      endMs: s.end_ms,
      ...(s.loop_recommended ? { loopRecommended: true } : {}),
    }));

  const notes = (row.song_notes ?? [])
    .map((n) => ({
      midi: n.midi,
      startMs: n.start_ms,
      durationMs: n.duration_ms,
      hand: n.hand as 'left' | 'right',
      velocity: Number(n.velocity),
      ...(n.finger ? { finger: n.finger } : {}),
      ...(n.section_id ? { sectionId: n.section_id } : {}),
    }))
    .sort((a, b) => a.startMs - b.startMs || a.midi - b.midi);

  const lastSectionEnd = sections[sections.length - 1]?.endMs ?? 0;
  const lastNoteEnd = notes.reduce((max, n) => Math.max(max, n.startMs + n.durationMs), 0);

  return {
    id: row.id,
    difficulty: row.difficulty,
    hands: row.hands as Array<'left' | 'right'>,
    suggestedStartRate: Number(row.suggested_start_rate),
    durationMs: Math.max(lastSectionEnd, lastNoteEnd),
    sections,
    notes,
    chords: (row.song_chords ?? []).map((c) => ({
      symbol: c.symbol, startMs: c.start_ms, durationMs: c.duration_ms,
    })),
  };
}

export class SupabaseProgress implements ProgressPort {
  constructor(private readonly client: SupabaseClient) {}

  async getProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await this.client.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) throw tradurreErrore(error, 'caricare il profilo');
    if (!data) return null;

    return {
      ...defaultProfile(userId),
      displayName: data.display_name as string,
      avatarUrl: (data.avatar_url as string | null) ?? null,
      skillLevel: data.skill_level as UserProfile['skillLevel'],
      dailyGoalMinutes: data.daily_goal_minutes as number,
      favoriteArtistIds: (data.favorite_artist_ids as string[] | null) ?? [],
      xp: data.xp as number,
      level: data.level as number,
      streakCurrent: data.streak_current as number,
      streakLongest: data.streak_longest as number,
      lastPracticeDate: (data.last_practice_date as string | null) ?? null,
      totalPracticeMs: Number(data.total_practice_ms ?? 0),
      inputLatencyMs: data.input_latency_ms as number,
      preferredInput: mapInput(data.preferred_input as string),
      onboardingCompleted: Boolean(data.onboarding_completed),
    };
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    const { error } = await this.client
      .from('profiles')
      .update({
        display_name: profile.displayName,
        skill_level: profile.skillLevel,
        daily_goal_minutes: profile.dailyGoalMinutes,
        favorite_artist_ids: profile.favoriteArtistIds,
        xp: profile.xp,
        level: profile.level,
        streak_current: profile.streakCurrent,
        streak_longest: profile.streakLongest,
        last_practice_date: profile.lastPracticeDate,
        total_practice_ms: profile.totalPracticeMs,
        input_latency_ms: profile.inputLatencyMs,
        preferred_input: profile.preferredInput.replace('-', '_'),
        onboarding_completed: profile.onboardingCompleted,
      })
      .eq('id', profile.id);
    if (error) throw tradurreErrore(error, 'salvare il profilo');
  }

  async listProgress(userId: string): Promise<SongProgressRecord[]> {
    const { data, error } = await this.client
      .from('user_song_progress').select('*').eq('user_id', userId)
      .order('last_practiced_at', { ascending: false, nullsFirst: false });
    if (error) throw tradurreErrore(error, 'caricare i progressi');

    return (data ?? []).map((row) => ({
      songId: row.song_id as string,
      arrangementId: row.arrangement_id as string,
      difficulty: 'easy' as DifficultyKey,
      bestScore: row.best_score as number,
      stars: row.stars as number,
      completionPct: row.completion_pct as number,
      currentRatePct: row.current_rate_pct as number,
      attempts: row.attempts as number,
      totalPracticeMs: Number(row.total_practice_ms ?? 0),
      lastPracticedAt: (row.last_practiced_at as string | null) ?? null,
      sectionState: (row.section_state as SongProgressRecord['sectionState']) ?? {},
    }));
  }

  async saveProgress(userId: string, progress: SongProgressRecord): Promise<void> {
    const { error } = await this.client.from('user_song_progress').upsert(
      {
        user_id: userId,
        song_id: progress.songId,
        arrangement_id: progress.arrangementId,
        best_score: progress.bestScore,
        stars: progress.stars,
        completion_pct: progress.completionPct,
        current_rate_pct: progress.currentRatePct,
        attempts: progress.attempts,
        total_practice_ms: progress.totalPracticeMs,
        last_practiced_at: progress.lastPracticedAt,
        section_state: progress.sectionState,
      },
      { onConflict: 'user_id,arrangement_id' },
    );
    if (error) throw tradurreErrore(error, 'salvare i progressi');
  }

  async listSessions(userId: string, limit = 50): Promise<PracticeSessionRecord[]> {
    const { data, error } = await this.client
      .from('practice_sessions').select('*').eq('user_id', userId)
      .order('started_at', { ascending: false }).limit(limit);
    if (error) throw tradurreErrore(error, 'caricare le sessioni');

    return (data ?? []).map((row) => ({
      id: row.id as string,
      userId,
      songId: row.song_id as string,
      arrangementId: row.arrangement_id as string,
      sectionId: (row.section_id as string | null) ?? null,
      mode: row.mode as PracticeSessionRecord['mode'],
      input: mapInput(row.input as string),
      ratePct: row.rate_pct as number,
      startedAt: row.started_at as string,
      durationMs: row.duration_ms as number,
      notesExpected: row.notes_expected as number,
      notesCorrect: row.notes_correct as number,
      notesWrong: row.notes_wrong as number,
      notesMissed: row.notes_missed as number,
      accuracyPct: Number(row.accuracy_pct),
      rhythmPct: Number(row.rhythm_pct),
      timingPct: Number(row.timing_pct),
      score: row.score as number,
      completed: Boolean(row.completed),
      hands: [],
    }));
  }

  async saveSession(session: PracticeSessionRecord): Promise<void> {
    const { error } = await this.client.from('practice_sessions').insert({
      user_id: session.userId,
      song_id: session.songId,
      arrangement_id: session.arrangementId,
      section_id: session.sectionId,
      mode: session.mode,
      input: session.input.replace('-', '_'),
      rate_pct: session.ratePct,
      started_at: session.startedAt,
      duration_ms: session.durationMs,
      notes_expected: session.notesExpected,
      notes_correct: session.notesCorrect,
      notes_wrong: session.notesWrong,
      notes_missed: session.notesMissed,
      accuracy_pct: session.accuracyPct,
      rhythm_pct: session.rhythmPct,
      timing_pct: session.timingPct,
      score: session.score,
      completed: session.completed,
    });
    if (error) throw tradurreErrore(error, 'salvare la sessione');
  }
}

function mapInput(value: string): InputPreference {
  return value === 'midi' ? 'midi' : value === 'microphone' ? 'microphone' : 'virtual-keyboard';
}
