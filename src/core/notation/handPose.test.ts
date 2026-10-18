import { keyboardGeometry } from '../music/keyboard';
import { handPose, nextFingerTargets } from './handPose';
import type { SongNote } from '../song/types';

const geo = keyboardGeometry(60, 84); // DO4 .. DO6

describe('posa della mano', () => {
  it('non inventa una posa se non c'+"'"+'è niente da suonare', () => {
    expect(handPose('right', [], geo)).toBeNull();
  });

  it('mette il dito richiesto esattamente sul centro del suo tasto', () => {
    const posa = handPose('right', [{ midi: 64, finger: 3 }], geo)!;
    const dito3 = posa.fingers.find((f) => f.finger === 3)!;
    expect(dito3.x).toBeCloseTo(geo.box(64)!.center, 10);
    expect(dito3.active).toBe(true);
    expect(dito3.midi).toBe(64);
  });

  it('dispone le altre dita in ordine, senza sovrapporle', () => {
    const posa = handPose('right', [{ midi: 60, finger: 1 }], geo)!;
    const xs = posa.fingers.map((f) => f.x);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] as number).toBeGreaterThan(xs[i - 1] as number);
    }
  });

  it('nella mano sinistra il mignolo sta a sinistra del pollice', () => {
    const posa = handPose('left', [{ midi: 60, finger: 1 }], geo)!;
    const mignolo = posa.fingers.find((f) => f.finger === 5)!;
    const pollice = posa.fingers.find((f) => f.finger === 1)!;
    expect(mignolo.x).toBeLessThan(pollice.x);
  });

  it('accontenta tutte le dita richieste di un accordo', () => {
    // DO-MI-SOL con 1-3-5: la posa naturale della mano destra.
    const posa = handPose('right', [
      { midi: 60, finger: 1 }, { midi: 64, finger: 3 }, { midi: 67, finger: 5 },
    ], geo)!;
    for (const [midi, finger] of [[60, 1], [64, 3], [67, 5]] as const) {
      const dito = posa.fingers.find((f) => f.finger === finger)!;
      expect(dito.x).toBeCloseTo(geo.box(midi)!.center, 10);
    }
  });

  it('segnala il tasto nero, che si raggiunge più in alto', () => {
    const posa = handPose('right', [{ midi: 66, finger: 2 }], geo)!;
    expect(posa.fingers.find((f) => f.finger === 2)!.black).toBe(true);
    expect(posa.fingers.find((f) => f.finger === 1)!.black).toBe(false);
  });

  it('non fa uscire la mano dalla tastiera', () => {
    // Mignolo destro sull'ultimo tasto: le altre dita restano dentro.
    const posa = handPose('right', [{ midi: 84, finger: 5 }], geo)!;
    for (const dito of posa.fingers) {
      expect(dito.x).toBeGreaterThanOrEqual(0);
      expect(dito.x).toBeLessThanOrEqual(1);
    }
  });

  it('ignora i tasti fuori dall'+"'"+'estensione mostrata', () => {
    expect(handPose('right', [{ midi: 21, finger: 1 }], geo)).toBeNull();
  });
});

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
    // Durante una pausa lunga le mani non devono indicare nulla.
    const pending = [nota({ startMs: 9000 })];
    expect(nextFingerTargets(pending, 'right', 0, 2000)).toEqual([]);
  });

  it('salta le note senza diteggiatura invece di inventarne una', () => {
    const senza = { ...nota({ startMs: 100 }) };
    delete (senza as { finger?: number }).finger;
    expect(nextFingerTargets([senza], 'right', 0, 2000)).toEqual([]);
  });
});
