import { buildSong } from '../song/builder';
import {
  RATE_LADDER, completionPct, emptyProgress, isTopRate, nextRate, nextSectionToStudy,
  previousRate, recordAttempt, suggestedRateFor, weakerHand,
} from './progression';

const ARRANGEMENT = buildSong({
  id: 't', slug: 't', title: 'T', artistId: 'a', artistName: 'A',
  coverColors: ['#000', '#fff'], bpm: 60, keySignature: 'C', isFree: true,
  license: { status: 'original', owner: 'M', type: 'p', territory: 'WW', startDate: null, endDate: null },
  arrangements: [{
    difficulty: 'easy',
    suggestedStartRate: 0.7,
    sections: [
      { id: 'intro', kind: 'intro', name: 'Intro', right: 'DO4:4', loopRecommended: true },
      { id: 'verse', kind: 'verse', name: 'Strofa', right: 'RE4:4' },
      { id: 'chorus', kind: 'chorus', name: 'Ritornello', right: 'MI4:4' },
    ],
  }],
}).arrangements[0]!;

describe('progressione di velocita', () => {
  it('sale e scende lungo la scala 50-60-70-80-90-100', () => {
    expect(RATE_LADDER).toEqual([50, 60, 70, 80, 90, 100]);
    expect(nextRate(70)).toBe(80);
    expect(previousRate(70)).toBe(60);
  });

  it('non supera i limiti della scala', () => {
    expect(nextRate(100)).toBe(100);
    expect(previousRate(50)).toBe(50);
    expect(isTopRate(100)).toBe(true);
    expect(isTopRate(90)).toBe(false);
  });

  it('aggancia allo scalino piu vicino un valore intermedio', () => {
    expect(nextRate(73)).toBe(80);     // 73 e' piu' vicino a 70 -> sale a 80
    expect(previousRate(64)).toBe(50); // 64 e' piu' vicino a 60 -> scende a 50
    expect(previousRate(66)).toBe(60); // 66 e' piu' vicino a 70 -> scende a 60
  });
});

describe('avanzamento sull arrangiamento', () => {
  it('parte da zero su tutte le sezioni', () => {
    const p = emptyProgress(ARRANGEMENT);
    expect(Object.keys(p.sections)).toEqual(['intro', 'verse', 'chorus']);
    expect(completionPct(ARRANGEMENT, p)).toBe(0);
  });

  it('registra un tentativo senza mutare lo stato precedente', () => {
    const prima = emptyProgress(ARRANGEMENT);
    const dopo = recordAttempt(prima, 'intro', 70, 90);
    expect(prima.sections.intro!.attempts).toBe(0);
    expect(dopo.sections.intro!.attempts).toBe(1);
  });

  it('considera superata una velocita solo sopra la soglia', () => {
    let p = emptyProgress(ARRANGEMENT);
    p = recordAttempt(p, 'intro', 70, 80); // sotto soglia
    expect(p.sections.intro!.clearedRatePct).toBe(0);
    p = recordAttempt(p, 'intro', 70, 90); // superata
    expect(p.sections.intro!.clearedRatePct).toBe(70);
  });

  it('non fa scendere una velocita gia conquistata', () => {
    let p = emptyProgress(ARRANGEMENT);
    p = recordAttempt(p, 'intro', 90, 95);
    p = recordAttempt(p, 'intro', 60, 95);
    expect(p.sections.intro!.clearedRatePct).toBe(90);
  });

  it('conta il completamento in proporzione alla velocita raggiunta', () => {
    let p = emptyProgress(ARRANGEMENT);
    // Una sezione su tre superata al 60%: 60/3 = 20%.
    p = recordAttempt(p, 'intro', 60, 90);
    expect(completionPct(ARRANGEMENT, p)).toBe(20);
    for (const id of ['intro', 'verse', 'chorus']) p = recordAttempt(p, id, 100, 95);
    expect(completionPct(ARRANGEMENT, p)).toBe(100);
  });

  it('indica la prossima sezione da studiare', () => {
    let p = emptyProgress(ARRANGEMENT);
    expect(nextSectionToStudy(ARRANGEMENT, p)?.id).toBe('intro');
    p = recordAttempt(p, 'intro', 100, 95);
    expect(nextSectionToStudy(ARRANGEMENT, p)?.id).toBe('verse');
  });

  it('non lascia sezioni in sospeso quando il brano e finito', () => {
    let p = emptyProgress(ARRANGEMENT);
    for (const id of ['intro', 'verse', 'chorus']) p = recordAttempt(p, id, 100, 96);
    expect(nextSectionToStudy(ARRANGEMENT, p)).toBeNull();
  });

  it('suggerisce la velocita di partenza dell arrangiamento la prima volta', () => {
    expect(suggestedRateFor(ARRANGEMENT, emptyProgress(ARRANGEMENT), 'intro')).toBe(70);
  });

  it('poi riparte dallo scalino successivo a quello gia superato', () => {
    let p = emptyProgress(ARRANGEMENT);
    p = recordAttempt(p, 'intro', 70, 90);
    expect(suggestedRateFor(ARRANGEMENT, p, 'intro')).toBe(80);
    p = recordAttempt(p, 'intro', 100, 90);
    expect(suggestedRateFor(ARRANGEMENT, p, 'intro')).toBe(100);
  });
});

describe('mano piu in difficolta', () => {
  it('individua quella nettamente indietro', () => {
    expect(weakerHand({ right: { expected: 10, correct: 10 }, left: { expected: 10, correct: 4 } })).toBe('left');
    expect(weakerHand({ right: { expected: 10, correct: 3 }, left: { expected: 10, correct: 10 } })).toBe('right');
  });

  it('non ne segnala nessuna se sono vicine', () => {
    expect(weakerHand({ right: { expected: 10, correct: 9 }, left: { expected: 10, correct: 8 } })).toBeNull();
  });

  it('non si pronuncia quando si suona con una mano sola', () => {
    expect(weakerHand({ right: { expected: 10, correct: 2 } })).toBeNull();
  });
});
