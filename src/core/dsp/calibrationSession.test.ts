import { ManualClock } from '../ports/clock';
import { LatencyCalibrator } from './calibrationSession';

const BPM = 80;
const BEAT = 60_000 / BPM; // 750 ms

const calibratore = (over: Partial<ConstructorParameters<typeof LatencyCalibrator>[0]> = {}) => {
  const clock = new ManualClock(1000);
  return { clock, cal: new LatencyCalibrator({ clock, bpm: BPM, beats: 8, countInBeats: 4, ...over }) };
};

/** Suona tutti gli otto battiti con un ritardo costante. */
function suonaTutto(cal: LatencyCalibrator, ritardoMs: number) {
  for (let i = 0; i < 8; i++) cal.record(cal.expectedTimeOf(i) + ritardoMs);
}

describe('sessione di calibrazione', () => {
  it('parte ferma, senza colpi raccolti', () => {
    const { cal } = calibratore();
    expect(cal.tick()).toMatchObject({ phase: 'idle', collected: 0, totalBeats: 8 });
  });

  it('comincia con i battiti di preparazione, che non si misurano', () => {
    const { clock, cal } = calibratore();
    cal.start();
    expect(cal.tick().phase).toBe('count-in');
    clock.advance(BEAT * 3.5);
    expect(cal.tick().phase).toBe('count-in');
    clock.advance(BEAT);
    expect(cal.tick().phase).toBe('measuring');
  });

  it('ignora i colpi dati durante la preparazione', () => {
    const { clock, cal } = calibratore();
    cal.start();
    expect(cal.record(clock.now() + BEAT)).toBe(false);
    expect(cal.samples).toHaveLength(0);
  });

  it('misura una latenza costante', () => {
    const { cal } = calibratore();
    cal.start();
    suonaTutto(cal, 90);
    const r = cal.result();
    expect(r.latencyMs).toBe(90);
    expect(r.usedSamples).toBe(8);
    expect(r.reliable).toBe(true);
  });

  it('associa ogni colpo al battito piu vicino, non al successivo in ordine', () => {
    // L'utente salta il terzo battito. Associando "in ordine" tutti i
    // colpi seguenti slitterebbero di un battito e la misura sarebbe
    // sbagliata di 750 ms.
    const { cal } = calibratore();
    cal.start();
    for (let i = 0; i < 8; i++) {
      if (i === 2) continue;
      cal.record(cal.expectedTimeOf(i) + 60);
    }
    expect(cal.samples).toHaveLength(7);
    expect(cal.result().latencyMs).toBe(60);
  });

  it('conta un colpo solo per battito', () => {
    const { cal } = calibratore();
    cal.start();
    cal.record(cal.expectedTimeOf(0) + 20);
    cal.record(cal.expectedTimeOf(0) + 30); // rimbalzo o doppia ditata
    expect(cal.samples).toHaveLength(1);
  });

  it('non registra colpi oltre la fine della corsa', () => {
    const { cal } = calibratore();
    cal.start();
    expect(cal.record(cal.expectedTimeOf(20))).toBe(false);
  });

  it('lascia mezzo battito di coda per un colpo in ritardo sull ultimo', () => {
    const { clock, cal } = calibratore();
    cal.start();
    clock.advance(BEAT * 12); // fine dell'ultimo battito misurato
    expect(cal.tick().phase).toBe('measuring');
    clock.advance(BEAT * 0.6);
    expect(cal.tick().phase).toBe('done');
  });

  it('dichiara inaffidabile una esecuzione irregolare', () => {
    const { cal } = calibratore();
    cal.start();
    const scarti = [10, 150, -90, 200, 0, 120, -60, 180];
    scarti.forEach((d, i) => cal.record(cal.expectedTimeOf(i) + d));
    expect(cal.result().reliable).toBe(false);
  });

  it('il metronomo non accumula deriva', () => {
    const { cal } = calibratore();
    cal.start();
    // Il centesimo battito deve cadere esattamente a 100 intervalli
    // dall'inizio: un metronomo che accumula calibrerebbe sul proprio errore.
    const atteso = cal.expectedTimeOf(96) - cal.expectedTimeOf(0);
    expect(atteso).toBeCloseTo(96 * BEAT, 6);
  });

  it('riporta l avanzamento per l animazione del battito', () => {
    const { clock, cal } = calibratore();
    cal.start();
    clock.advance(BEAT * 4.25);
    const frame = cal.tick();
    expect(frame.beatIndex).toBe(0);
    expect(frame.beatProgress).toBeCloseTo(0.25, 2);
  });

  it('ricominciare azzera i colpi gia raccolti', () => {
    const { cal } = calibratore();
    cal.start();
    suonaTutto(cal, 50);
    cal.start();
    expect(cal.samples).toHaveLength(0);
  });
});
