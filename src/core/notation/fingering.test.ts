import { nextFingerTargets } from './fingering';
import type { SongNote } from '../song/types';

describe('tasti da preparare', () => {
  const nota = (over: Partial<SongNote>): SongNote => ({
    midi: 60, startMs: 0, durationMs: 400, hand: 'right', finger: 1, ...over,
  });

  it('prende il prossimo attacco, non quello già passato', () => {
    const pending = [nota({ midi: 64, finger: 3, startMs: 1000 })];
    expect(nextFingerTargets(pending, 'right', 500, 2000)).toEqual([{ midi: 64, finger: 3 }]);
  });

  it('prende tutte le note dello stesso accordo', () => {
    const pending = [
      nota({ midi: 60, finger: 1, startMs: 1000 }),
      nota({ midi: 64, finger: 3, startMs: 1010 }),
      nota({ midi: 67, finger: 5, startMs: 1000 }),
      nota({ midi: 72, finger: 5, startMs: 1600 }), // attacco successivo
    ];
    expect(nextFingerTargets(pending, 'right', 900, 2000).map((t) => t.midi)).toEqual([60, 64, 67]);
  });

  it('ignora l'+"'"+'altra mano', () => {
    const pending = [
      nota({ midi: 48, finger: 5, startMs: 1000, hand: 'left' }),
      nota({ midi: 72, finger: 2, startMs: 1200, hand: 'right' }),
    ];
    expect(nextFingerTargets(pending, 'left', 900, 2000)).toEqual([{ midi: 48, finger: 5 }]);
  });

  it('non anticipa una nota ancora lontana', () => {
    // Durante una pausa lunga non deve comparire nessun numero.
    const pending = [nota({ startMs: 9000 })];
    expect(nextFingerTargets(pending, 'right', 0, 2000)).toEqual([]);
  });

  it('salta le note senza diteggiatura invece di inventarne una', () => {
    const senza = { ...nota({ startMs: 100 }) };
    delete (senza as { finger?: number }).finger;
    expect(nextFingerTargets([senza], 'right', 0, 2000)).toEqual([]);
  });
});
