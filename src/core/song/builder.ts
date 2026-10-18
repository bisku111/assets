import { parseNoteName } from '../music/note';
import type {
  DifficultyKey, Hand, Song, SongArrangement, SongChord, SongLicense, SongNote, SongSection,
} from './types';

/**
 * Notazione compatta per scrivere i contenuti.
 *
 * Scrivere le note una per una in JSON è lento e pieno di errori: un
 * brano di tre minuti sono migliaia di righe in cui basta un numero
 * sbagliato per rompere la sincronizzazione. Questa notazione descrive la
 * musica come la si legge, e i millisecondi li calcola il codice.
 *
 * Grammatica di un token (separati da spazi):
 *
 *   DO4              nota, durata 1 movimento
 *   DO4:2            nota da 2 movimenti
 *   DO4:0.5          croma
 *   DO4+MI4+SOL4:2   accordo (le note partono insieme)
 *   -:2              pausa di 2 movimenti
 *   DO4:1@1          nota con diteggiatura (1 = pollice)
 *   DO3@5+SOL3@1     accordo con un dito diverso per ogni nota
 *   DO4~:4 / DO4:4~  nota tenuta oltre il proprio valore (pedale)
 *
 * I nomi accettati sono sia italiani (DO RE MI FA SOL LA SI) sia
 * anglosassoni (C D E F G A B), con # e b.
 */

export interface VoiceOptions {
  hand: Hand;
  bpm: number;
  /** Movimento di partenza (0 = inizio del brano). */
  startBeat?: number;
  sectionId?: string;
  /** Moltiplicatore di durata: lascia un minimo stacco fra le note. */
  legato?: number;
  velocity?: number;
}

export class NotationError extends Error {
  constructor(token: string, reason: string) {
    super(`token "${token}": ${reason}`);
    this.name = 'NotationError';
  }
}

// Una nota: nome, eventuale alterazione, ottava, e la sua diteggiatura.
const PITCH = String.raw`[A-Za-z]+[#b]?-?\d+(?:@[1-5])?`;

/**
 * Un token completo.
 *
 * Il gruppo delle altezze è scritto per esteso e non come "tutto
 * quello che non è due punti": così `DO3@5+SOL3@1` si legge come due
 * note con due dita, senza che l'ultimo @1 possa essere scambiato per
 * la diteggiatura dell'intero accordo.
 *
 * La legatura (~) è accettata sia prima sia dopo la durata: chi scrive
 * contenuti non deve ricordare un ordine arbitrario.
 */
const TOKEN_RE = new RegExp(
  `^(${PITCH}(?:\\+${PITCH})*|-)(~?)(?::(\\d+(?:\\.\\d+)?))?(~?)(?:@([1-5]))?$`,
);

interface ParsedVoice {
  notes: SongNote[];
  /** Movimenti totali occupati dalla voce. */
  lengthBeats: number;
}

export function parseVoice(spec: string, options: VoiceOptions): ParsedVoice {
  const { hand, bpm, startBeat = 0, sectionId, legato = 0.94, velocity } = options;
  const msPerBeat = 60_000 / bpm;
  const notes: SongNote[] = [];

  let beat = startBeat;
  for (const token of spec.trim().split(/\s+/).filter(Boolean)) {
    const match = TOKEN_RE.exec(token);
    if (!match) throw new NotationError(token, 'formato non riconosciuto');

    const [, pitches, tieBefore, rawDuration, tieAfter, rawFinger] = match as unknown as [
      string, string, string, string | undefined, string, string | undefined,
    ];
    const tie = tieBefore === '~' || tieAfter === '~';
    const durationBeats = rawDuration === undefined ? 1 : Number.parseFloat(rawDuration);
    if (!(durationBeats > 0)) throw new NotationError(token, 'durata non valida');

    if (pitches !== '-') {
      // Una nota "tenuta" dura più del suo valore ritmico: è il modo di
      // scrivere il pedale senza inventare un altro concetto.
      const sustainFactor = tie ? 1.6 : legato;
      for (const parte of pitches.split('+')) {
        // La diteggiatura della singola nota vince su quella scritta
        // per tutto il token: `DO4+MI4@3` dà il dito 3 a entrambe,
        // `DO4@1+MI4@3` dà a ciascuna il suo.
        const [pitchText, fingerText] = parte.split('@') as [string, string | undefined];
        const midi = parseNoteName(pitchText);
        if (midi === null) throw new NotationError(token, `nota sconosciuta "${pitchText}"`);

        const note: SongNote = {
          midi,
          startMs: Math.round(beat * msPerBeat),
          durationMs: Math.max(60, Math.round(durationBeats * msPerBeat * sustainFactor)),
          hand,
        };
        const finger = fingerText ?? rawFinger;
        if (finger) note.finger = Number.parseInt(finger, 10);
        if (sectionId) note.sectionId = sectionId;
        if (velocity !== undefined) note.velocity = velocity;
        notes.push(note);
      }
    }

    beat += durationBeats;
  }

  return { notes, lengthBeats: beat - startBeat };
}

// ---------------------------------------------------------------------
// Composizione di un brano completo
// ---------------------------------------------------------------------

export interface SectionDef {
  id: string;
  kind: SongSection['kind'];
  name: string;
  loopRecommended?: boolean;
  /** Mano destra, notazione compatta. */
  right: string;
  /** Mano sinistra. Assente = sezione per sola mano destra. */
  left?: string;
  /** Simboli degli accordi, uno per battuta. */
  chords?: string[];
}

export interface ArrangementDef {
  difficulty: DifficultyKey;
  suggestedStartRate?: number;
  sections: SectionDef[];
}

export interface SongDef {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  artistId: string;
  artistName: string;
  coverColors: [string, string];
  bpm: number;
  keySignature: string;
  timeSignature?: [number, number];
  isFree: boolean;
  tags?: string[];
  license: SongLicense;
  arrangements: ArrangementDef[];
}

/**
 * Costruisce il brano risolvendo i tempi.
 *
 * Le sezioni sono consecutive: la lunghezza di ciascuna è quella della
 * voce più lunga, arrotondata alla battuta successiva. Arrotondare alla
 * battuta non è un dettaglio estetico: ripetere in loop una sezione che
 * finisce a metà battuta suona sbagliato.
 */
export function buildSong(def: SongDef): Song {
  const timeSignature = def.timeSignature ?? [4, 4];
  const beatsPerBar = timeSignature[0] * (4 / timeSignature[1]);
  const msPerBeat = 60_000 / def.bpm;

  const arrangements: SongArrangement[] = def.arrangements.map((arrangementDef) => {
    const sections: SongSection[] = [];
    const notes: SongNote[] = [];
    const chords: SongChord[] = [];
    const hands = new Set<Hand>();

    let cursorBeat = 0;

    for (const sectionDef of arrangementDef.sections) {
      const right = parseVoice(sectionDef.right, {
        hand: 'right', bpm: def.bpm, startBeat: cursorBeat, sectionId: sectionDef.id,
      });
      const left = sectionDef.left
        ? parseVoice(sectionDef.left, {
            hand: 'left', bpm: def.bpm, startBeat: cursorBeat, sectionId: sectionDef.id, velocity: 0.65,
          })
        : { notes: [] as SongNote[], lengthBeats: 0 };

      if (right.notes.length > 0) hands.add('right');
      if (left.notes.length > 0) hands.add('left');

      const rawLength = Math.max(right.lengthBeats, left.lengthBeats);
      if (rawLength <= 0) throw new Error(`sezione "${sectionDef.id}" di ${def.slug}: nessuna nota`);
      const lengthBeats = Math.ceil(rawLength / beatsPerBar) * beatsPerBar;

      sections.push({
        id: sectionDef.id,
        kind: sectionDef.kind,
        name: sectionDef.name,
        startMs: Math.round(cursorBeat * msPerBeat),
        endMs: Math.round((cursorBeat + lengthBeats) * msPerBeat),
        ...(sectionDef.loopRecommended ? { loopRecommended: true } : {}),
      });

      notes.push(...right.notes, ...left.notes);

      if (sectionDef.chords) {
        sectionDef.chords.forEach((symbol, barIndex) => {
          if (!symbol) return;
          chords.push({
            symbol,
            startMs: Math.round((cursorBeat + barIndex * beatsPerBar) * msPerBeat),
            durationMs: Math.round(beatsPerBar * msPerBeat),
          });
        });
      }

      cursorBeat += lengthBeats;
    }

    // Il matcher e il renderer assumono note ordinate per attacco.
    notes.sort((a, b) => a.startMs - b.startMs || a.midi - b.midi);

    const lastSectionEnd = sections[sections.length - 1]?.endMs ?? 0;
    const lastNoteEnd = notes.reduce((max, n) => Math.max(max, n.startMs + n.durationMs), 0);

    return {
      id: `${def.id}--${arrangementDef.difficulty}`,
      difficulty: arrangementDef.difficulty,
      hands: (['right', 'left'] as Hand[]).filter((h) => hands.has(h)),
      suggestedStartRate: arrangementDef.suggestedStartRate ?? 0.7,
      durationMs: Math.max(lastSectionEnd, lastNoteEnd),
      sections,
      notes,
      chords,
    };
  });

  // La durata del brano è quella del suo arrangiamento più lungo.
  const durationMs = Math.max(...arrangements.map((a) => a.durationMs));

  const song: Song = {
    schemaVersion: 1,
    id: def.id,
    slug: def.slug,
    title: def.title,
    artistId: def.artistId,
    artistName: def.artistName,
    coverColors: def.coverColors,
    bpm: def.bpm,
    keySignature: def.keySignature,
    timeSignature,
    durationMs,
    baseDifficulty: def.arrangements[0]?.difficulty ?? 'beginner',
    isFree: def.isFree,
    tags: def.tags ?? [],
    license: def.license,
    arrangements,
  };
  if (def.subtitle) song.subtitle = def.subtitle;
  return song;
}
