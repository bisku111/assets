import type { ScoreBreakdown } from '../scoring/score';
import type { SongSection } from '../song/types';
import { coachAdvice, coachActionLabelIt, liveFeedbackIt, welcomeBackIt, type CoachContext } from './coach';

const RITORNELLO: SongSection = { id: 'chorus', kind: 'chorus', name: 'Ritornello', startMs: 0, endMs: 10_000 };

const breakdown = (over: Partial<ScoreBreakdown> = {}): ScoreBreakdown => ({
  accuracyPct: 100, rhythmPct: 100, timingPct: 100, completionPct: 100,
  score: 100, stars: 5, notesExpected: 20, notesCorrect: 20, notesWrong: 0,
  notesMissed: 0, notesExtra: 0, averageDeviationMs: 0, deviationSpreadMs: 0, ...over,
});

const context = (over: Partial<CoachContext> = {}): CoachContext => ({
  breakdown: breakdown(), mode: 'practice', ratePct: 70, section: RITORNELLO,
  hands: ['right'], attempts: 1, isLastSection: false, ...over,
});

describe('il maestro', () => {
  it('dopo un ottimo tentativo propone di salire di velocita', () => {
    const advice = coachAdvice(context());
    expect(advice.action).toEqual({ type: 'increase-rate', ratePct: 80 });
    expect(advice.tone).toBe('celebrate');
    expect(advice.detail).toContain('80%');
  });

  it('quando la parte e troppo difficile rallenta invece di insistere', () => {
    const advice = coachAdvice(
      context({ breakdown: breakdown({ score: 40, accuracyPct: 45, notesWrong: 3, notesMissed: 5 }) }),
    );
    expect(advice.action).toEqual({ type: 'decrease-rate', ratePct: 60 });
    expect(advice.headline.toLowerCase()).toContain('difficile');
    expect(advice.detail).toContain('8 note');
  });

  it('alla velocita minima non rallenta all infinito: fa ripetere', () => {
    const advice = coachAdvice(context({ ratePct: 50, breakdown: breakdown({ score: 30, accuracyPct: 30 }) }));
    expect(advice.action).toEqual({ type: 'repeat-section', sectionId: 'chorus' });
  });

  it('distingue "note giuste ma ritmo sbagliato" da "note sbagliate"', () => {
    const advice = coachAdvice(
      context({ breakdown: breakdown({ score: 70, accuracyPct: 100, rhythmPct: 35, timingPct: 55, averageDeviationMs: 85 }) }),
    );
    expect(advice.headline).toBe('Le note sono giuste, il ritmo no.');
    expect(advice.detail).toContain('ritardo');
    expect(advice.action.type).toBe('repeat-section');
  });

  it('isola la mano rimasta indietro invece di rallentare entrambe', () => {
    const advice = coachAdvice(context({
      hands: ['right', 'left'],
      breakdown: breakdown({ score: 60, accuracyPct: 70 }),
      handStats: { right: { expected: 20, correct: 19 }, left: { expected: 20, correct: 8 } },
    }));
    expect(advice.action).toEqual({ type: 'isolate-hand', hand: 'left' });
    expect(advice.headline).toContain('sinistra');
  });

  it('non isola nessuna mano se vanno quasi uguali', () => {
    const advice = coachAdvice(context({
      hands: ['right', 'left'],
      breakdown: breakdown({ score: 60, accuracyPct: 70 }),
      handStats: { right: { expected: 20, correct: 15 }, left: { expected: 20, correct: 14 } },
    }));
    expect(advice.action.type).not.toBe('isolate-hand');
  });

  it('a velocita piena con una mano sola propone di unire le mani', () => {
    expect(coachAdvice(context({ ratePct: 100, hands: ['right'] })).action).toEqual({ type: 'both-hands' });
  });

  it('a velocita piena e due mani passa alla sezione successiva', () => {
    expect(coachAdvice(context({ ratePct: 100, hands: ['right', 'left'] })).action)
      .toEqual({ type: 'next-section' });
  });

  it('sull ultima sezione a velocita piena dichiara il brano completato', () => {
    const advice = coachAdvice(context({ ratePct: 100, hands: ['right', 'left'], isLastSection: true }));
    expect(advice.action).toEqual({ type: 'finish' });
    expect(advice.headline).toContain('completato');
  });

  it('quando manca poco fa ripetere dicendo quanto manca', () => {
    const advice = coachAdvice(
      context({ breakdown: breakdown({ score: 78, accuracyPct: 88, notesMissed: 2, notesWrong: 1 }) }),
    );
    expect(advice.action.type).toBe('repeat-section');
    expect(advice.detail).toContain('78');
  });

  it('offre sempre almeno un alternativa al pulsante principale', () => {
    const casi = [
      context(),
      context({ breakdown: breakdown({ score: 20, accuracyPct: 20 }) }),
      context({ ratePct: 50, breakdown: breakdown({ score: 20, accuracyPct: 20 }) }),
      context({ ratePct: 100, hands: ['right', 'left'], isLastSection: true }),
    ];
    for (const c of casi) expect(coachAdvice(c).alternatives.length).toBeGreaterThanOrEqual(1);
  });

  it('non propone mai un azione incoerente con la velocita attuale', () => {
    for (const rate of [50, 60, 70, 80, 90, 100]) {
      for (const score of [10, 40, 60, 80, 95]) {
        const advice = coachAdvice(context({ ratePct: rate, breakdown: breakdown({ score, accuracyPct: score }) }));
        if (advice.action.type === 'increase-rate') expect(advice.action.ratePct).toBeGreaterThan(rate);
        if (advice.action.type === 'decrease-rate') expect(advice.action.ratePct).toBeLessThan(rate);
      }
    }
  });

  it('da a ogni azione un etichetta leggibile per il pulsante', () => {
    expect(coachActionLabelIt({ type: 'increase-rate', ratePct: 80 })).toBe("Prova all'80%");
    expect(coachActionLabelIt({ type: 'isolate-hand', hand: 'left' })).toBe('Solo mano sinistra');
    expect(coachActionLabelIt({ type: 'finish' })).toBe('Concludi');
  });
});

describe('feedback immediato', () => {
  it('dice quale nota era prevista e quale e stata suonata', () => {
    expect(liveFeedbackIt({ kind: 'wrong', expectedMidi: 64, playedMidi: 62 }))
      .toBe('Prevista: MI — Suonata: RE');
  });

  it('conferma le note giuste in una parola', () => {
    expect(liveFeedbackIt({ kind: 'correct' })).toBe('Giusto');
  });

  it('segnala le note di troppo', () => {
    expect(liveFeedbackIt({ kind: 'extra', playedMidi: 67 })).toContain('SOL');
  });
});

describe('accoglienza', () => {
  it('riconosce la costanza', () => {
    expect(welcomeBackIt(90, 7)).toContain('7 giorni');
  });
  it('e incoraggiante dopo un tentativo andato male', () => {
    expect(welcomeBackIt(40, 1)).toContain('calma');
  });
  it('saluta chi non ha mai suonato', () => {
    expect(welcomeBackIt(null, 0)).toContain('Cominciamo');
  });
});
