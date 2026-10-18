import { DEMO_ARTISTS, DEMO_SONGS } from '../../content/catalog';
import type {
  AuthPort, AuthSession, CatalogPort, PracticeSessionRecord,
  ProgressPort, SongProgressRecord, UserProfile,
} from '../../core/ports/repository';
import { UserFacingError } from '../../core/ports/repository';
import type { Artist, Song } from '../../core/song/types';
import { readJson, writeJson, type KeyValueStore } from './keyValue';

/**
 * Dati sul dispositivo.
 *
 * Serve a tre situazioni tutt'altro che marginali:
 *  - Supabase non ancora configurato (sviluppo, o prima installazione);
 *  - utente che non vuole creare un account per provare l'app;
 *  - nessuna rete.
 *
 * Il catalogo e' quello dimostrativo incluso nel bundle, quindi l'app e'
 * completa e utilizzabile appena installata, anche in aereo.
 */

const KEY_SESSION = 'maestro.session';
const KEY_PROFILE = (userId: string) => `maestro.profile.${userId}`;
const KEY_PROGRESS = (userId: string) => `maestro.progress.${userId}`;
const KEY_SESSIONS = (userId: string) => `maestro.sessions.${userId}`;

/** Quante sessioni tenere sul dispositivo: le statistiche non ne servono infinite. */
const MAX_STORED_SESSIONS = 500;

export class LocalAuth implements AuthPort {
  constructor(private readonly store: KeyValueStore) {}

  async getSession(): Promise<AuthSession | null> {
    return readJson<AuthSession | null>(this.store, KEY_SESSION, null);
  }

  // I parametri sono quelli della porta: qui non servono, ma la firma
  // deve restare compatibile con l'implementazione remota.
  async signUp(_email?: string, _password?: string, _displayName?: string): Promise<AuthSession> {
    // Non si finge una registrazione: senza backend non esiste un account
    // che possa seguire l'utente su un altro dispositivo, e dirgli il
    // contrario significherebbe fargli perdere i progressi.
    throw new UserFacingError(
      "La creazione dell'account richiede la connessione al servizio. Puoi intanto continuare su questo dispositivo: i tuoi progressi resteranno salvati qui.",
    );
  }

  async signIn(_email?: string, _password?: string): Promise<AuthSession> {
    throw new UserFacingError(
      "L'accesso richiede la connessione al servizio. Puoi continuare su questo dispositivo senza account.",
    );
  }

  async signOut(): Promise<void> {
    await this.store.remove(KEY_SESSION);
  }

  async continueOffline(displayName = 'Pianista'): Promise<AuthSession> {
    const existing = await this.getSession();
    if (existing) return existing;

    const session: AuthSession = { userId: `local-${Date.now()}`, email: null, local: true };
    await writeJson(this.store, KEY_SESSION, session);
    await writeJson(this.store, KEY_PROFILE(session.userId), defaultProfile(session.userId, displayName));
    return session;
  }
}

export class LocalCatalog implements CatalogPort {
  async listArtists(): Promise<Artist[]> { return DEMO_ARTISTS; }
  async listSongs(): Promise<Song[]> { return DEMO_SONGS; }
  async getSong(songId: string): Promise<Song | null> {
    return DEMO_SONGS.find((s) => s.id === songId || s.slug === songId) ?? null;
  }
}

export class LocalProgress implements ProgressPort {
  constructor(private readonly store: KeyValueStore) {}

  async getProfile(userId: string): Promise<UserProfile | null> {
    return readJson<UserProfile | null>(this.store, KEY_PROFILE(userId), null);
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    await writeJson(this.store, KEY_PROFILE(profile.id), profile);
  }

  async listProgress(userId: string): Promise<SongProgressRecord[]> {
    return readJson<SongProgressRecord[]>(this.store, KEY_PROGRESS(userId), []);
  }

  async saveProgress(userId: string, progress: SongProgressRecord): Promise<void> {
    const all = await this.listProgress(userId);
    const index = all.findIndex((p) => p.arrangementId === progress.arrangementId);
    if (index >= 0) all[index] = progress;
    else all.push(progress);
    await writeJson(this.store, KEY_PROGRESS(userId), all);
  }

  async listSessions(userId: string, limit = 50): Promise<PracticeSessionRecord[]> {
    const all = await readJson<PracticeSessionRecord[]>(this.store, KEY_SESSIONS(userId), []);
    return all.slice(0, limit);
  }

  async saveSession(session: PracticeSessionRecord): Promise<void> {
    const all = await readJson<PracticeSessionRecord[]>(this.store, KEY_SESSIONS(session.userId), []);
    // Le piu' recenti in testa: e' l'ordine in cui vengono sempre lette.
    all.unshift(session);
    await writeJson(this.store, KEY_SESSIONS(session.userId), all.slice(0, MAX_STORED_SESSIONS));
  }
}

export function defaultProfile(userId: string, displayName = 'Pianista'): UserProfile {
  return {
    id: userId,
    displayName,
    email: null,
    avatarUrl: null,
    skillLevel: 'never_played',
    dailyGoalMinutes: 10,
    favoriteArtistIds: [],
    xp: 0,
    level: 1,
    streakCurrent: 0,
    streakLongest: 0,
    lastPracticeDate: null,
    totalPracticeMs: 0,
    inputLatencyMs: 0,
    preferredInput: 'virtual-keyboard',
    onboardingCompleted: false,
  };
}
