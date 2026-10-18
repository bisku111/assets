import type { KeyboardGeometry } from '../music/keyboard';
import type { Hand, SongNote } from '../song/types';

/**
 * Dove mettere le dita sulla tastiera.
 *
 * L'immagine delle mani serve a una cosa sola: far capire CON QUALE
 * DITO si suona un tasto. Perché funzioni, il polpastrello deve stare
 * sopra il tasto giusto, non vicino. Quindi le dita richieste si
 * agganciano al centro esatto del loro tasto, e le altre si dispongono
 * intorno con la spaziatura naturale della mano.
 *
 * Non si inventa una posa quando non c'è niente da suonare: in quel
 * caso non si restituisce nulla e la UI tiene l'ultima posa valida,
 * come fa una mano vera che resta dov'è fra una nota e l'altra.
 */

export type Finger = 1 | 2 | 3 | 4 | 5;
export const FINGERS: readonly Finger[] = [1, 2, 3, 4, 5];

/**
 * Distanza di ogni dito dal bordo esterno della mano, in tasti
 * bianchi. Non sono equidistanti: il pollice è corto e sta più vicino
 * all'indice, il mignolo arriva appena oltre l'anulare.
 */
const SPREAD_RIGHT: Record<Finger, number> = { 1: 0, 2: 1.05, 3: 2.05, 4: 3.0, 5: 3.85 };
const SPREAD_LEFT: Record<Finger, number> = { 5: 0, 4: 0.85, 3: 1.8, 2: 2.8, 1: 3.85 };

function spread(hand: Hand): Record<Finger, number> {
  return hand === 'right' ? SPREAD_RIGHT : SPREAD_LEFT;
}

export interface FingerTarget {
  midi: number;
  finger: Finger;
}

export interface FingerPose {
  finger: Finger;
  /** Centro del polpastrello, 0..1 sulla larghezza della tastiera. */
  x: number;
  /** Tasto che questo dito deve premere adesso, se ce n'è uno. */
  midi: number | null;
  /** Il dito arriva su un tasto nero: si allunga più in alto. */
  black: boolean;
  /** Il brano sta chiedendo questo dito adesso. */
  active: boolean;
}

export interface HandPose {
  hand: Hand;
  fingers: FingerPose[];
  /** Centro della mano, 0..1: serve a posizionare il palmo. */
  center: number;
}

/**
 * Calcola la posa a partire dai tasti richiesti.
 * Restituisce null se non c'è nessun tasto con diteggiatura.
 */
export function handPose(
  hand: Hand,
  targets: readonly FingerTarget[],
  geometry: KeyboardGeometry,
): HandPose | null {
  const distanze = spread(hand);
  const w = geometry.whiteWidth;

  const ancore: { finger: Finger; center: number }[] = [];
  for (const target of targets) {
    const box = geometry.box(target.midi);
    if (box) ancore.push({ finger: target.finger, center: box.center });
  }
  if (ancore.length === 0) return null;

  // Origine della mano: la media delle posizioni che ciascun dito
  // richiesto implica. Con un dito solo è esatta; con più dita è il
  // compromesso che avvicina tutti i polpastrelli ai loro tasti.
  const origine =
    ancore.reduce((somma, a) => somma + (a.center - distanze[a.finger] * w), 0) / ancore.length;

  const larghezzaMano = distanze[hand === 'right' ? 5 : 1] * w;
  // La mano non esce dalla tastiera: un dito disegnato nel vuoto
  // indicherebbe un tasto che non esiste.
  const base = Math.max(0, Math.min(1 - larghezzaMano, origine));

  const perDito = new Map<Finger, number>();
  for (const a of ancore) perDito.set(a.finger, a.center);

  const fingers: FingerPose[] = FINGERS.map((finger) => {
    const richiesto = targets.find((t) => t.finger === finger && geometry.box(t.midi));
    // Il dito richiesto punta al centro del suo tasto, senza
    // approssimazioni: è l'unica informazione che conta davvero.
    const x = richiesto ? (perDito.get(finger) as number) : base + distanze[finger] * w;
    const box = richiesto ? geometry.box(richiesto.midi) : undefined;
    return {
      finger,
      x: Math.max(0, Math.min(1, x)),
      midi: richiesto ? richiesto.midi : null,
      black: box?.black ?? false,
      active: richiesto !== undefined,
    };
  });

  const xs = fingers.map((f) => f.x);
  return { hand, fingers, center: (Math.min(...xs) + Math.max(...xs)) / 2 };
}

/** Attacchi separati da meno di questo sono lo stesso accordo. */
const CHORD_WINDOW_MS = 40;

/**
 * I tasti che una mano deve preparare adesso.
 *
 * Si guarda al PROSSIMO attacco di quella mano, non a quello in corso:
 * la diteggiatura serve prima di suonare, non dopo. Oltre `withinMs` non
 * si anticipa nulla, altrimenti durante una pausa lunga le mani
 * indicherebbero tasti che non servono ancora.
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
    if (note.finger === undefined) continue;
    targets.push({ midi: note.midi, finger: note.finger as Finger });
  }
  return targets;
}
