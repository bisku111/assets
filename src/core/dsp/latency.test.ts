import { calibrateLatency, calibrationMessageIt, type CalibrationSample } from './latency';

const colpi = (deltas: number[]): CalibrationSample[] =>
  deltas.map((d, i) => ({ expectedMs: i * 500, actualMs: i * 500 + d }));

describe('calibrazione della latenza', () => {
  it('misura una latenza costante', () => {
    const r = calibrateLatency(colpi([80, 82, 78, 81, 79, 80]));
    expect(r.latencyMs).toBe(80);
    expect(r.reliable).toBe(true);
  });

  it('ignora un colpo mancato invece di lasciarsi spostare la misura', () => {
    // La media di questi valori sarebbe 200 ms: completamente sbagliata.
    const r = calibrateLatency(colpi([80, 82, 78, 81, 79, 800]));
    expect(r.latencyMs).toBe(80);
    expect(r.discardedSamples).toBe(1);
  });

  it('regge anche un anticipo isolato', () => {
    const r = calibrateLatency(colpi([60, 62, 58, 61, 59, -350]));
    expect(r.latencyMs).toBeGreaterThan(55);
    expect(r.latencyMs).toBeLessThan(65);
  });

  it('dichiara inaffidabile una calibrazione con colpi irregolari', () => {
    const r = calibrateLatency(colpi([10, 120, -80, 200, 0, 150]));
    expect(r.reliable).toBe(false);
    expect(calibrationMessageIt(r)).toContain('poco regolari');
  });

  it('non si pronuncia con troppi pochi colpi', () => {
    const r = calibrateLatency(colpi([80, 82]));
    expect(r.reliable).toBe(false);
    expect(r.latencyMs).toBe(0);
    expect(calibrationMessageIt(r)).toContain('abbastanza note');
  });

  it('non chiede correzioni quando lo strumento risponde subito', () => {
    const r = calibrateLatency(colpi([2, -3, 1, 0, 4, -2]));
    expect(Math.abs(r.latencyMs)).toBeLessThan(15);
    expect(calibrationMessageIt(r)).toContain('subito');
  });

  it('spiega il risultato in italiano, con il numero misurato', () => {
    expect(calibrationMessageIt(calibrateLatency(colpi([95, 97, 93, 96, 94, 95])))).toContain('95 ms');
  });

  it('non va in errore con una lista vuota', () => {
    expect(calibrateLatency([])).toMatchObject({ latencyMs: 0, reliable: false });
  });
});
