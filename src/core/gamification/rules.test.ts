import { evaluateAchievements, levelForXp, levelProgress, sessionXp, updateStreak, xpForLevel } from './rules';

describe('XP e livelli', () => {
  it('premia il risultato e la velocita, non il tempo passato', () => {
    const lento = sessionXp({ score: 90, notesCorrect: 40, ratePct: 50, mode: 'practice' });
    const veloce = sessionXp({ score: 90, notesCorrect: 40, ratePct: 100, mode: 'practice' });
    expect(veloce).toBeGreaterThan(lento);
  });

  it('da sempre almeno un punto, anche a un tentativo andato male', () => {
    expect(sessionXp({ score: 0, notesCorrect: 0, ratePct: 50, mode: 'learn' })).toBeGreaterThanOrEqual(1);
  });

  it('riconosce la modalita performance', () => {
    const normale = sessionXp({ score: 80, notesCorrect: 20, ratePct: 100, mode: 'play' });
    const esibizione = sessionXp({ score: 80, notesCorrect: 20, ratePct: 100, mode: 'performance' });
    expect(esibizione - normale).toBe(25);
  });

  it('fa salire di livello con una curva che rallenta', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(400)).toBe(3);
    // Il secondo livello costa 100 XP, il terzo molti di piu'.
    expect(xpForLevel(3) - xpForLevel(2)).toBeGreaterThan(xpForLevel(2) - xpForLevel(1));
  });

  it('calcola quanto manca al livello successivo', () => {
    const p = levelProgress(150);
    expect(p.level).toBe(2);
    expect(p.current).toBe(50);
    expect(p.needed).toBe(300);
    expect(p.pct).toBe(17);
  });

  it('non va in errore con XP negativi o assurdi', () => {
    expect(levelForXp(-500)).toBe(1);
    expect(levelProgress(0).pct).toBe(0);
  });
});

describe('striscia di giorni consecutivi', () => {
  const base = { streakCurrent: 3, streakLongest: 10, lastPracticeDate: '2026-03-10' };

  it('non cresce due volte nello stesso giorno', () => {
    expect(updateStreak(base, '2026-03-10')).toEqual(base);
  });

  it('cresce il giorno dopo', () => {
    expect(updateStreak(base, '2026-03-11')).toMatchObject({ streakCurrent: 4 });
  });

  it('riparte da uno dopo un giorno saltato', () => {
    expect(updateStreak(base, '2026-03-13')).toMatchObject({ streakCurrent: 1 });
  });

  it('funziona a cavallo di un mese', () => {
    const marzo = { streakCurrent: 5, streakLongest: 5, lastPracticeDate: '2026-03-31' };
    expect(updateStreak(marzo, '2026-04-01')).toMatchObject({ streakCurrent: 6 });
  });

  it('conserva il record anche quando la striscia si interrompe', () => {
    expect(updateStreak(base, '2026-04-20').streakLongest).toBe(10);
  });

  it('gestisce il primo giorno in assoluto', () => {
    expect(updateStreak({ streakCurrent: 0, streakLongest: 0, lastPracticeDate: null }, '2026-03-10'))
      .toEqual({ streakCurrent: 1, streakLongest: 1, lastPracticeDate: '2026-03-10' });
  });
});

describe('medaglie', () => {
  const vuoto = {
    songsCompleted: 0, songsAtFullSpeed: 0, streakDays: 0, notesCorrect: 0,
    practiceMinutes: 0, sectionsWithBothHands: 0, performanceRuns: 0,
  };

  it('parte con tutte da conquistare', () => {
    expect(evaluateAchievements(vuoto).every((a) => !a.unlocked)).toBe(true);
  });

  it('sblocca la prima canzone completata', () => {
    expect(evaluateAchievements({ ...vuoto, songsCompleted: 1 }).find((a) => a.key === 'first_song')?.unlocked)
      .toBe(true);
  });

  it('sblocca le soglie a scaglioni', () => {
    const stato = evaluateAchievements({ ...vuoto, notesCorrect: 1500 });
    expect(stato.find((a) => a.key === 'notes_1000')?.unlocked).toBe(true);
    expect(stato.find((a) => a.key === 'notes_10000')?.unlocked).toBe(false);
  });

  it('mostra l avanzamento anche prima dello sblocco', () => {
    expect(evaluateAchievements({ ...vuoto, streakDays: 4 }).find((a) => a.key === 'streak_7'))
      .toMatchObject({ progress: 4, unlocked: false });
  });
});
