import { isBlackKey, whiteKeyIndex } from './note';

/**
 * Geometria della tastiera, in frazioni di larghezza (0..1).
 *
 * Sta nel core e non nella UI perché tre componenti diversi devono
 * essere d'accordo al pixel: i tasti, le note che scendono e le mani
 * sovrapposte. Se ognuno ricalcolasse le posizioni per conto suo, un
 * dito finirebbe accanto al tasto che indica, e un aiuto visivo
 * disallineato è peggio di nessun aiuto.
 */

export interface KeyBox {
  midi: number;
  black: boolean;
  /** Bordo sinistro, 0..1. */
  left: number;
  width: number;
  /** Centro orizzontale, 0..1: il punto a cui puntare un dito. */
  center: number;
}

export interface KeyboardGeometry {
  /** Primo e ultimo tasto effettivamente disegnati (sempre bianchi). */
  start: number;
  end: number;
  whites: readonly number[];
  blacks: readonly { midi: number; afterWhiteIndex: number }[];
  /** Larghezza di un tasto bianco, in frazione di tastiera. */
  whiteWidth: number;
  keys: readonly KeyBox[];
  box(midi: number): KeyBox | undefined;
}

/**
 * Proporzioni di un tasto nero rispetto al bianco. Non sono inventate:
 * su un pianoforte vero il nero è circa due terzi del bianco e sta a
 * cavallo fra due bianchi, ed è quella proporzione che l'allievo si
 * porta allo strumento.
 */
const BLACK_WIDTH_RATIO = 0.64;
const BLACK_OFFSET_RATIO = 0.32;

export function keyboardGeometry(fromMidi: number, toMidi: number): KeyboardGeometry {
  // Si parte e si finisce su un bianco: un nero al bordo resterebbe
  // sospeso nel vuoto, senza i bianchi su cui si appoggia.
  let start = Math.max(0, Math.min(127, fromMidi));
  while (start > 0 && isBlackKey(start)) start -= 1;
  let end = Math.max(start, Math.min(127, toMidi));
  while (end < 127 && isBlackKey(end)) end += 1;

  const whites: number[] = [];
  const blacks: { midi: number; afterWhiteIndex: number }[] = [];
  for (let midi = start; midi <= end; midi++) {
    if (isBlackKey(midi)) {
      blacks.push({ midi, afterWhiteIndex: whiteKeyIndex(midi - 1) - whiteKeyIndex(start) });
    } else {
      whites.push(midi);
    }
  }

  const whiteWidth = 1 / Math.max(1, whites.length);
  const byMidi = new Map<number, KeyBox>();
  const keys: KeyBox[] = [];

  whites.forEach((midi, index) => {
    const box: KeyBox = {
      midi, black: false,
      left: index * whiteWidth,
      width: whiteWidth,
      center: (index + 0.5) * whiteWidth,
    };
    keys.push(box);
    byMidi.set(midi, box);
  });

  for (const { midi, afterWhiteIndex } of blacks) {
    const width = whiteWidth * BLACK_WIDTH_RATIO;
    const left = (afterWhiteIndex + 1) * whiteWidth - whiteWidth * BLACK_OFFSET_RATIO;
    const box: KeyBox = { midi, black: true, left, width, center: left + width / 2 };
    keys.push(box);
    byMidi.set(midi, box);
  }

  return {
    start, end, whites, blacks, whiteWidth, keys,
    box: (midi: number) => byMidi.get(midi),
  };
}
