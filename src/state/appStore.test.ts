import { buildSong } from '../core/song/builder';
import type { SessionResult } from '../core/engine/session';
import { appStore, continueLearning, minutesPracticedToday, recordPractice, type AppState } from './appStore';
import { defaultProfile } from '../adapters/storage/localRepository';
import { todayIso } from '../core/gamification/rules';

const SONG = buildSong({
  id: 'song-1', slug: 'song-1', title: 'Brano', artistId: 'a', artistName: 'A',
  coverColors: ['#000', '#fff'], bpm: 60, keySignature: 'C', isFree: true,
  license: { status: 'original', owner: 'M', type: 'p', territory: 'WW', startDate: null, endDate: null },
  arrangements: [{
    difficulty: 'easy',
    sections: [
      { id: 'intro', kind: 'intro', name: 'Intro', right: 'DO4:4', loopRecommended: true },
      { id: 'chorus', kind: 'chorus', name: 'Ritornello', right: 'RE4:4' },
    ],
  }],
});
const ARRANGEMENT = SONG.arrangements[0]!;

const risultato = (over: Partial<SessionResult['breakdown']> & { sectionId?: string; ratePct?: number } = {}): SessionResult => ({
  breakdown: {
    accuracyPct: 100, rhythmPct: 100, timingPct: 100, completionPct: 100, score: 92, stars: 4,
    notesExpected: 10, notesCorrect: 10, notesWrong: 0, notesMissed: 0, notesExtra: 0,
    averageDeviationMs: 0, deviationSpreadMs: 0, ...over,
  },
  handStats: { right: { expected: 10, correct: 10 } },
  durationMs: 120_000,
  mode: 'practice',
  ratePct: over.ratePct ?? 70,
  sectionId: over.sectionId ?? 'intro',
  hands: ['right'],
});

function reset(patch: Partial<AppState> = {}) {
  appStore.setState({
    ready: true,
    session: { userId: 'u1', email: null, local: true },
    profile: { ...defaultProfile('u1'), onboardingCompleted: true },
    songs: [SONG], artists: [], progress: [], recentSessions: [], achievements: [],
    error: null, remote: false, ...patch,
  });
}

describe('registrazione di un esercizio', () => {
  beforeEach(() => reset());

  it('salva la sessione e aggiorna i progressi della sezione', async () => {
    await recordPractice({ song: SONG, arrangement: ARRANGEMENT, result: risultato() });

    const stato = appStore.getState();
    expect(stato.recentSessions).toHaveLength(1);
    expect(stato.recentSessions[0]).toMatchObject({ songId: 'song-1', score: 92 });

    const progresso = stato.progress[0]!;
    expect(progresso.arrangementId).toBe(ARRANGEMENT.id);
    expect(progresso.sectionState.intro?.clearedRatePct).toBe(70);
    // Una sezione su due superata al 70%: 35% del brano.
    expect(progresso.completionPct).toBe(35);
  });

  it('non segna superata una sezione con punteggio insufficiente', async () => {
    await recordPractice({ song: SONG, arrangement: ARRANGEMENT, result: risultato({ score: 60 }) });
    expect(appStore.getState().progress[0]!.sectionState.intro?.clearedRatePct).toBe(0);
  });

  it('conserva il punteggio migliore invece di sovrascriverlo con l ultimo', async () => {
    await recordPractice({ song: SONG, arrangement: ARRANGEMENT, result: risultato({ score: 95 }) });
    await recordPractice({ song: SONG, arrangement: ARRANGEMENT, result: risultato({ score: 40 }) });
    expect(appStore.getState().progress[0]!.bestScore).toBe(95);
    expect(appStore.getState().progress[0]!.attempts).toBe(2);
  });

  it('assegna XP e fa salire di livello', async () => {
    const prima = appStore.getState().profile!.xp;
    await recordPractice({ song: SONG, arrangement: ARRANGEMENT, result: risultato() });
    const dopo = appStore.getState().profile!;
    expect(dopo.xp).toBeGreaterThan(prima);
    expect(dopo.level).toBeGreaterThanOrEqual(1);
  });

  it('avvia la striscia al primo esercizio', async () => {
    await recordPractice({ song: SONG, arrangement: ARRANGEMENT, result: risultato() });
    const profilo = appStore.getState().profile!;
    expect(profilo.streakCurrent).toBe(1);
    expect(profilo.lastPracticeDate).toBe(todayIso());
  });

  it('somma il tempo di pratica', async () => {
    await recordPractice({ song: SONG, arrangement: ARRANGEMENT, result: risultato() });
    await recordPractice({ song: SONG, arrangement: ARRANGEMENT, result: risultato() });
    expect(appStore.getState().profile!.totalPracticeMs).toBe(240_000);
  });

  it('non duplica il progresso dello stesso arrangiamento', async () => {
    await recordPractice({ song: SONG, arrangement: ARRANGEMENT, result: risultato() });
    await recordPractice({ song: SONG, arrangement: ARRANGEMENT, result: risultato({ sectionId: 'chorus' }) });
    expect(appStore.getState().progress).toHaveLength(1);
    // Entrambe le sezioni superate al 70%: 70% del brano.
    expect(appStore.getState().progress[0]!.completionPct).toBe(70);
  });

  it('sblocca le medaglie in base ai fatti registrati', async () => {
    await recordPractice({ song: SONG, arrangement: ARRANGEMENT, result: risultato() });
    const medaglie = appStore.getState().achievements;
    expect(medaglie.length).toBeGreaterThan(0);
    // Un giorno di pratica non basta per la medaglia dei sette giorni.
    expect(medaglie.find((a) => a.key === 'streak_7')?.unlocked).toBe(false);
  });

  it('non fa nulla senza una sessione attiva', async () => {
    reset({ session: null, profile: null });
    await recordPractice({ song: SONG, arrangement: ARRANGEMENT, result: risultato() });
    expect(appStore.getState().recentSessions).toEqual([]);
  });
});

describe('selettori della home', () => {
  beforeEach(() => reset());

  it('propone di riprendere i brani lasciati a meta', async () => {
    await recordPractice({ song: SONG, arrangement: ARRANGEMENT, result: risultato() });
    expect(continueLearning(appStore.getState()).map((s) => s.id)).toEqual(['song-1']);
  });

  it('non ripropone un brano gia completato', async () => {
    await recordPractice({ song: SONG, arrangement: ARRANGEMENT, result: risultato({ sectionId: 'intro', ratePct: 100 }) });
    await recordPractice({ song: SONG, arrangement: ARRANGEMENT, result: risultato({ sectionId: 'chorus', ratePct: 100 }) });
    expect(appStore.getState().progress[0]!.completionPct).toBe(100);
    expect(continueLearning(appStore.getState())).toEqual([]);
  });

  it('conta i minuti suonati oggi', async () => {
    await recordPractice({ song: SONG, arrangement: ARRANGEMENT, result: risultato() });
    expect(minutesPracticedToday(appStore.getState())).toBe(2);
  });
});
