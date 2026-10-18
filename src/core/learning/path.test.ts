import type { SongProgressRecord } from '../ports/repository';
import { buildLessonPath, lessonsCompleted, lockMessageIt, UNLOCK_COMPLETION_PCT } from './path';

const LEZIONI = ['l1', 'l2', 'l3'];

const avanzamento = (songId: string, completionPct: number, bestScore = 80): SongProgressRecord => ({
  songId, arrangementId: `${songId}-a`, difficulty: 'beginner',
  bestScore, stars: 3, completionPct, currentRatePct: 70, attempts: 1,
  totalPracticeMs: 1000, lastPracticedAt: null, sectionState: {},
});

describe('percorso didattico', () => {
  it('apre sempre la prima lezione', () => {
    const path = buildLessonPath(LEZIONI, []);
    expect(path[0]!.unlocked).toBe(true);
    expect(path[1]!.unlocked).toBe(false);
  });

  it('indica la prima lezione come quella da fare adesso', () => {
    const path = buildLessonPath(LEZIONI, []);
    expect(path.filter((l) => l.current).map((l) => l.songId)).toEqual(['l1']);
  });

  it('apre la successiva solo oltre la soglia', () => {
    const quasi = buildLessonPath(LEZIONI, [avanzamento('l1', UNLOCK_COMPLETION_PCT - 1)]);
    expect(quasi[1]!.unlocked).toBe(false);

    const soglia = buildLessonPath(LEZIONI, [avanzamento('l1', UNLOCK_COMPLETION_PCT)]);
    expect(soglia[1]!.unlocked).toBe(true);
  });

  it('non apre la terza se la seconda e ancora indietro', () => {
    const path = buildLessonPath(LEZIONI, [avanzamento('l1', 100), avanzamento('l2', 10)]);
    expect(path[1]!.unlocked).toBe(true);
    expect(path[2]!.unlocked).toBe(false);
  });

  it('sposta "adesso" sulla prima non completata', () => {
    const path = buildLessonPath(LEZIONI, [avanzamento('l1', 100), avanzamento('l2', 70)]);
    expect(path.find((l) => l.current)?.songId).toBe('l2');
  });

  it('non segna nessuna lezione corrente quando sono tutte finite', () => {
    const path = buildLessonPath(LEZIONI, LEZIONI.map((id) => avanzamento(id, 100)));
    expect(path.some((l) => l.current)).toBe(false);
    expect(lessonsCompleted(path)).toBe(3);
  });

  it('spiega quanto manca per aprire una lezione bloccata', () => {
    const path = buildLessonPath(LEZIONI, [avanzamento('l1', 40)]);
    expect(lockMessageIt(path, 1)).toContain('20%');
    expect(lockMessageIt(path, 0)).toBeNull(); // la prima non e' mai bloccata
  });

  it('riporta il punteggio migliore di ogni lezione', () => {
    const path = buildLessonPath(LEZIONI, [avanzamento('l1', 80, 93)]);
    expect(path[0]!.bestScore).toBe(93);
  });
});
