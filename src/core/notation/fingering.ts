import type { Hand, SongNote } from '../song/types';

/**
 * Quale dito su quale tasto.
 *
 * È l'unica cosa che l'allievo deve sapere oltre alla nota: premere il
 * DO col pollice o col mignolo cambia tutto il resto della frase. La
 * diteggiatura è scritta nel contenuto nota per nota; qui si decide
 * soltanto QUANDO mostrarla.
 */

export type Finger = 1 | 2 | 3 | 4 | 5;

export interface FingerTarget {
  midi: number;
  finger: Finger;
}

/** Attacchi separati da meno di questo sono lo stesso accordo. */
const CHORD_WINDOW_MS = 40;

/**
 * I tasti che una mano deve preparare adesso.
 *
 * Si guarda al PROSSIMO attacco di quella mano, non a quello in corso:
 * la diteggiatura serve prima di suonare, non dopo. Oltre `withinMs` non
 * si anticipa nulla, altrimenti durante una pausa lunga comparirebbero
 * numeri su tasti che non servono ancora.
 */
export function nextFingerTargets(
  pending: readonly SongNote[],
  hand: Hand,
  positionMs: number,
  withinMs: number,
): FingerTarget[] {
  let primo = Number.POSITIVE_INFINITY;
  for (const note of pending) {
    if (note.hand === hand && note.startMs < primo) primo = note.startMs;
  }
  if (!Number.isFinite(primo) || primo - positionMs > withinMs) return [];

  const targets: FingerTarget[] = [];
  for (const note of pending) {
    if (note.hand !== hand) continue;
    if (note.startMs > primo + CHORD_WINDOW_MS) continue;
    // Senza diteggiatura scritta non si mostra nulla: inventarne una
    // sbagliata è peggio che non darla.
    if (note.finger === undefined) continue;
    targets.push({ midi: note.midi, finger: note.finger as Finger });
  }
  return targets;
}
