import { MIDI_MAX, MIDI_MIN } from '../music/note';
import type {
  Hand, Song, SongArrangement, SongNote, SongSection,
} from '../song/types';
import { tickToMs, type MidiFile, type MidiTrack, type RawNote } from './midiFile';

/**
 * Da file MIDI a brano da studiare.
 *
 * Il file dice quali note e quando. Non dice quale mano le suona, dove
 * finisce una frase, né quale parte è il pianoforte: sono tre decisioni
 * che qui si prendono con criteri dichiarati, e che l'utente può
 * correggere. Nessuna di esse è indovinata in silenzio.
 */

/** Strumenti General MIDI della famiglia dei pianoforti. */
const PIANO_PROGRAMS = new Set([0, 1, 2, 3, 4, 5, 6, 7]);
/** Il canale 10 (indice 9) è la batteria per definizione dello standard. */
const DRUM_CHANNEL = 9;
const PIANO_NAME = /piano|pf\b|klavier|keyboard|tastiera|rhodes|clav/i;
const RIGHT_NAME = /right|destra|\brh\b|treble|melod/i;
const LEFT_NAME = /left|sinistra|\blh\b|bass(?!oon)/i;

export interface TrackSummary {
  index: number;
  name: string | null;
  noteCount: number;
  lowestMidi: number;
  highestMidi: number;
  /** La traccia sembra pianoforte: nome o strumento dichiarato. */
  looksLikePiano: boolean;
  isDrums: boolean;
  /** Mano suggerita dal nome della traccia, se il nome lo dice. */
  namedHand: Hand | null;
}

export interface ImportAnalysis {
  tracks: TrackSummary[];
  /** Indici delle tracce che verrebbero importate senza interventi. */
  suggestedTracks: number[];
  /** Nessuna traccia dichiara un pianoforte: si importa quello che c'è. */
  pianoFound: boolean;
  bpm: number;
  timeSignature: [number, number];
  durationMs: number;
  tempoChanges: number;
  totalNotes: number;
}

export interface ImportOptions {
  title: string;
  /** Tracce da importare. Vuoto = quelle suggerite. */
  trackIndexes?: number[];
  /**
   * Divisione delle mani:
   *  - 'tracks': una traccia per mano (possibile solo con due tracce);
   *  - un numero MIDI: tutto da lì in su è mano destra.
   */
  handSplit: 'tracks' | number;
  /** Griglia di allineamento: 0 = nessuna, 8 = croma, 16 = semicroma. */
  quantizeDivision: 0 | 4 | 8 | 16;
}

export interface ImportResult {
  song: Song;
  /** Cosa è stato fatto al materiale: va mostrato, non nascosto. */
  report: {
    tracksUsed: number[];
    notesImported: number;
    notesOutOfRange: number;
    notesMerged: number;
    handSplitMidi: number | null;
    quantized: boolean;
    sections: number;
  };
}

// ---------------------------------------------------------------------
// Analisi
// ---------------------------------------------------------------------

export function analyseMidi(file: MidiFile): ImportAnalysis {
  const ms = tickToMs(file);
  const tracks: TrackSummary[] = file.tracks
    .filter((t) => t.notes.length > 0)
    .map((t) => {
      const pitches = t.notes.map((n) => n.midi);
      const nome = t.name ?? '';
      return {
        index: t.index,
        name: t.name,
        noteCount: t.notes.length,
        lowestMidi: Math.min(...pitches),
        highestMidi: Math.max(...pitches),
        isDrums: t.channels.includes(DRUM_CHANNEL),
        looksLikePiano:
          t.programs.some((p) => PIANO_PROGRAMS.has(p)) ||
          (t.programs.length === 0 && !t.channels.includes(DRUM_CHANNEL)) ||
          PIANO_NAME.test(nome),
        namedHand: RIGHT_NAME.test(nome) ? 'right' : LEFT_NAME.test(nome) ? 'left' : null,
      };
    });

  const pianoforti = tracks.filter((t) => t.looksLikePiano && !t.isDrums);
  const pianoFound = tracks.some((t) => !t.isDrums && (
    file.tracks[t.index]?.programs.some((p) => PIANO_PROGRAMS.has(p)) === true ||
    PIANO_NAME.test(t.name ?? '')
  ));

  // Senza nessun pianoforte dichiarato si prende comunque il materiale
  // suonabile: meglio importare e dirlo che rifiutare un file valido.
  const scelte = (pianoforti.length > 0 ? pianoforti : tracks.filter((t) => !t.isDrums))
    .map((t) => t.index);

  const ultimo = Math.max(0, ...file.tracks.flatMap((t) => t.notes.map((n) => n.tick + n.durationTicks)));
  const firstTempo = file.tempoMap[0]?.usPerQuarter ?? 500_000;
  const sig = file.timeSignatures[0];

  return {
    tracks,
    suggestedTracks: scelte,
    pianoFound,
    bpm: Math.round(60_000_000 / firstTempo),
    timeSignature: [sig?.numerator ?? 4, sig?.denominator ?? 4],
    durationMs: Math.round(ms(ultimo)),
    tempoChanges: file.tempoMap.length,
    totalNotes: tracks.reduce((n, t) => n + t.noteCount, 0),
  };
}

/**
 * Punto di divisione delle mani suggerito.
 *
 * Si cerca l'altezza che separa meglio le note in due gruppi, cioè
 * quella che rende minima la dispersione interna dei due gruppi. È il
 * criterio di Otsu applicato a un istogramma di altezze: dichiarato,
 * ripetibile, e sbagliabile — per questo l'utente lo può cambiare.
 */
export function suggestHandSplit(pitches: readonly number[]): number {
  if (pitches.length === 0) return 60;
  const istogramma = new Array<number>(128).fill(0);
  for (const p of pitches) istogramma[p] = (istogramma[p] as number) + 1;

  const totale = pitches.length;
  const somma = pitches.reduce((a, b) => a + b, 0);
  let pesoBasso = 0;
  let sommaBasso = 0;
  let miglioreVarianza = -1;
  let migliore = 60;

  for (let soglia = 1; soglia < 128; soglia++) {
    pesoBasso += istogramma[soglia - 1] as number;
    sommaBasso += (soglia - 1) * (istogramma[soglia - 1] as number);
    const pesoAlto = totale - pesoBasso;
    if (pesoBasso === 0 || pesoAlto === 0) continue;

    const mediaBassa = sommaBasso / pesoBasso;
    const mediaAlta = (somma - sommaBasso) / pesoAlto;
    // Varianza fra i gruppi: massimizzarla equivale a minimizzare
    // quella interna, e si calcola in un passaggio solo.
    const varianza = pesoBasso * pesoAlto * (mediaBassa - mediaAlta) ** 2;
    if (varianza > miglioreVarianza) {
      miglioreVarianza = varianza;
      migliore = soglia;
    }
  }
  return migliore;
}

// ---------------------------------------------------------------------
// Costruzione
// ---------------------------------------------------------------------

interface NotaImportata extends SongNote {
  startTick: number;
  endTick: number;
}

export function buildImportedSong(file: MidiFile, options: ImportOptions): ImportResult {
  const analisi = analyseMidi(file);
  const indici = options.trackIndexes?.length ? options.trackIndexes : analisi.suggestedTracks;
  const tracce = file.tracks.filter((t) => indici.includes(t.index) && t.notes.length > 0);
  if (tracce.length === 0) throw new Error('nessuna traccia da importare');

  const tpq = file.ticksPerQuarter;
  const sig = file.timeSignatures[0];
  const numeratore = sig?.numerator ?? 4;
  const denominatore = sig?.denominator ?? 4;
  const barTicks = Math.max(1, Math.round((tpq * 4 * numeratore) / denominatore));
  const grigliaTicks = options.quantizeDivision > 0
    ? Math.max(1, Math.round((tpq * 4) / options.quantizeDivision))
    : 0;

  // Si toglie il silenzio iniziale fino alla battuta: un brano che
  // comincia dopo otto secondi di niente non si studia.
  const primoTick = Math.min(...tracce.flatMap((t) => t.notes.map((n) => n.tick)));
  const offset = Math.floor(primoTick / barTicks) * barTicks;

  const splitMidi = options.handSplit === 'tracks' ? null : options.handSplit;
  const manoDi = handAssigner(tracce, options.handSplit, analisi);

  let fuoriTastiera = 0;
  const grezze: NotaImportata[] = [];

  for (const traccia of tracce) {
    for (const nota of traccia.notes) {
      if (nota.midi < MIDI_MIN || nota.midi > MIDI_MAX) { fuoriTastiera++; continue; }
      const inizio = snap(nota.tick - offset, grigliaTicks);
      const fine = Math.max(
        inizio + (grigliaTicks || 1),
        snap(nota.tick + nota.durationTicks - offset, grigliaTicks),
      );
      if (inizio < 0) continue;
      grezze.push({
        midi: nota.midi,
        hand: manoDi(traccia, nota),
        startMs: 0, durationMs: 0,
        velocity: Math.round((nota.velocity / 127) * 100) / 100,
        startTick: inizio,
        endTick: fine,
      });
    }
  }

  if (grezze.length === 0) throw new Error('nessuna nota utilizzabile nel file');

  grezze.sort((a, b) => a.startTick - b.startTick || a.midi - b.midi);
  const { note, merged } = mergeOverlaps(grezze);

  const ms = tickToMs(file);
  const msOffset = ms(offset);
  const inMs = (tick: number) => Math.max(0, Math.round(ms(tick + offset) - msOffset));

  const finali: SongNote[] = note.map((n) => {
    const startMs = inMs(n.startTick);
    const nota: SongNote = {
      midi: n.midi,
      hand: n.hand,
      startMs,
      durationMs: Math.max(40, inMs(n.endTick) - startMs),
    };
    if (n.velocity !== undefined) nota.velocity = n.velocity;
    return nota;
  });
  finali.sort((a, b) => a.startMs - b.startMs || a.midi - b.midi);

  const ultimoTick = Math.max(...note.map((n) => n.endTick));
  const battute = Math.max(1, Math.ceil(ultimoTick / barTicks));
  // Si arrotonda alla battuta, ma mai sotto l'ultima nota: la durata
  // minima imposta a una nota cortissima potrebbe sporgere oltre.
  const durationMs = Math.max(
    inMs(battute * barTicks),
    ...finali.map((n) => n.startMs + n.durationMs),
  );

  const sezioni = buildSections(battute, barTicks, inMs, durationMs);
  for (const n of finali) {
    const sezione = sezioni.find((s) => n.startMs >= s.startMs && n.startMs < s.endMs);
    if (sezione) n.sectionId = sezione.id;
  }

  const mani: Hand[] = ['right', 'left'].filter((h) => finali.some((n) => n.hand === h)) as Hand[];
  const id = `import-${slugify(options.title)}-${Date.now()}`;

  const arrangement: SongArrangement = {
    id: `${id}--complete`,
    difficulty: 'complete',
    hands: mani,
    suggestedStartRate: 0.5,
    durationMs,
    sections: sezioni,
    notes: finali,
    chords: [],
  };

  const song: Song = {
    schemaVersion: 1,
    id,
    slug: slugify(options.title),
    title: options.title,
    subtitle: 'Importato da te',
    artistId: 'artist-importati',
    artistName: 'I tuoi brani',
    coverColors: ['#1B2430', '#51606F'],
    bpm: analisi.bpm,
    keySignature: 'C',
    timeSignature: [numeratore, denominatore],
    durationMs,
    baseDifficulty: 'complete',
    isFree: true,
    tags: ['importato'],
    license: {
      // Non è contenuto del progetto: è un file dell'utente, che resta
      // sul suo dispositivo e non viene mai distribuito ad altri.
      status: 'user_import',
      owner: null,
      type: 'uso personale',
      territory: 'LOCAL',
      startDate: null,
      endDate: null,
    },
    arrangements: [arrangement],
  };

  return {
    song,
    report: {
      tracksUsed: tracce.map((t) => t.index),
      notesImported: finali.length,
      notesOutOfRange: fuoriTastiera,
      notesMerged: merged,
      handSplitMidi: splitMidi,
      quantized: grigliaTicks > 0,
      sections: sezioni.length,
    },
  };
}

function snap(tick: number, griglia: number): number {
  return griglia > 0 ? Math.round(tick / griglia) * griglia : tick;
}

function slugify(testo: string): string {
  return testo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'brano-importato';
}

/** Decide la mano di ogni nota secondo il criterio scelto. */
function handAssigner(
  tracce: readonly MidiTrack[],
  criterio: ImportOptions['handSplit'],
  analisi: ImportAnalysis,
): (traccia: MidiTrack, nota: RawNote) => Hand {
  if (criterio === 'tracks' && tracce.length >= 2) {
    // Se i nomi lo dicono si crede ai nomi; altrimenti la traccia con
    // le note più acute è la destra.
    const perIndice = new Map<number, Hand>();
    const nominate = tracce.filter((t) => analisi.tracks.find((s) => s.index === t.index)?.namedHand);
    if (nominate.length === tracce.length) {
      for (const t of tracce) {
        perIndice.set(t.index, analisi.tracks.find((s) => s.index === t.index)?.namedHand ?? 'right');
      }
    } else {
      const medie = tracce.map((t) => ({
        index: t.index,
        media: t.notes.reduce((a, n) => a + n.midi, 0) / t.notes.length,
      })).sort((a, b) => b.media - a.media);
      medie.forEach((m, i) => perIndice.set(m.index, i === 0 ? 'right' : 'left'));
    }
    return (traccia) => perIndice.get(traccia.index) ?? 'right';
  }

  const soglia = typeof criterio === 'number' ? criterio : 60;
  return (_traccia, nota) => (nota.midi >= soglia ? 'right' : 'left');
}

/**
 * Fonde le note che il matcher non saprebbe distinguere.
 *
 * Due note della stessa altezza e della stessa mano sovrapposte nel
 * tempo sono una sola nota per chi suona: tenerle separate farebbe
 * contare un errore a ogni ripetizione. Succede davvero nei file che
 * raddoppiano la melodia su due tracce.
 */
function mergeOverlaps(note: NotaImportata[]): { note: NotaImportata[]; merged: number } {
  const ultima = new Map<string, NotaImportata>();
  const tenute: NotaImportata[] = [];
  let merged = 0;

  for (const nota of note) {
    const chiave = `${nota.hand}:${nota.midi}`;
    const precedente = ultima.get(chiave);
    if (precedente && nota.startTick < precedente.endTick) {
      // Si allunga la precedente invece di aggiungerne una seconda.
      precedente.endTick = Math.max(precedente.endTick, nota.endTick);
      merged++;
      continue;
    }
    tenute.push(nota);
    ultima.set(chiave, nota);
  }
  return { note: tenute, merged };
}

/**
 * Spezza il brano in sezioni di battute intere.
 *
 * Un file MIDI non dice dove finisce una strofa. Si tagliano quindi
 * blocchi regolari, che è una scelta onesta e dichiarata: servono
 * perché ripetere, rallentare e isolare funzionano per sezione.
 */
function buildSections(
  battute: number,
  barTicks: number,
  inMs: (tick: number) => number,
  durationMs: number,
): SongSection[] {
  const perSezione = battute >= 32 ? 8 : battute >= 12 ? 4 : 2;
  const sezioni: SongSection[] = [];

  for (let prima = 0; prima < battute; prima += perSezione) {
    const ultima = Math.min(battute, prima + perSezione);
    const startMs = inMs(prima * barTicks);
    const endMs = ultima >= battute ? durationMs : inMs(ultima * barTicks);
    if (endMs <= startMs) continue;
    sezioni.push({
      id: `s${sezioni.length + 1}`,
      kind: 'verse',
      name: `Battute ${prima + 1}–${ultima}`,
      startMs,
      endMs,
      loopRecommended: true,
    });
  }

  if (sezioni.length === 0) {
    sezioni.push({ id: 's1', kind: 'verse', name: 'Tutto il brano', startMs: 0, endMs: durationMs });
  }
  return sezioni;
}
