import { pitchClass } from '../music/note';
import type { Hand, SongNote } from '../song/types';

/**
 * Da note MIDI a pentagramma.
 *
 * Il MIDI dice "tasto 61" e non "DO# oppure REb": è la tonalità a
 * deciderlo. Qui si fa quella scelta e si calcola la posizione
 * verticale sul rigo. È tutto TypeScript puro: la correttezza della
 * lettura musicale si verifica in Node, senza disegnare un pixel.
 *
 * Unità verticale: `u` = mezzi spazi SOTTO la riga superiore del rigo.
 * u=0 riga superiore, u=1 primo spazio, u=2 seconda riga ... u=8 riga
 * inferiore. Valori negativi o oltre 8 stanno fuori e vogliono i tagli
 * addizionali. Si contano mezzi spazi perché è l'unità in cui le note
 * si muovono davvero: riga, spazio, riga.
 */

export type Clef = 'treble' | 'bass';
export type Accidental = '#' | 'b' | 'n';
export type HeadKind = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth';

/** Lettere diatoniche: 0 = DO .. 6 = SI. */
const LETTER_SEMITONES = [0, 2, 4, 5, 7, 9, 11] as const;
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6] as const; // FA DO SOL RE LA MI SI
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3] as const;  // SI MI LA RE SOL DO FA

const SHARP_KEYS: Record<string, number> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7,
  Am: 0, Em: 1, Bm: 2, 'F#m': 3, 'C#m': 4, 'G#m': 5, 'D#m': 6, 'A#m': 7,
};
const FLAT_KEYS: Record<string, number> = {
  F: 1, Bb: 2, Eb: 3, Ab: 4, Db: 5, Gb: 6, Cb: 7,
  Dm: 1, Gm: 2, Cm: 3, Fm: 4, Bbm: 5, Ebm: 6, Abm: 7,
};

export interface KeySignature {
  kind: 'sharp' | 'flat';
  count: number;
  /** Lettere alterate in armatura (0 = DO .. 6 = SI). */
  letters: readonly number[];
}

/** Armatura di chiave. Una tonalità sconosciuta vale DO maggiore. */
export function keySignatureOf(key: string): KeySignature {
  const testo = key.trim();
  const sharps = SHARP_KEYS[testo];
  if (sharps !== undefined) {
    return { kind: 'sharp', count: sharps, letters: SHARP_ORDER.slice(0, sharps) };
  }
  const flats = FLAT_KEYS[testo];
  if (flats !== undefined) {
    return { kind: 'flat', count: flats, letters: FLAT_ORDER.slice(0, flats) };
  }
  return { kind: 'sharp', count: 0, letters: [] };
}

/** Alterazione che l'armatura applica già a quella lettera. */
function armaturaSu(letter: number, key: KeySignature): number {
  if (!key.letters.includes(letter)) return 0;
  return key.kind === 'sharp' ? 1 : -1;
}

export interface Spelling {
  /** 0 = DO .. 6 = SI. */
  letter: number;
  octave: number;
  /** -1 bemolle, 0 naturale, +1 diesis. */
  alteration: number;
}

/**
 * Sceglie come scrivere la nota.
 *
 * Un tasto nero in tonalità con bemolli si scrive bemolle (SIb, non
 * LA#): scriverlo nell'altro modo è leggibile ma scorretto, e un
 * allievo che legge spartiti veri non lo ritroverebbe.
 */
export function spell(midi: number, key: KeySignature): Spelling {
  const pc = pitchClass(midi);
  const naturale = LETTER_SEMITONES.indexOf(pc as (typeof LETTER_SEMITONES)[number]);
  if (naturale >= 0) {
    return { letter: naturale, octave: Math.floor(midi / 12) - 1, alteration: 0 };
  }

  if (key.kind === 'flat' && key.count > 0) {
    // Bemolle della lettera superiore.
    const sopra = LETTER_SEMITONES.indexOf(((pc + 1) % 12) as (typeof LETTER_SEMITONES)[number]);
    const octave = Math.floor((midi + 1) / 12) - 1;
    return { letter: sopra, octave, alteration: -1 };
  }

  // Diesis della lettera inferiore.
  const sotto = LETTER_SEMITONES.indexOf(((pc + 11) % 12) as (typeof LETTER_SEMITONES)[number]);
  return { letter: sotto, octave: Math.floor((midi - 1) / 12) - 1, alteration: 1 };
}

/** Numero diatonico assoluto: DO4 = 28. Cresce di 1 per ogni lettera. */
export function diatonicIndex(spelling: Spelling): number {
  return spelling.octave * 7 + spelling.letter;
}

/** Riga superiore di ciascuna chiave, in numero diatonico. */
const TOP_LINE: Record<Clef, number> = {
  treble: diatonicIndex({ letter: 3, octave: 5, alteration: 0 }), // FA5
  bass: diatonicIndex({ letter: 5, octave: 3, alteration: 0 }),   // LA3
};

/** Posizione verticale, in mezzi spazi sotto la riga superiore. */
export function stepsBelowTop(spelling: Spelling, clef: Clef): number {
  return TOP_LINE[clef] - diatonicIndex(spelling);
}

/**
 * Tagli addizionali necessari, in unità `u`.
 * Le righe del rigo stanno su u pari da 0 a 8; i tagli continuano la
 * serie fuori dal rigo.
 */
export function ledgerLines(u: number): number[] {
  const righe: number[] = [];
  if (u < 0) for (let y = -2; y >= u; y -= 2) righe.push(y);
  if (u > 8) for (let y = 10; y <= u; y += 2) righe.push(y);
  return righe;
}

// ---------------------------------------------------------------------
// Durate
// ---------------------------------------------------------------------

/**
 * Valori ritmici riconosciuti, in movimenti.
 *
 * Le durate in ms portano il fattore di legato (0.94) o di pedale
 * (1.6) applicato dal compositore: non sono multipli esatti del
 * movimento. Si riporta quindi la durata al valore scritto più
 * vicino, che è quello che va disegnato sul pentagramma.
 */
const VALORI: { beats: number; head: HeadKind; dotted: boolean }[] = [
  { beats: 0.25, head: 'sixteenth', dotted: false },
  { beats: 0.375, head: 'sixteenth', dotted: true },
  { beats: 0.5, head: 'eighth', dotted: false },
  { beats: 0.75, head: 'eighth', dotted: true },
  { beats: 1, head: 'quarter', dotted: false },
  { beats: 1.5, head: 'quarter', dotted: true },
  { beats: 2, head: 'half', dotted: false },
  { beats: 3, head: 'half', dotted: true },
  { beats: 4, head: 'whole', dotted: false },
];

export function rhythmicValue(durationMs: number, msPerBeat: number): { head: HeadKind; dotted: boolean } {
  const beats = durationMs / msPerBeat;
  let migliore = VALORI[VALORI.length - 1] as (typeof VALORI)[number];
  let scarto = Number.POSITIVE_INFINITY;
  for (const valore of VALORI) {
    // Scarto relativo: un errore di 50 ms conta molto su una croma e
    // poco su una semibreve.
    const d = Math.abs(Math.log2(beats / valore.beats));
    if (d < scarto) { scarto = d; migliore = valore; }
  }
  return { head: migliore.head, dotted: migliore.dotted };
}

// ---------------------------------------------------------------------
// Costruzione del rigo
// ---------------------------------------------------------------------

export interface StaffHead {
  /** Indice della nota nell'arrangiamento: lega la testa allo stato del motore. */
  noteIndex: number;
  midi: number;
  u: number;
  accidental: Accidental | null;
  ledger: number[];
  /**
   * Teste a distanza di seconda non entrano nella stessa colonna: una
   * va spostata di una testa a destra. 0 = in colonna, 1 = spostata.
   */
  shifted: boolean;
}

export interface StaffItem {
  startMs: number;
  durationMs: number;
  clef: Clef;
  hand: Hand;
  heads: StaffHead[];
  head: HeadKind;
  dotted: boolean;
  stem: 'up' | 'down';
}

export interface StaffScore {
  items: StaffItem[];
  key: KeySignature;
}

/** Chiave in cui si scrive una mano. */
export function clefForHand(hand: Hand): Clef {
  return hand === 'left' ? 'bass' : 'treble';
}

/**
 * Raggruppa le note in accordi (stesso attacco, stessa mano) e calcola
 * tutto il necessario per disegnarle. Le note arrivano già ordinate per
 * attacco: lo garantisce validateSong().
 */
export function buildStaffScore(
  notes: readonly SongNote[],
  options: { keySignature: string; msPerBeat: number },
): StaffScore {
  const key = keySignatureOf(options.keySignature);
  const gruppi = new Map<string, { startMs: number; hand: Hand; indici: number[] }>();

  notes.forEach((note, index) => {
    const chiave = `${note.startMs}|${note.hand}`;
    const gruppo = gruppi.get(chiave);
    if (gruppo) gruppo.indici.push(index);
    else gruppi.set(chiave, { startMs: note.startMs, hand: note.hand, indici: [index] });
  });

  const items: StaffItem[] = [];

  for (const gruppo of gruppi.values()) {
    const clef = clefForHand(gruppo.hand);
    // Durata dell'accordo: la più breve delle sue note. Disegnare il
    // valore della più lunga farebbe sembrare l'accordo più lento di
    // come va suonato.
    const durationMs = Math.min(...gruppo.indici.map((i) => (notes[i] as SongNote).durationMs));
    const { head, dotted } = rhythmicValue(durationMs, options.msPerBeat);

    const teste: StaffHead[] = gruppo.indici
      .map((noteIndex) => {
        const note = notes[noteIndex] as SongNote;
        const spelling = spell(note.midi, key);
        const u = stepsBelowTop(spelling, clef);
        const atteso = armaturaSu(spelling.letter, key);
        const accidental: Accidental | null =
          spelling.alteration === atteso
            ? null
            : spelling.alteration === 1 ? '#'
            : spelling.alteration === -1 ? 'b'
            : 'n';
        return { noteIndex, midi: note.midi, u, accidental, ledger: ledgerLines(u), shifted: false };
      })
      // Dall'acuto al grave: è l'ordine in cui si leggono le teste.
      .sort((a, b) => a.u - b.u);

    // Due teste a distanza di seconda si toccherebbero: la più grave
    // delle due si sposta a destra del gambo.
    for (let i = 1; i < teste.length; i++) {
      const precedente = teste[i - 1] as StaffHead;
      const corrente = teste[i] as StaffHead;
      if (corrente.u - precedente.u === 1 && !precedente.shifted) corrente.shifted = true;
    }

    // Gambo: in su sotto la riga mediana, in giù sopra. Con più teste
    // decide la più lontana dal centro, come nella scrittura a mano.
    const estremo = teste.reduce((max, t) => (Math.abs(t.u - 4) > Math.abs(max - 4) ? t.u : max), 4);
    items.push({
      startMs: gruppo.startMs, durationMs, clef, hand: gruppo.hand,
      heads: teste, head, dotted, stem: estremo < 4 ? 'down' : 'up',
    });
  }

  items.sort((a, b) => a.startMs - b.startMs);
  return { items, key };
}

/**
 * Dove si scrivono i diesis e i bemolli dell'armatura.
 *
 * Le ottave non sono libere: l'armatura ha un posto fisso e
 * riconoscibile sul rigo, e scriverla altrove la renderebbe illeggibile
 * a chi sa leggere. Sono tabellate per chiave e verificate dal test,
 * che ricalcola le posizioni dalle stesse funzioni usate per le note.
 */
const SHARP_PITCHES: Record<Clef, readonly [number, number][]> = {
  // [lettera, ottava] nell'ordine FA DO SOL RE LA MI SI
  treble: [[3, 5], [0, 5], [4, 5], [1, 5], [5, 4], [2, 5], [6, 4]],
  bass: [[3, 3], [0, 3], [4, 3], [1, 3], [5, 2], [2, 3], [6, 2]],
};
const FLAT_PITCHES: Record<Clef, readonly [number, number][]> = {
  // ordine SI MI LA RE SOL DO FA
  treble: [[6, 4], [2, 5], [5, 4], [1, 5], [4, 4], [0, 5], [3, 4]],
  bass: [[6, 2], [2, 3], [5, 2], [1, 3], [4, 2], [0, 3], [3, 2]],
};

/** Posizioni verticali dell'armatura, in ordine di scrittura. */
export function keySignaturePositions(key: KeySignature, clef: Clef): number[] {
  const tavola = key.kind === 'sharp' ? SHARP_PITCHES : FLAT_PITCHES;
  return tavola[clef]
    .slice(0, key.count)
    .map(([letter, octave]) => stepsBelowTop({ letter, octave, alteration: 0 }, clef));
}

/** Istanti delle stanghette di battuta nell'intervallo richiesto. */
export function barLines(fromMs: number, toMs: number, msPerBar: number): number[] {
  if (!(msPerBar > 0)) return [];
  const prima = Math.ceil(fromMs / msPerBar);
  const ultima = Math.floor(toMs / msPerBar);
  const tempi: number[] = [];
  for (let n = prima; n <= ultima; n++) tempi.push(n * msPerBar);
  return tempi;
}
