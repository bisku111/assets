import { getRepositories } from '../adapters/repositories';
import { importedSongs } from '../adapters/storage/importedSongs';
import {
  evaluateAchievements, levelForXp, sessionXp, todayIso, updateStreak,
  type AchievementState,
} from '../core/gamification/rules';
import type { SessionResult } from '../core/engine/session';
import { completionPct, emptyProgress, recordAttempt, type ArrangementProgress } from '../core/learning/progression';
import type {
  AuthSession, PracticeSessionRecord, SongProgressRecord, UserProfile,
} from '../core/ports/repository';
import { UserFacingError } from '../core/ports/repository';
import { starsForScore } from '../core/scoring/score';
import type { Artist, Song, SongArrangement } from '../core/song/types';
import { createStore, useStore } from './store';

/**
 * Stato dell'applicazione.
 *
 * Un solo posto in cui vivono sessione, profilo, catalogo e progressi.
 * Le schermate leggono fette con `useAppStore(selettore)` e non si
 * passano dati a catena fra loro: con un tutorial a schermo intero
 * aperto sopra tutto, il "prop drilling" sarebbe insostenibile.
 */

export interface AppState {
  ready: boolean;
  session: AuthSession | null;
  profile: UserProfile | null;
  songs: Song[];
  artists: Artist[];
  progress: SongProgressRecord[];
  recentSessions: PracticeSessionRecord[];
  achievements: AchievementState[];
  /** Messaggio già scritto per l'utente, non un errore tecnico. */
  error: string | null;
  /** false = nessun backend: tutto resta su questo dispositivo. */
  remote: boolean;
}

const initial: AppState = {
  ready: false,
  session: null,
  profile: null,
  songs: [],
  artists: [],
  progress: [],
  recentSessions: [],
  achievements: [],
  error: null,
  remote: false,
};

export const appStore = createStore<AppState>(initial);

export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useStore(appStore, selector);
}

function messaggioDi(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  return 'Qualcosa non ha funzionato. Riprova fra un momento.';
}

/**
 * Aggiunge alla libreria un brano importato da un file dell'utente.
 * Resta su questo dispositivo: non viene mai caricato da nessuna parte.
 */
export async function addImportedSong(song: Song): Promise<void> {
  await importedSongs.add(song);
  await loadCatalog();
}

/** Toglie dalla libreria un brano importato. */
export async function removeImportedSong(songId: string): Promise<void> {
  await importedSongs.remove(songId);
  await loadCatalog();
}

/** Avvio: carica sessione, profilo, catalogo e progressi. */
export async function bootstrap(): Promise<void> {
  const repos = getRepositories();
  appStore.setState({ remote: repos.remote });

  try {
    const session = await repos.auth.getSession();
    appStore.setState({ session });
    if (session) await loadUserData(session.userId);
  } catch (error) {
    appStore.setState({ error: messaggioDi(error) });
  }

  await loadCatalog();
  appStore.setState({ ready: true });
}

/**
 * Catalogo. Se il servizio remoto fallisce si ripiega sul catalogo nel
 * bundle invece di mostrare una schermata vuota: l'utente deve poter
 * suonare anche in metropolitana.
 */
export async function loadCatalog(): Promise<void> {
  const repos = getRepositories();
  // I brani importati dall'utente vivono solo sul dispositivo: si
  // aggiungono al catalogo qualunque sia la sua provenienza, e se la
  // loro lettura fallisce il catalogo resta comunque utilizzabile.
  const importati = await importedSongs.list().catch(() => []);
  try {
    const [songs, artists] = await Promise.all([repos.catalog.listSongs(), repos.catalog.listArtists()]);
    appStore.setState({ songs: [...songs, ...importati], artists, error: null });
  } catch (error) {
    const { fallbackCatalog } = await import('../adapters/repositories');
    const [songs, artists] = await Promise.all([
      fallbackCatalog.listSongs(), fallbackCatalog.listArtists(),
    ]);
    appStore.setState({
      songs: [...songs, ...importati], artists,
      error: `${messaggioDi(error)} Intanto trovi i brani già disponibili sul dispositivo.`,
    });
  }
}

async function loadUserData(userId: string): Promise<void> {
  const repos = getRepositories();
  const [profile, progress, recentSessions] = await Promise.all([
    repos.progress.getProfile(userId),
    repos.progress.listProgress(userId),
    repos.progress.listSessions(userId, 50),
  ]);
  appStore.setState({ profile, progress, recentSessions });
  recomputeAchievements();
}

// ---------------------------------------------------------------------
// Autenticazione
// ---------------------------------------------------------------------

export async function signIn(email: string, password: string): Promise<boolean> {
  return runAuth(() => getRepositories().auth.signIn(email, password));
}

export async function signUp(email: string, password: string, displayName: string): Promise<boolean> {
  return runAuth(() => getRepositories().auth.signUp(email, password, displayName));
}

export async function continueOffline(displayName?: string): Promise<boolean> {
  return runAuth(() => getRepositories().auth.continueOffline(displayName));
}

async function runAuth(action: () => Promise<AuthSession>): Promise<boolean> {
  try {
    const session = await action();
    appStore.setState({ session, error: null });
    await loadUserData(session.userId);
    return true;
  } catch (error) {
    appStore.setState({ error: messaggioDi(error) });
    return false;
  }
}

export async function signOut(): Promise<void> {
  await getRepositories().auth.signOut();
  appStore.setState({ session: null, profile: null, progress: [], recentSessions: [], achievements: [] });
}

export async function updateProfile(patch: Partial<UserProfile>): Promise<void> {
  const current = appStore.getState().profile;
  if (!current) return;
  const next = { ...current, ...patch };
  appStore.setState({ profile: next });
  try {
    await getRepositories().progress.saveProfile(next);
  } catch (error) {
    appStore.setState({ error: messaggioDi(error) });
  }
}

// ---------------------------------------------------------------------
// Fine di un esercizio: è il punto in cui tutto si aggiorna
// ---------------------------------------------------------------------

export interface CompletedPractice {
  song: Song;
  arrangement: SongArrangement;
  result: SessionResult;
}

/**
 * Registra un esercizio concluso.
 *
 * Aggiorna in un colpo solo: sessione storica, progressi della sezione,
 * XP, livello, striscia e medaglie. Lo stato locale viene aggiornato
 * SUBITO e il salvataggio avviene dopo: se la rete è lenta, l'utente
 * vede comunque il suo risultato senza attendere.
 */
export async function recordPractice({ song, arrangement, result }: CompletedPractice): Promise<void> {
  const state = appStore.getState();
  const { session, profile } = state;
  if (!session || !profile) return;

  const oggi = todayIso();
  const record: PracticeSessionRecord = {
    id: `${Date.now()}`,
    userId: session.userId,
    songId: song.id,
    arrangementId: arrangement.id,
    sectionId: result.sectionId,
    mode: result.mode,
    input: profile.preferredInput,
    ratePct: result.ratePct,
    startedAt: new Date().toISOString(),
    durationMs: result.durationMs,
    notesExpected: result.breakdown.notesExpected,
    notesCorrect: result.breakdown.notesCorrect,
    notesWrong: result.breakdown.notesWrong,
    notesMissed: result.breakdown.notesMissed,
    accuracyPct: result.breakdown.accuracyPct,
    rhythmPct: result.breakdown.rhythmPct,
    timingPct: result.breakdown.timingPct,
    score: result.breakdown.score,
    completed: result.breakdown.completionPct >= 95,
    hands: result.hands,
  };

  // ---- Progressi della sezione ----
  const precedente = state.progress.find((p) => p.arrangementId === arrangement.id);
  const avanzamento: ArrangementProgress = {
    arrangementId: arrangement.id,
    sections: precedente?.sectionState ?? emptyProgress(arrangement).sections,
  };
  const aggiornato = result.sectionId
    ? recordAttempt(avanzamento, result.sectionId, result.ratePct, result.breakdown.score)
    : avanzamento;

  const progressRecord: SongProgressRecord = {
    songId: song.id,
    arrangementId: arrangement.id,
    difficulty: arrangement.difficulty,
    bestScore: Math.max(precedente?.bestScore ?? 0, result.breakdown.score),
    stars: Math.max(precedente?.stars ?? 0, starsForScore(result.breakdown.score)),
    completionPct: completionPct(arrangement, aggiornato),
    currentRatePct: result.ratePct,
    attempts: (precedente?.attempts ?? 0) + 1,
    totalPracticeMs: (precedente?.totalPracticeMs ?? 0) + result.durationMs,
    lastPracticedAt: record.startedAt,
    sectionState: aggiornato.sections,
  };

  // ---- Profilo: XP, livello, striscia ----
  const xp = profile.xp + sessionXp(record);
  const streak = updateStreak(profile, oggi);
  const profiloAggiornato: UserProfile = {
    ...profile,
    xp,
    level: levelForXp(xp),
    ...streak,
    totalPracticeMs: profile.totalPracticeMs + result.durationMs,
  };

  appStore.setState({
    profile: profiloAggiornato,
    recentSessions: [record, ...state.recentSessions].slice(0, 50),
    progress: [
      progressRecord,
      ...state.progress.filter((p) => p.arrangementId !== arrangement.id),
    ],
  });
  recomputeAchievements();

  // ---- Salvataggio: dopo l'aggiornamento a schermo ----
  const repos = getRepositories();
  try {
    await Promise.all([
      repos.progress.saveSession(record),
      repos.progress.saveProgress(session.userId, progressRecord),
      repos.progress.saveProfile(profiloAggiornato),
    ]);
  } catch (error) {
    appStore.setState({
      error: `${messaggioDi(error)} Il risultato resta salvato su questo dispositivo.`,
    });
  }
}

/** Ricalcola le medaglie dai fatti, non da contatori paralleli. */
export function recomputeAchievements(): void {
  const { recentSessions, progress, profile } = appStore.getState();

  const achievements = evaluateAchievements({
    songsCompleted: progress.filter((p) => p.completionPct >= 100).length,
    songsAtFullSpeed: progress.filter((p) => p.currentRatePct >= 100 && p.bestScore >= 85).length,
    streakDays: profile?.streakCurrent ?? 0,
    notesCorrect: recentSessions.reduce((sum, s) => sum + s.notesCorrect, 0),
    practiceMinutes: Math.round((profile?.totalPracticeMs ?? 0) / 60_000),
    sectionsWithBothHands: recentSessions.filter((s) => s.hands.length === 2 && s.score >= 85).length,
    performanceRuns: recentSessions.filter((s) => s.mode === 'performance' && s.completed).length,
  });

  appStore.setState({ achievements });
}

export function dismissError(): void {
  appStore.setState({ error: null });
}

// ---------------------------------------------------------------------
// Selettori
// ---------------------------------------------------------------------

export function progressForSong(state: AppState, songId: string): SongProgressRecord | null {
  return state.progress.find((p) => p.songId === songId) ?? null;
}

/** Brani ripresi di recente, per la sezione "Continua a imparare". */
export function continueLearning(state: AppState, limit = 5): Song[] {
  return state.progress
    .filter((p) => p.lastPracticedAt !== null && p.completionPct < 100)
    .sort((a, b) => (b.lastPracticedAt ?? '').localeCompare(a.lastPracticedAt ?? ''))
    .map((p) => state.songs.find((s) => s.id === p.songId))
    .filter((s): s is Song => Boolean(s))
    .slice(0, limit);
}

export function minutesPracticedToday(state: AppState): number {
  const oggi = todayIso();
  return Math.round(
    state.recentSessions
      .filter((s) => s.startedAt.slice(0, 10) === oggi)
      .reduce((sum, s) => sum + s.durationMs, 0) / 60_000,
  );
}
