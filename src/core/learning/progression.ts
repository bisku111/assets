import type { Hand, SongArrangement, SongSection } from '../song/types';

/**
 * Percorso di studio a sezioni.
 *
 * Nessuno impara un brano suonandolo dall'inizio alla fine venti volte:
 * si isola la parte difficile, la si rallenta, la si ripete finche' non
 * viene, poi si accelera. Questo modulo mette quel metodo in codice.
 *
 * La scala delle velocita' e' 50 → 60 → 70 → 80 → 90 → 100.
 */

export const RATE_LADDER = [50, 60, 70, 80, 90, 100] as const;
export type RatePct = (typeof RATE_LADDER)[number];

/** Punteggio minimo per considerare superato uno scalino di velocita'. */
export const PASS_SCORE = 85;
/** Sotto questa soglia conviene rallentare invece di insistere. */
export const STRUGGLE_SCORE = 55;

export function nextRate(current: number): RatePct {
  const index = closestRateIndex(current);
  return RATE_LADDER[Math.min(index + 1, RATE_LADDER.length - 1)] as RatePct;
}

export function previousRate(current: number): RatePct {
  const index = closestRateIndex(current);
  return RATE_LADDER[Math.max(index - 1, 0)] as RatePct;
}

export function isTopRate(current: number): boolean {
  return closestRateIndex(current) === RATE_LADDER.length - 1;
}

function closestRateIndex(current: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  RATE_LADDER.forEach((rate, index) => {
    const distance = Math.abs(rate - current);
    if (distance < bestDistance) { best = index; bestDistance = distance; }
  });
  return best;
}

// ---------------------------------------------------------------------
// Stato di avanzamento su un arrangiamento
// ---------------------------------------------------------------------

export interface SectionProgress {
  sectionId: string;
  /** Velocita' massima superata con successo (0 = mai superata). */
  clearedRatePct: number;
  bestScore: number;
  attempts: number;
}

export interface ArrangementProgress {
  arrangementId: string;
  sections: Record<string, SectionProgress>;
}

export function emptyProgress(arrangement: SongArrangement): ArrangementProgress {
  const sections: Record<string, SectionProgress> = {};
  for (const section of arrangement.sections) {
    sections[section.id] = { sectionId: section.id, clearedRatePct: 0, bestScore: 0, attempts: 0 };
  }
  return { arrangementId: arrangement.id, sections };
}

/**
 * Registra il risultato di un tentativo.
 * Ritorna un NUOVO oggetto: lo stato non viene mutato, cosi' la UI puo'
 * confrontare prima e dopo per animare i cambiamenti.
 */
export function recordAttempt(
  progress: ArrangementProgress,
  sectionId: string,
  ratePct: number,
  score: number,
): ArrangementProgress {
  const previous = progress.sections[sectionId] ?? {
    sectionId, clearedRatePct: 0, bestScore: 0, attempts: 0,
  };

  return {
    ...progress,
    sections: {
      ...progress.sections,
      [sectionId]: {
        sectionId,
        attempts: previous.attempts + 1,
        bestScore: Math.max(previous.bestScore, score),
        clearedRatePct:
          score >= PASS_SCORE ? Math.max(previous.clearedRatePct, ratePct) : previous.clearedRatePct,
      },
    },
  };
}

/**
 * Completamento dell'arrangiamento in percentuale.
 * Una sezione superata al 70% vale il 70% di se stessa: e' onesto verso
 * l'utente e verso il senso della parola "completato".
 */
export function completionPct(arrangement: SongArrangement, progress: ArrangementProgress): number {
  if (arrangement.sections.length === 0) return 0;
  const total = arrangement.sections.reduce(
    (sum, section) => sum + Math.min(100, progress.sections[section.id]?.clearedRatePct ?? 0),
    0,
  );
  return Math.round(total / arrangement.sections.length);
}

/** Prossima sezione da studiare: la prima non ancora superata al 100%. */
export function nextSectionToStudy(
  arrangement: SongArrangement,
  progress: ArrangementProgress,
): SongSection | null {
  return arrangement.sections.find((s) => (progress.sections[s.id]?.clearedRatePct ?? 0) < 100) ?? null;
}

/** Velocita' da cui ripartire su una sezione gia' affrontata. */
export function suggestedRateFor(
  arrangement: SongArrangement,
  progress: ArrangementProgress,
  sectionId: string,
): RatePct {
  const cleared = progress.sections[sectionId]?.clearedRatePct ?? 0;
  if (cleared === 0) return Math.round(arrangement.suggestedStartRate * 100) as RatePct;
  return isTopRate(cleared) ? 100 : nextRate(cleared);
}

// ---------------------------------------------------------------------
// Statistiche per mano: servono al maestro per capire quale isolare
// ---------------------------------------------------------------------

export interface HandStats {
  expected: number;
  correct: number;
}

export function handAccuracyPct(stats: HandStats | undefined): number {
  if (!stats || stats.expected === 0) return 100;
  return (stats.correct / stats.expected) * 100;
}

/** La mano nettamente piu' in difficolta', se ce n'e' una. */
export function weakerHand(
  stats: Partial<Record<Hand, HandStats>>,
  minimumGapPct = 20,
): Hand | null {
  if (!stats.right || !stats.left) return null;
  const right = handAccuracyPct(stats.right);
  const left = handAccuracyPct(stats.left);
  if (Math.abs(right - left) < minimumGapPct) return null;
  return right < left ? 'right' : 'left';
}
