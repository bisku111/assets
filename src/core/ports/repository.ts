import type { PracticeMode } from '../engine/matcher';
import type { ArrangementProgress } from '../learning/progression';
import type { Artist, DifficultyKey, Hand, Song } from '../song/types';

/**
 * Porte dei dati.
 *
 * Due implementazioni con lo stesso contratto: una locale (dispositivo)
 * e una remota (Supabase). L'app funziona con l'una o con l'altra senza
 * saperlo — ed e' il motivo per cui puo' partire e restare utilizzabile
 * anche senza rete e senza backend configurato.
 */

export type SkillLevel = 'never_played' | 'beginner' | 'plays_already' | 'advanced';
export type InputPreference = 'midi' | 'microphone' | 'virtual-keyboard';

export interface UserProfile {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  skillLevel: SkillLevel;
  dailyGoalMinutes: number;
  favoriteArtistIds: string[];
  xp: number;
  level: number;
  streakCurrent: number;
  streakLongest: number;
  lastPracticeDate: string | null;
  totalPracticeMs: number;
  inputLatencyMs: number;
  preferredInput: InputPreference;
  onboardingCompleted: boolean;
}

export interface PracticeSessionRecord {
  id: string;
  userId: string;
  songId: string;
  arrangementId: string;
  sectionId: string | null;
  mode: PracticeMode;
  input: InputPreference;
  ratePct: number;
  startedAt: string;
  durationMs: number;
  notesExpected: number;
  notesCorrect: number;
  notesWrong: number;
  notesMissed: number;
  accuracyPct: number;
  rhythmPct: number;
  timingPct: number;
  score: number;
  completed: boolean;
  hands: Hand[];
}

export interface SongProgressRecord {
  songId: string;
  arrangementId: string;
  difficulty: DifficultyKey;
  bestScore: number;
  stars: number;
  completionPct: number;
  currentRatePct: number;
  attempts: number;
  totalPracticeMs: number;
  lastPracticedAt: string | null;
  sectionState: ArrangementProgress['sections'];
}

export interface AuthSession {
  userId: string;
  email: string | null;
  /** true quando l'account vive solo su questo dispositivo. */
  local: boolean;
}

export interface AuthPort {
  getSession(): Promise<AuthSession | null>;
  signUp(email: string, password: string, displayName: string): Promise<AuthSession>;
  signIn(email: string, password: string): Promise<AuthSession>;
  signOut(): Promise<void>;
  /** Account solo locale: nessun dato lascia il dispositivo. */
  continueOffline(displayName?: string): Promise<AuthSession>;
}

export interface CatalogPort {
  listArtists(): Promise<Artist[]>;
  listSongs(): Promise<Song[]>;
  getSong(songId: string): Promise<Song | null>;
}

export interface ProgressPort {
  getProfile(userId: string): Promise<UserProfile | null>;
  saveProfile(profile: UserProfile): Promise<void>;
  listProgress(userId: string): Promise<SongProgressRecord[]>;
  saveProgress(userId: string, progress: SongProgressRecord): Promise<void>;
  listSessions(userId: string, limit?: number): Promise<PracticeSessionRecord[]>;
  saveSession(session: PracticeSessionRecord): Promise<void>;
}

/** Errore che la UI puo' mostrare cosi' com'e': gia' scritto per l'utente. */
export class UserFacingError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = 'UserFacingError';
  }
}
