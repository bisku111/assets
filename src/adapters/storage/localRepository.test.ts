import { UserFacingError } from '../../core/ports/repository';
import { MemoryStore, readJson } from './keyValue';
import { LocalAuth, LocalCatalog, LocalProgress, defaultProfile } from './localRepository';

const sessione = (over: Partial<Parameters<LocalProgress['saveSession']>[0]> = {}) => ({
  id: 's1', userId: 'u1', songId: 'song-1', arrangementId: 'arr-1', sectionId: null,
  mode: 'practice' as const, input: 'virtual-keyboard' as const, ratePct: 70,
  startedAt: '2026-03-10T10:00:00.000Z', durationMs: 60_000,
  notesExpected: 20, notesCorrect: 18, notesWrong: 1, notesMissed: 2,
  accuracyPct: 90, rhythmPct: 85, timingPct: 88, score: 88, completed: true,
  hands: ['right' as const], ...over,
});

describe('archivio locale', () => {
  it('permette di iniziare senza account, ma non finge una registrazione', async () => {
    const auth = new LocalAuth(new MemoryStore());
    await expect(auth.signUp('a@b.it', 'x', 'Anna')).rejects.toBeInstanceOf(UserFacingError);
    await expect(auth.signIn('a@b.it', 'x')).rejects.toBeInstanceOf(UserFacingError);

    const s = await auth.continueOffline('Anna');
    expect(s.local).toBe(true);
    expect(await auth.getSession()).toEqual(s);
  });

  it('spiega perche la registrazione non e possibile invece di dare errore tecnico', async () => {
    await expect(new LocalAuth(new MemoryStore()).signUp('a@b.it', 'x', 'Anna'))
      .rejects.toThrow(/questo dispositivo/i);
  });

  it('riusa la stessa sessione locale invece di crearne una nuova ogni volta', async () => {
    const auth = new LocalAuth(new MemoryStore());
    expect((await auth.continueOffline()).userId).toBe((await auth.continueOffline()).userId);
  });

  it('crea il profilo insieme alla sessione locale', async () => {
    const store = new MemoryStore();
    const s = await new LocalAuth(store).continueOffline('Marco');
    expect(await new LocalProgress(store).getProfile(s.userId))
      .toMatchObject({ displayName: 'Marco', onboardingCompleted: false });
  });

  it('dimentica la sessione all uscita', async () => {
    const auth = new LocalAuth(new MemoryStore());
    await auth.continueOffline();
    await auth.signOut();
    expect(await auth.getSession()).toBeNull();
  });

  it('offre il catalogo dimostrativo anche senza rete', async () => {
    const catalog = new LocalCatalog();
    const brani = await catalog.listSongs();
    expect(brani.length).toBeGreaterThan(0);
    expect(await catalog.getSong(brani[0]!.slug)).toMatchObject({ id: brani[0]!.id });
    expect(await catalog.getSong('inesistente')).toBeNull();
  });

  it('salva e rilegge i progressi senza duplicarli', async () => {
    const progress = new LocalProgress(new MemoryStore());
    const record = {
      songId: 'song-1', arrangementId: 'arr-1', difficulty: 'easy' as const,
      bestScore: 88, stars: 4, completionPct: 60, currentRatePct: 80,
      attempts: 3, totalPracticeMs: 120_000, lastPracticedAt: '2026-03-10T10:00:00.000Z',
      sectionState: {},
    };
    await progress.saveProgress('u1', record);
    expect(await progress.listProgress('u1')).toEqual([record]);

    await progress.saveProgress('u1', { ...record, bestScore: 95 });
    const tutti = await progress.listProgress('u1');
    expect(tutti).toHaveLength(1);
    expect(tutti[0]!.bestScore).toBe(95);
  });

  it('tiene separati i dati di utenti diversi', async () => {
    const progress = new LocalProgress(new MemoryStore());
    await progress.saveProfile({ ...defaultProfile('u1'), displayName: 'Anna' });
    await progress.saveProfile({ ...defaultProfile('u2'), displayName: 'Bruno' });
    expect((await progress.getProfile('u1'))?.displayName).toBe('Anna');
    expect((await progress.getProfile('u2'))?.displayName).toBe('Bruno');
    expect(await progress.listProgress('u2')).toEqual([]);
  });

  it('elenca le sessioni dalla piu recente', async () => {
    const progress = new LocalProgress(new MemoryStore());
    await progress.saveSession(sessione({ id: 'vecchia' }));
    await progress.saveSession(sessione({ id: 'nuova' }));
    expect((await progress.listSessions('u1')).map((s) => s.id)).toEqual(['nuova', 'vecchia']);
  });

  it('non fa crescere l archivio all infinito', async () => {
    const progress = new LocalProgress(new MemoryStore());
    for (let i = 0; i < 600; i++) await progress.saveSession(sessione({ id: `s${i}` }));
    expect((await progress.listSessions('u1', 1000)).length).toBeLessThanOrEqual(500);
  });

  it('riparte dal valore predefinito se il dato salvato e corrotto', async () => {
    // Capita davvero: versione precedente dell'app, o scrittura interrotta.
    const store = new MemoryStore();
    await store.set('chiave', '{questo non e json');
    expect(await readJson(store, 'chiave', { ok: true })).toEqual({ ok: true });
  });
});
