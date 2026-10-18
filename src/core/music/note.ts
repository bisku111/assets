/**
 * Teoria musicale di base. TypeScript puro: nessuna dipendenza da React/RN.
 *
 * Convenzione MIDI standard: 60 = DO centrale (C4), A4 = 69 = 440 Hz.
 * L'intervallo utile di un pianoforte 88 tasti è 21 (A0) .. 108 (C8).
 */

export const MIDI_MIN = 21;
export const MIDI_MAX = 108;
export const MIDI_MIDDLE_C = 60;
export const A4_MIDI = 69;
export const A4_FREQUENCY_HZ = 440;

/** Nomi anglosassoni, indicizzati per pitch class (0 = C). */
const NAMES_EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** Nomi italiani: quello che l'utente legge a schermo. */
const NAMES_IT = ['DO', 'DO#', 'RE', 'RE#', 'MI', 'FA', 'FA#', 'SOL', 'SOL#', 'LA', 'LA#', 'SI'] as const;

/** Pitch class dei tasti neri. */
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export function isValidMidi(midi: number): boolean {
  return Number.isInteger(midi) && midi >= 0 && midi <= 127;
}

export function isOnPiano88(midi: number): boolean {
  return Number.isInteger(midi) && midi >= MIDI_MIN && midi <= MIDI_MAX;
}

export function pitchClass(midi: number): PitchClass {
  return (((midi % 12) + 12) % 12) as PitchClass;
}

/** Ottava secondo la convenzione scientifica: C4 = 60. */
export function octaveOf(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

export function isBlackKey(midi: number): boolean {
  return BLACK_PITCH_CLASSES.has(pitchClass(midi));
}

export function isWhiteKey(midi: number): boolean {
  return !isBlackKey(midi);
}

/** Es. 60 -> "DO4". Con `withOctave = false` -> "DO". */
export function noteNameIt(midi: number, withOctave = true): string {
  const name = NAMES_IT[pitchClass(midi)] as string;
  return withOctave ? `${name}${octaveOf(midi)}` : name;
}

/** Es. 60 -> "C4". */
export function noteNameEn(midi: number, withOctave = true): string {
  const name = NAMES_EN[pitchClass(midi)] as string;
  return withOctave ? `${name}${octaveOf(midi)}` : name;
}

/** Frequenza in Hz del temperamento equabile. */
export function midiToFrequency(midi: number, a4Hz: number = A4_FREQUENCY_HZ): number {
  return a4Hz * Math.pow(2, (midi - A4_MIDI) / 12);
}

/** Nota MIDI (frazionaria) corrispondente a una frequenza. */
export function frequencyToMidiFloat(frequencyHz: number, a4Hz: number = A4_FREQUENCY_HZ): number {
  if (!(frequencyHz > 0)) return Number.NaN;
  return A4_MIDI + 12 * Math.log2(frequencyHz / a4Hz);
}

export interface PitchReading {
  /** Nota MIDI più vicina. */
  midi: number;
  /** Scarto rispetto alla nota temperata, in cent (-50..+50). */
  cents: number;
}

/**
 * Converte una frequenza nella nota più vicina, riportando anche
 * quanto è stonata. `cents` serve al feedback ("sei calante") e a
 * scartare letture ambigue provenienti dal microfono.
 */
export function frequencyToPitch(frequencyHz: number, a4Hz: number = A4_FREQUENCY_HZ): PitchReading | null {
  const exact = frequencyToMidiFloat(frequencyHz, a4Hz);
  if (!Number.isFinite(exact)) return null;
  const midi = Math.round(exact);
  return { midi, cents: (exact - midi) * 100 };
}

/** Parsing di nomi in italiano o inglese: "DO4", "do#4", "C4", "Bb3". */
export function parseNoteName(input: string): number | null {
  const text = input.trim().toUpperCase().replace(/\s+/g, '');
  const match = /^([A-G]|DO|RE|MI|FA|SOL|LA|SI)([#B]?)(-?\d+)$/.exec(text);
  if (!match) return null;
  const [, rawName, accidental, rawOctave] = match as unknown as [string, string, string, string];

  let base = NAMES_IT.indexOf(rawName as (typeof NAMES_IT)[number]);
  if (base < 0) base = NAMES_EN.indexOf(rawName as (typeof NAMES_EN)[number]);
  if (base < 0) return null;

  const alteration = accidental === '#' ? 1 : accidental === 'B' ? -1 : 0;
  const octave = Number.parseInt(rawOctave, 10);
  const midi = (octave + 1) * 12 + base + alteration;
  return isValidMidi(midi) ? midi : null;
}

/** Indice progressivo del tasto bianco (0 = DO di ottava -1), per il layout tastiera. */
export function whiteKeyIndex(midi: number): number {
  const whitePerOctave = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  const octave = Math.floor(midi / 12);
  const offset = whitePerOctave[pitchClass(midi)] as number;
  return octave * 7 + offset;
}
