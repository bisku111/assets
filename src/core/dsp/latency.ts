/**
 * Calibrazione della latenza di ingresso.
 *
 * Fra il momento in cui l'utente preme un tasto e il momento in cui
 * l'evento arriva al motore passano da pochi millisecondi (MIDI via USB)
 * a oltre cento (MIDI Bluetooth, o microfono con buffer generosi). Senza
 * compensazione, un allievo perfettamente a tempo verrebbe giudicato
 * sistematicamente in ritardo: e' un errore che distrugge la fiducia
 * nell'app piu' di qualunque difetto grafico.
 *
 * Procedura: l'utente suona una nota su ogni battito di un metronomo.
 * Si misura lo scarto e si prende la MEDIANA, non la media: basta un
 * colpo mancato per spostare una media di decine di millisecondi,
 * mentre la mediana lo ignora.
 */

export interface CalibrationSample {
  /** Momento del battito atteso. */
  expectedMs: number;
  /** Momento in cui l'evento e' stato registrato. */
  actualMs: number;
}

export interface CalibrationResult {
  /** Millisecondi da sottrarre ai timestamp in ingresso. */
  latencyMs: number;
  /** Dispersione dei colpi: alta = calibrazione poco affidabile. */
  spreadMs: number;
  usedSamples: number;
  discardedSamples: number;
  reliable: boolean;
}

/** Colpi oltre questo scarto sono errori, non latenza. */
const OUTLIER_LIMIT_MS = 400;
/** Sopra questa dispersione la calibrazione non e' attendibile. */
const MAX_RELIABLE_SPREAD_MS = 60;
const MIN_SAMPLES = 4;

export function calibrateLatency(samples: CalibrationSample[]): CalibrationResult {
  const deltas = samples
    .map((s) => s.actualMs - s.expectedMs)
    .filter((d) => Number.isFinite(d) && Math.abs(d) <= OUTLIER_LIMIT_MS);

  const discarded = samples.length - deltas.length;

  if (deltas.length < MIN_SAMPLES) {
    return { latencyMs: 0, spreadMs: 0, usedSamples: deltas.length, discardedSamples: discarded, reliable: false };
  }

  const latency = median(deltas);
  // Scarto assoluto mediano: misura di dispersione robusta quanto la mediana.
  const spread = median(deltas.map((d) => Math.abs(d - latency)));

  return {
    latencyMs: Math.round(latency),
    spreadMs: Math.round(spread),
    usedSamples: deltas.length,
    discardedSamples: discarded,
    reliable: spread <= MAX_RELIABLE_SPREAD_MS,
  };
}

/** Latenza tipica per sorgente: valore di partenza prima della calibrazione. */
export const DEFAULT_LATENCY_MS = {
  midi: 10,
  microphone: 60,
  'virtual-keyboard': 0,
} as const;

export function calibrationMessageIt(result: CalibrationResult): string {
  if (!result.reliable && result.usedSamples < MIN_SAMPLES) {
    return 'Non ho registrato abbastanza note. Riproviamo: suona una nota su ogni battito.';
  }
  if (!result.reliable) {
    return `I colpi erano poco regolari (±${result.spreadMs} ms). Puoi riprovare, oppure tenere questo valore e sistemarlo dopo.`;
  }
  if (Math.abs(result.latencyMs) < 15) {
    return 'Il tuo strumento risponde subito: nessuna correzione necessaria.';
  }
  return `Ho misurato ${result.latencyMs} ms di ritardo e li terro' in conto quando ti ascolto.`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}
