import type { MatcherSnapshot } from '../engine/matcher';
import { computeScore, scoreLabelIt, starsForScore, timingTendencyIt } from './score';

const snapshot = (over: Partial<MatcherSnapshot> = {}): MatcherSnapshot => ({
  expected: 20, correct: 20, wrong: 0, missed: 0, extra: 0,
  deviations: Array(20).fill(0), ...over,
});

describe('punteggio', () => {
  it('da 100 a un esecuzione perfetta', () => {
    const r = computeScore(snapshot(), { toleranceMs: 200 });
    expect(r.score).toBe(100);
    expect(r.stars).toBe(5);
  });

  it('da 0 a chi non suona niente', () => {
    const r = computeScore(snapshot({ correct: 0, missed: 20, deviations: [] }), { toleranceMs: 200 });
    expect(r.score).toBe(0);
    expect(r.stars).toBe(0);
  });

  it('separa il tempo dal ritmo: costante ma in ritardo batte irregolare', () => {
    // A: sempre 60 ms indietro. Deve solo spostarsi.
    const costante = computeScore(snapshot({ deviations: Array(20).fill(60) }), { toleranceMs: 200 });
    // B: stessa media assoluta, ma metà avanti e metà indietro.
    const irregolare = computeScore(
      snapshot({ deviations: Array.from({ length: 20 }, (_, i) => (i % 2 ? 60 : -60)) }),
      { toleranceMs: 200 },
    );
    expect(costante.timingPct).toBeCloseTo(irregolare.timingPct, 1);
    expect(costante.rhythmPct).toBeGreaterThan(irregolare.rhythmPct);
    expect(costante.score).toBeGreaterThan(irregolare.score);
  });

  it('penalizza le note sbagliate anche quando quelle giuste sono tutte prese', () => {
    const pulito = computeScore(snapshot(), { toleranceMs: 200 });
    const sporco = computeScore(snapshot({ wrong: 10 }), { toleranceMs: 200 });
    expect(sporco.score).toBeLessThan(pulito.score);
    expect(pulito.score - sporco.score).toBeLessThanOrEqual(20);
  });

  it('non lascia che le note di troppo affondino il voto oltre il tetto', () => {
    expect(computeScore(snapshot({ extra: 500 }), { toleranceMs: 200 }).score).toBe(80);
  });

  it('non regala tempo e ritmo su note mai suonate', () => {
    // Una nota su quattro, presa perfettamente: il voto non può essere
    // più alto della percentuale di brano effettivamente eseguita.
    const r = computeScore(snapshot({ expected: 4, correct: 1, missed: 3, deviations: [0] }), {
      toleranceMs: 200,
    });
    expect(r.accuracyPct).toBe(25);
    expect(r.score).toBe(25);
  });

  it('misura la precisione come note giuste sul totale atteso', () => {
    const r = computeScore(snapshot({ correct: 15, missed: 5, deviations: Array(15).fill(0) }), {
      toleranceMs: 200,
    });
    expect(r.accuracyPct).toBe(75);
  });

  it('e piu severo quando la finestra e piu stretta', () => {
    const scarti = Array(20).fill(80);
    const imparando = computeScore(snapshot({ deviations: scarti }), { toleranceMs: 400 });
    const esibizione = computeScore(snapshot({ deviations: scarti }), { toleranceMs: 90 });
    expect(esibizione.score).toBeLessThan(imparando.score);
  });

  it('riconosce la tendenza ad anticipare o ritardare', () => {
    const ritardo = computeScore(snapshot({ deviations: Array(20).fill(90) }), { toleranceMs: 400 });
    expect(ritardo.averageDeviationMs).toBe(90);
    expect(timingTendencyIt(ritardo.averageDeviationMs)).toMatch(/ritardo/);
    expect(timingTendencyIt(-90)).toMatch(/anticip/);
    expect(timingTendencyIt(10)).toMatch(/sul tempo/i);
  });

  it('misura il completamento a parte dalla precisione', () => {
    const r = computeScore(snapshot({ correct: 10, missed: 0, deviations: Array(10).fill(0) }), {
      toleranceMs: 200,
    });
    expect(r.completionPct).toBe(50);
  });

  it('assegna le stelle per fasce', () => {
    expect(starsForScore(100)).toBe(5);
    expect(starsForScore(90)).toBe(4);
    expect(starsForScore(75)).toBe(3);
    expect(starsForScore(60)).toBe(2);
    expect(starsForScore(40)).toBe(1);
    expect(starsForScore(10)).toBe(0);
  });

  it('non produce mai un voto fuori da 0..100', () => {
    for (const s of [
      snapshot({ expected: 0, correct: 0, deviations: [] }),
      snapshot({ wrong: 9999, extra: 9999 }),
      snapshot({ deviations: Array(20).fill(100_000) }),
    ]) {
      const r = computeScore(s, { toleranceMs: 200 });
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it('accompagna il voto con un giudizio in italiano', () => {
    expect(scoreLabelIt(97)).toBe('Perfetto');
    expect(scoreLabelIt(20)).toBe('Riproviamo');
  });
});
