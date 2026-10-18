import type { MatcherSnapshot } from '../engine/matcher';

/**
 * Dal conteggio grezzo al voto.
 *
 * Tre grandezze distinte, perche' rispondono a tre domande diverse che
 * l'allievo si pone davvero:
 *
 *  PRECISIONE  ho preso le note giuste?
 *  TEMPO       sono andato a tempo o ho anticipato/ritardato?
 *  RITMO       sono stato COSTANTE?
 *
 * Tempo e ritmo non sono la stessa cosa, ed e' importante separarli.
 * Chi suona sistematicamente 60 ms indietro ma con regolarita' e' molto
 * piu' avanti di chi ha una media perfetta perche' meta' note sono in
 * anticipo e meta' in ritardo. Il primo deve solo spostarsi; il secondo
 * non ha ancora il tempo interno. Un punteggio unico li confonderebbe.
 */

export interface ScoreBreakdown {
  /** Note giuste sul totale atteso. */
  accuracyPct: number;
  /** Regolarita': quanto sono uniformi gli scarti. */
  rhythmPct: number;
  /** Aderenza: quanto sono piccoli gli scarti. */
  timingPct: number;
  /** Quanta parte dell'esercizio e' stata affrontata. */
  completionPct: number;
  /** 0..100 */
  score: number;
  stars: 0 | 1 | 2 | 3 | 4 | 5;
  notesExpected: number;
  notesCorrect: number;
  notesWrong: number;
  notesMissed: number;
  notesExtra: number;
  /** Positivo = tendenza a ritardare; negativo = ad anticipare. */
  averageDeviationMs: number;
  deviationSpreadMs: number;
}

export interface ScoreOptions {
  /** Finestra di tolleranza usata: il voto dipende dalla modalita'. */
  toleranceMs: number;
}

const WEIGHT_ACCURACY = 0.55;
const WEIGHT_TIMING = 0.25;
const WEIGHT_RHYTHM = 0.2;
/** Tetto della penalita' per note sbagliate o di troppo. */
const MAX_ERROR_PENALTY = 20;

export function computeScore(snapshot: MatcherSnapshot, options: ScoreOptions): ScoreBreakdown {
  const { expected, correct, wrong, missed, extra, deviations } = snapshot;
  const tolerance = Math.max(1, options.toleranceMs);

  const accuracyPct = expected === 0 ? 0 : (correct / expected) * 100;

  const averageDeviationMs = mean(deviations);
  const meanAbsolute = mean(deviations.map(Math.abs));
  const deviationSpreadMs = standardDeviation(deviations);

  // Aderenza: 100 se si e' esattamente sul tempo, 0 al bordo della finestra.
  const timingPct = deviations.length === 0 ? 0 : clampPct((1 - meanAbsolute / tolerance) * 100);

  // Regolarita': si tollera una dispersione fino a tre quarti della
  // finestra prima di azzerare il voto.
  const rhythmPct =
    deviations.length < 2 ? timingPct : clampPct((1 - deviationSpreadMs / (tolerance * 0.75)) * 100);

  const judged = correct + missed;
  const completionPct = expected === 0 ? 0 : clampPct((judged / expected) * 100);

  const errorRate = expected === 0 ? 0 : (wrong + extra) / expected;
  const penalty = Math.min(MAX_ERROR_PENALTY, Math.round(errorRate * MAX_ERROR_PENALTY));

  // Tempo e ritmo si misurano solo sulle note effettivamente suonate:
  // vanno quindi pesati per quante ne sono state prese. Senza questo
  // fattore, chi suona una nota su quattro in modo perfetto prenderebbe
  // il massimo in due categorie su tre e chiuderebbe con 59/100.
  // Con il fattore, chi suona benissimo il 25% del brano prende 25.
  const coverage = expected === 0 ? 0 : correct / expected;
  const weighted =
    accuracyPct * WEIGHT_ACCURACY +
    coverage * (timingPct * WEIGHT_TIMING + rhythmPct * WEIGHT_RHYTHM);

  const score = Math.round(clampPct(weighted - penalty));

  return {
    accuracyPct: round1(accuracyPct),
    rhythmPct: round1(rhythmPct),
    timingPct: round1(timingPct),
    completionPct: round1(completionPct),
    score,
    stars: starsForScore(score),
    notesExpected: expected,
    notesCorrect: correct,
    notesWrong: wrong,
    notesMissed: missed,
    notesExtra: extra,
    averageDeviationMs: round1(averageDeviationMs),
    deviationSpreadMs: round1(deviationSpreadMs),
  };
}

export function starsForScore(score: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (score >= 95) return 5;
  if (score >= 85) return 4;
  if (score >= 70) return 3;
  if (score >= 55) return 2;
  if (score >= 35) return 1;
  return 0;
}

/** Etichetta breve mostrata accanto al voto. */
export function scoreLabelIt(score: number): string {
  if (score >= 95) return 'Perfetto';
  if (score >= 85) return 'Ottimo';
  if (score >= 70) return 'Buono';
  if (score >= 55) return 'Ci siamo quasi';
  if (score >= 35) return 'Da riprendere';
  return 'Riproviamo';
}

/** Come sta andando l'utente rispetto al tempo, detto a parole. */
export function timingTendencyIt(averageDeviationMs: number): string {
  if (averageDeviationMs > 45) return 'Tendi ad arrivare in ritardo';
  if (averageDeviationMs < -45) return 'Tendi ad anticipare';
  return 'Sei sul tempo';
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length);
}

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
