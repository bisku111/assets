/**
 * Rilevamento dell'altezza con l'algoritmo YIN
 * (de Cheveigne & Kawahara, 2002).
 *
 * Perche' YIN e non la FFT: la trasformata dice quali frequenze sono
 * presenti, non quale sia la FONDAMENTALE. Su un pianoforte la prima
 * armonica e' spesso piu' forte della fondamentale, e un rilevatore
 * basato sul picco dello spettro risponde "un'ottava sopra". YIN lavora
 * nel dominio del tempo sull'autocorrelazione normalizzata ed e' molto
 * piu' robusto proprio all'errore di ottava.
 *
 * LIMITE DICHIARATO: YIN e' MONOFONICO. Su un accordo restituisce una
 * sola altezza, tipicamente la nota piu' forte. Non e' un difetto
 * dell'implementazione, e' la natura dell'algoritmo. Per questo la
 * sorgente microfono si dichiara `polyphonic: false` e l'app consiglia
 * il MIDI a chi vuole studiare gli accordi.
 */

export interface PitchResult {
  frequencyHz: number;
  /** 0..1: quanto il segnale e' periodico. Sotto 0.5 e' rumore. */
  clarity: number;
  /** Ampiezza efficace del blocco analizzato. */
  rms: number;
}

export interface YinOptions {
  sampleRate: number;
  /** Soglia YIN: piu' bassa = piu' selettiva. 0.10-0.15 e' l'intervallo utile. */
  threshold?: number;
  /** Sotto questa ampiezza si considera silenzio e non si tenta il calcolo. */
  rmsThreshold?: number;
  /** Estensione utile: un pianoforte 88 tasti va da ~27.5 a ~4186 Hz. */
  minFrequencyHz?: number;
  maxFrequencyHz?: number;
}

export function rootMeanSquare(buffer: Float32Array | number[]): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = buffer[i] as number;
    sum += v * v;
  }
  return Math.sqrt(sum / Math.max(1, buffer.length));
}

export function detectPitch(buffer: Float32Array | number[], options: YinOptions): PitchResult | null {
  const {
    sampleRate,
    threshold = 0.12,
    rmsThreshold = 0.008,
    minFrequencyHz = 27.5,
    maxFrequencyHz = 4200,
  } = options;

  const rms = rootMeanSquare(buffer);
  // Porta sul rumore: senza, in una stanza silenziosa il rilevatore
  // "sentirebbe" note continuamente sul fruscio del microfono.
  if (rms < rmsThreshold) return null;

  const halfLength = Math.floor(buffer.length / 2);
  const minTau = Math.max(2, Math.floor(sampleRate / maxFrequencyHz));
  const maxTau = Math.min(halfLength - 1, Math.floor(sampleRate / minFrequencyHz));
  if (maxTau <= minTau) return null;

  // --- Passo 1: funzione di differenza --------------------------------
  const difference = new Float32Array(maxTau + 1);
  for (let tau = minTau; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < halfLength; i++) {
      const delta = (buffer[i] as number) - (buffer[i + tau] as number);
      sum += delta * delta;
    }
    difference[tau] = sum;
  }

  // --- Passo 2: differenza media cumulativa normalizzata --------------
  // E' il passo che distingue YIN da una semplice autocorrelazione:
  // toglie la tendenza a preferire tau piccoli, cioe' le ottave alte.
  const normalized = new Float32Array(maxTau + 1);
  normalized[0] = 1;
  let runningSum = 0;
  for (let tau = minTau; tau <= maxTau; tau++) {
    runningSum += difference[tau] as number;
    normalized[tau] = runningSum === 0 ? 1 : ((difference[tau] as number) * (tau - minTau + 1)) / runningSum;
  }

  // --- Passo 3: prima valle sotto soglia ------------------------------
  // Si prende la PRIMA, non la minima assoluta: la minima assoluta cade
  // spesso su un multiplo del periodo, cioe' un'ottava sotto.
  let tauEstimate = -1;
  for (let tau = minTau + 1; tau <= maxTau; tau++) {
    if ((normalized[tau] as number) < threshold) {
      while (tau + 1 <= maxTau && (normalized[tau + 1] as number) < (normalized[tau] as number)) tau++;
      tauEstimate = tau;
      break;
    }
  }

  if (tauEstimate === -1) {
    // Nessuna valle sotto soglia: si prende il minimo assoluto, ma la
    // chiarezza sara' bassa e il chiamante potra' scartarlo.
    let best = minTau;
    for (let tau = minTau + 1; tau <= maxTau; tau++) {
      if ((normalized[tau] as number) < (normalized[best] as number)) best = tau;
    }
    tauEstimate = best;
  }

  // --- Passo 4: interpolazione parabolica -----------------------------
  // Senza, la risoluzione sarebbe limitata dal passo di campionamento:
  // a 44.1 kHz, sul LA4, l'errore arriverebbe a diversi cent.
  const refinedTau = parabolicRefine(normalized, tauEstimate, minTau, maxTau);
  const frequencyHz = sampleRate / refinedTau;
  if (frequencyHz < minFrequencyHz || frequencyHz > maxFrequencyHz) return null;

  const clarity = Math.max(0, Math.min(1, 1 - (normalized[tauEstimate] as number)));
  return { frequencyHz, clarity, rms };
}

function parabolicRefine(values: Float32Array, tau: number, minTau: number, maxTau: number): number {
  if (tau <= minTau || tau >= maxTau) return tau;
  const previous = values[tau - 1] as number;
  const current = values[tau] as number;
  const next = values[tau + 1] as number;
  const denominator = 2 * (2 * current - next - previous);
  if (denominator === 0) return tau;
  const adjustment = (next - previous) / denominator;
  // Un aggiustamento oltre mezzo campione significherebbe che il minimo
  // non e' quello: meglio non fidarsi.
  return Math.abs(adjustment) > 1 ? tau : tau + adjustment;
}
