import { frequencyToPitch, midiToFrequency, noteNameIt } from '../music/note';
import { detectPitch, rootMeanSquare } from './yin';

const SAMPLE_RATE = 44_100;

/** Onda sinusoidale pura. */
function sine(frequencyHz: number, length = 2048, amplitude = 0.5, sampleRate = SAMPLE_RATE): Float32Array {
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buffer[i] = amplitude * Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate);
  }
  return buffer;
}

/**
 * Timbro simile a una nota di pianoforte: fondamentale piu' armoniche,
 * con la seconda armonica PIU' FORTE della fondamentale. E' il caso che
 * fa sbagliare l'ottava ai rilevatori basati sul picco spettrale.
 */
function pianoLike(frequencyHz: number, length = 2048, sampleRate = SAMPLE_RATE): Float32Array {
  const buffer = new Float32Array(length);
  const partials = [
    { multiple: 1, amplitude: 0.35 }, { multiple: 2, amplitude: 0.5 },
    { multiple: 3, amplitude: 0.22 }, { multiple: 4, amplitude: 0.12 },
    { multiple: 5, amplitude: 0.06 },
  ];
  for (let i = 0; i < length; i++) {
    let value = 0;
    for (const { multiple, amplitude } of partials) {
      value += amplitude * Math.sin((2 * Math.PI * frequencyHz * multiple * i) / sampleRate);
    }
    buffer[i] = value / 1.25;
  }
  return buffer;
}

function withNoise(buffer: Float32Array, amount: number, seed = 1): Float32Array {
  // Rumore deterministico: un test che dipende da Math.random e' un test
  // che prima o poi fallisce da solo.
  let state = seed;
  const random = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648 - 0.5;
  };
  const out = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) out[i] = (buffer[i] as number) + random() * amount;
  return out;
}

const centsError = (measured: number, expected: number) => Math.abs(1200 * Math.log2(measured / expected));

describe('rilevamento dell altezza (YIN)', () => {
  it('riconosce il LA4 di riferimento entro un cent', () => {
    const result = detectPitch(sine(440), { sampleRate: SAMPLE_RATE });
    expect(result).not.toBeNull();
    expect(centsError(result!.frequencyHz, 440)).toBeLessThan(1);
    expect(result!.clarity).toBeGreaterThan(0.9);
  });

  it('riconosce tutte le note di due ottave attorno al DO centrale', () => {
    // Da DO3 (48) a DO5 (72): l'estensione in cui si studia davvero.
    for (let midi = 48; midi <= 72; midi++) {
      const result = detectPitch(sine(midiToFrequency(midi), 4096), { sampleRate: SAMPLE_RATE });
      expect(result).not.toBeNull();
      const letta = frequencyToPitch(result!.frequencyHz);
      expect({ midi, nota: noteNameIt(letta!.midi) }).toEqual({ midi, nota: noteNameIt(midi) });
    }
  });

  it('non sbaglia ottava su un timbro con la seconda armonica piu forte della fondamentale', () => {
    // E' l'errore classico: rispondere 523 Hz (DO5) invece di 261 (DO4).
    for (const midi of [48, 55, 60, 64, 67]) {
      const result = detectPitch(pianoLike(midiToFrequency(midi), 4096), { sampleRate: SAMPLE_RATE });
      expect(result).not.toBeNull();
      expect({ midi, letto: frequencyToPitch(result!.frequencyHz)!.midi }).toEqual({ midi, letto: midi });
    }
  });

  it('regge il rumore di fondo di una stanza normale', () => {
    const segnale = withNoise(pianoLike(midiToFrequency(60), 4096), 0.05);
    const result = detectPitch(segnale, { sampleRate: SAMPLE_RATE });
    expect(result).not.toBeNull();
    expect(frequencyToPitch(result!.frequencyHz)!.midi).toBe(60);
  });

  it('non inventa note nel silenzio', () => {
    expect(detectPitch(new Float32Array(2048), { sampleRate: SAMPLE_RATE })).toBeNull();
  });

  it('non inventa note sul fruscio del microfono', () => {
    expect(detectPitch(withNoise(new Float32Array(4096), 0.004), { sampleRate: SAMPLE_RATE })).toBeNull();
  });

  it('dichiara bassa la chiarezza sul rumore forte, cosi il chiamante puo scartarlo', () => {
    const result = detectPitch(withNoise(new Float32Array(4096), 0.6, 7), { sampleRate: SAMPLE_RATE });
    // Puo' rispondere qualcosa, ma non deve spacciarlo per una nota certa.
    if (result) expect(result.clarity).toBeLessThan(0.9);
  });

  it('non restituisce mai una frequenza fuori dall estensione richiesta', () => {
    // LIMITE NOTO, verificato qui invece che nascosto: un suono PURO
    // sopra il limite di ricerca viene letto come una sua sottoarmonica
    // (8000 Hz -> ~4000 Hz). E' inevitabile con qualunque metodo basato
    // sull'autocorrelazione: sopra il limite, f e f/2 sono
    // indistinguibili. Cio' che il rilevatore garantisce e' di non
    // uscire dall'intervallo dichiarato; a scartare le letture fuori dal
    // brano pensa il tracciatore di note (opzione midiRange).
    const result = detectPitch(sine(8000, 4096), { sampleRate: SAMPLE_RATE, maxFrequencyHz: 4200 });
    if (result) {
      expect(result.frequencyHz).toBeLessThanOrEqual(4200);
      expect(result.frequencyHz).toBeGreaterThanOrEqual(27.5);
    }
  });

  it('funziona anche a 22 kHz, per i dispositivi che campionano piu basso', () => {
    const result = detectPitch(sine(440, 2048, 0.5, 22_050), { sampleRate: 22_050 });
    expect(result).not.toBeNull();
    expect(centsError(result!.frequencyHz, 440)).toBeLessThan(5);
  });

  it('misura l ampiezza efficace', () => {
    // Il valore efficace di una sinusoide e' l'ampiezza diviso radice di 2.
    expect(rootMeanSquare(sine(440, 4096, 1))).toBeCloseTo(1 / Math.SQRT2, 2);
    expect(rootMeanSquare(new Float32Array(512))).toBe(0);
  });

  it('resta abbastanza veloce per il tempo reale', () => {
    // A 44.1 kHz un blocco da 2048 campioni dura 46 ms: l'analisi deve
    // costare molto meno, altrimenti l'audio va in accumulo.
    const buffer = pianoLike(261.63, 2048);
    const inizio = Date.now();
    for (let i = 0; i < 50; i++) detectPitch(buffer, { sampleRate: SAMPLE_RATE });
    expect((Date.now() - inizio) / 50).toBeLessThan(46);
  });
});
