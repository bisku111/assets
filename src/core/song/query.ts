import {
  DIFFICULTY_ORDER, type DifficultyKey, type Hand, type Song,
  type SongArrangement, type SongNote, type SongSection,
} from './types';

/** Interrogazioni sul brano usate dal player. Tutte pure. */

export function findArrangement(song: Song, difficulty: DifficultyKey): SongArrangement | null {
  return song.arrangements.find((a) => a.difficulty === difficulty) ?? null;
}

/** L'arrangiamento della difficolta' richiesta, o il piu' vicino disponibile. */
export function resolveArrangement(song: Song, preferred: DifficultyKey): SongArrangement | null {
  const exact = findArrangement(song, preferred);
  if (exact) return exact;
  if (song.arrangements.length === 0) return null;

  const wanted = DIFFICULTY_ORDER.indexOf(preferred);
  return [...song.arrangements].sort(
    (a, b) =>
      Math.abs(DIFFICULTY_ORDER.indexOf(a.difficulty) - wanted) -
      Math.abs(DIFFICULTY_ORDER.indexOf(b.difficulty) - wanted),
  )[0] as SongArrangement;
}

export function availableDifficulties(song: Song): DifficultyKey[] {
  return DIFFICULTY_ORDER.filter((d) => song.arrangements.some((a) => a.difficulty === d));
}

export function sectionAt(arrangement: SongArrangement, positionMs: number): SongSection | null {
  return arrangement.sections.find((s) => positionMs >= s.startMs && positionMs < s.endMs) ?? null;
}

export function sectionById(arrangement: SongArrangement, id: string): SongSection | null {
  return arrangement.sections.find((s) => s.id === id) ?? null;
}

export interface NoteFilter {
  hands?: Hand[];
  sectionId?: string | null;
}

export function filterNotes(arrangement: SongArrangement, filter: NoteFilter = {}): SongNote[] {
  const section = filter.sectionId ? sectionById(arrangement, filter.sectionId) : null;
  return arrangement.notes.filter((note) => {
    if (filter.hands && !filter.hands.includes(note.hand)) return false;
    if (section && (note.startMs < section.startMs || note.startMs >= section.endMs)) return false;
    return true;
  });
}

/** Note che suonano (sono premute) in un dato istante. */
export function notesSoundingAt(notes: SongNote[], positionMs: number): SongNote[] {
  return notes.filter((n) => positionMs >= n.startMs && positionMs < n.startMs + n.durationMs);
}

/** Estensione richiesta dal brano, per dimensionare la tastiera a schermo. */
export function midiRange(notes: SongNote[]): { min: number; max: number } | null {
  if (notes.length === 0) return null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const note of notes) {
    if (note.midi < min) min = note.midi;
    if (note.midi > max) max = note.midi;
  }
  return { min, max };
}

/** Durata di una battuta in millisecondi. */
export function barDurationMs(bpm: number, timeSignature: [number, number]): number {
  const [beats, unit] = timeSignature;
  return (60_000 / bpm) * (4 / unit) * beats;
}

export function beatDurationMs(bpm: number): number {
  return 60_000 / bpm;
}

/** Formatta una durata come m:ss, per la barra di avanzamento. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${`${total % 60}`.padStart(2, '0')}`;
}
