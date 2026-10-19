import { MIDI_MAX, MIDI_MIN } from '../music/note';
import type {
  Hand, Song, SongArrangement, SongNote, SongSection,
} from '../song/types';
import {
  barTicks, tickToMsFor, totalNotes,
  type ImportDocument, type ImportNote, type ImportPart,
} from './document';

/**
 * Dal modello intermedio al brano da studiare.
 *
 * Vale per MIDI e per MusicXML allo stesso modo: è il motivo per cui
 * il modello intermedio esiste.
 *
 * Un file dice **quali note e quando**. Non sempre dice quale parte è
 * il pianoforte, quale mano suona cosa, né dove finisce una frase.
 * Sono decisioni prese qui con criteri dichiarati, e tutte
 * modificabili dall'utente: nessuna viene presa in silenzio.
 */

export type PartRole = 'excluded' | 'right' | 'left' | 'split';

export interface PartSummary {
  index: number;
  name: string | null;
  instrument: string | null;
  channel: number | null;
  noteCount: number;
  lowestMidi: number;
  highestMidi: number;
  isDrums: boolean;
  looksLikePiano: boolean;
  /** La parte porta già la mano scritta nel file (pentagrammi MusicXML). */
  hasDeclaredHands: boolean;
  /** Mano proposta dal nome della parte, se il nome lo dice. */
  namedHand: Hand | null;
}

export interface ImportAnalysis {
  format: ImportDocument['format'];
  title: string | null;
  composer: string | null;
  parts: PartSummary[];
  /** Ruolo proposto per ogni parte, indicizzato come `parts`. */
  suggestedRoles: PartRole[];
  /** Divisione per altezza proposta, quando serve. */
  suggestedSplitMidi: number;
  pianoFound: boolean;
  bpm: number;
  timeSignature: [number, number];
  keySignature: string | null;
  durationMs: number;
  bars: number;
  tempoChanges: number;
  totalNotes: number;
  notices: readonly string[];
}

export interface ImportOptions {
  title: string;
  composer?: string | null;
  /** Ruolo scelto per ogni parte, nello stesso ordine dell'analisi. */
  roles: readonly PartRole[];
  /** Soglia per le parti con ruolo "split" prive di mano dichiarata. */
  splitMidi: number;
  /** Griglia di allineamento: 0 = nessuna, 8 = croma, 16 = semicroma. */
  quantizeDivision: 0 | 4 | 8 | 16;
}

export interface ImportReport {
  partsUsed: number[];
  partsExcluded: number[];
  notesImported: number;
  notesOutOfRange: number;
  notesMerged: number;
  rightNotes: number;
  leftNotes: number;
  splitMidiUsed: number | null;
  quantized: boolean;
  sections: number;
  bars: number;
  durationMs: number;
  /** Diteggiature conservate dal file originale. */
  fingeringsKept: number;
}

export interface ImportResult {
  song: Song;
  report: ImportReport;
}

const RIGHT_NAME = /right|destra|\brh\b|treble|melod|soprano/i;
const LEFT_NAME = /left|sinistra|\blh\b|bass(?!oon)/i;

// ---------------------------------------------------------------------
// Analisi
// ---------------------------------------------------------------------

export function analyseDocument(doc: ImportDocument): ImportAnalysis {
  const ms = tickToMsFor(doc);
  const parts: PartSummary[] = doc.parts.map((p) => {
    const pitches = p.notes.map((n) => n.midi);
    const nome = p.name ?? '';
    return {
      index: p.index,
      name: p.name,
      instrument: p.instrument,
      channel: p.channel,
      noteCount: p.notes.length,
      lowestMidi: Math.min(...pitches),
      highestMidi: Math.max(...pitches),
      isDrums: p.isDrums,
      looksLikePiano: p.looksLikePiano,
      hasDeclaredHands: p.notes.some((n) => n.hand !== undefined),
      namedHand: RIGHT_NAME.test(nome) ? 'right' : LEFT_NAME.test(nome) ? 'left' : null,
    };
  });

  const ultimo = Math.max(0, ...doc.parts.flatMap((p) => p.notes.map((n) => n.startTick + n.durationTicks)));
  const sig = doc.timeSignatures[0];
  const usPerQuarter = doc.tempoMap[0]?.usPerQuarter ?? 500_000;

  return {
    format: doc.format,
    title: doc.title,
    composer: doc.composer,
    parts,
    suggestedRoles: suggestRoles(parts),
    suggestedSplitMidi: suggestHandSplit(
      doc.parts.filter((p) => p.looksLikePiano && !p.isDrums).flatMap((p) => p.notes.map((n) => n.midi)),
    ),
    pianoFound: parts.some((p) => p.looksLikePiano && !p.isDrums),
    bpm: Math.round(60_000_000 / usPerQuarter),
    timeSignature: [sig?.numerator ?? 4, sig?.denominator ?? 4],
    keySignature: doc.keySignature,
    durationMs: Math.round(ms(ultimo)),
    bars: Math.max(1, Math.ceil(ultimo / barTicks(doc))),
    tempoChanges: doc.tempoMap.length,
    totalNotes: totalNotes(doc),
    notices: doc.notices,
  };
}

/**
 * Ruolo proposto per ogni parte.
 *
 * Le regole, in ordine: la batteria si esclude sempre; quello che non
 * sembra pianoforte si esclude se c'è un pianoforte altrove; due parti
 * di pianoforte diventano una per mano; in tutti gli altri casi la
 * parte porta entrambe le mani.
 */
export function suggestRoles(parts: readonly PartSummary[]): PartRole[] {
  const suonabili = parts.filter((p) => !p.isDrums);
  const pianoforti = suonabili.filter((p) => p.looksLikePiano);
  const candidate = pianoforti.length > 0 ? pianoforti : suonabili;

  const ruoli: PartRole[] = parts.map((p) =>
    candidate.some((c) => c.index === p.index) ? 'split' : 'excluded');

  if (candidate.length === 2 && !candidate.some((p) => p.hasDeclaredHands)) {
    const [a, b] = candidate as [PartSummary, PartSummary];
    const perNome = a.namedHand && b.namedHand && a.namedHand !== b.namedHand;
    const destra = perNome
      ? (a.namedHand === 'right' ? a : b)
      // Senza nomi che lo dicano, la parte più acuta è la destra.
      : (media(a) >= media(b) ? a : b);
    for (const p of candidate) {
      ruoli[parts.findIndex((q) => q.index === p.index)] = p.index === destra.index ? 'right' : 'left';
    }
  }
  return ruoli;
}

function media(p: PartSummary): number {
  return (p.lowestMidi + p.highestMidi) / 2;
}

/**
 * Soglia di divisione delle mani suggerita.
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

export function buildImportedSong(doc: ImportDocument, options: ImportOptions): ImportResult {
  const analisi = analyseDocument(doc);
  const ruoli = options.roles.length === doc.parts.length ? options.roles : analisi.suggestedRoles;

  const usate = doc.parts.filter((_, i) => ruoli[i] !== 'excluded');
  if (usate.length === 0) throw new Error('nessuna parte da importare');

  const tpq = doc.ticksPerQuarter;
  const lunghezzaBattuta = barTicks(doc);
  const griglia = options.quantizeDivision > 0
    ? Math.max(1, Math.round((tpq * 4) / options.quantizeDivision))
    : 0;

  // Si toglie il silenzio iniziale fino alla battuta: un brano che
  // comincia dopo otto secondi di niente non si studia.
  const primoTick = Math.min(...usate.flatMap((p) => p.notes.map((n) => n.startTick)));
  const offset = Math.floor(Math.max(0, primoTick) / lunghezzaBattuta) * lunghezzaBattuta;

  let fuoriTastiera = 0;
  let serveSoglia = false;
  const grezze: NotaImportata[] = [];

  doc.parts.forEach((parte, i) => {
    const ruolo = ruoli[i] as PartRole;
    if (ruolo === 'excluded') return;
    for (const nota of parte.notes) {
      if (nota.midi < MIDI_MIN || nota.midi > MIDI_MAX) { fuoriTastiera++; continue; }
      const inizio = snap(nota.startTick - offset, griglia);
      const fine = Math.max(
        inizio + (griglia || 1),
        snap(nota.startTick + nota.durationTicks - offset, griglia),
      );
      if (inizio < 0) continue;

      const mano = handOf(nota, ruolo, options.splitMidi);
      if (ruolo === 'split' && nota.hand === undefined) serveSoglia = true;

      const costruita: NotaImportata = {
        midi: nota.midi, hand: mano,
        startMs: 0, durationMs: 0,
        startTick: inizio, endTick: fine,
      };
      if (nota.velocity !== undefined) costruita.velocity = nota.velocity;
      // La diteggiatura si conserva solo se è scritta nel file.
      if (nota.finger !== undefined) costruita.finger = nota.finger;
      grezze.push(costruita);
    }
  });

  if (grezze.length === 0) throw new Error('nessuna nota utilizzabile nel file');

  grezze.sort((a, b) => a.startTick - b.startTick || a.midi - b.midi);
  const { note, merged } = mergeOverlaps(grezze);

  const ms = tickToMsFor(doc);
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
    if (n.finger !== undefined) nota.finger = n.finger;
    return nota;
  });
  finali.sort((a, b) => a.startMs - b.startMs || a.midi - b.midi);

  const ultimoTick = Math.max(...note.map((n) => n.endTick));
  const battute = Math.max(1, Math.ceil(ultimoTick / lunghezzaBattuta));
  // Si arrotonda alla battuta, ma mai sotto l'ultima nota: la durata
  // minima imposta a una nota cortissima potrebbe sporgere oltre.
  const durationMs = Math.max(
    inMs(battute * lunghezzaBattuta),
    ...finali.map((n) => n.startMs + n.durationMs),
  );

  const sezioni = buildSections(battute, lunghezzaBattuta, inMs, durationMs);
  for (const n of finali) {
    const sezione = sezioni.find((s) => n.startMs >= s.startMs && n.startMs < s.endMs);
    if (sezione) n.sectionId = sezione.id;
  }

  const mani: Hand[] = (['right', 'left'] as Hand[]).filter((h) => finali.some((n) => n.hand === h));
  const titolo = options.title.trim() || doc.title || 'Brano importato';
  const id = `import-${slugify(titolo)}-${Date.now()}`;
  const autore = (options.composer ?? doc.composer ?? '').trim();

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
    slug: slugify(titolo),
    title: titolo,
    subtitle: autore || 'Importato da te',
    artistId: 'artist-importati',
    artistName: autore || 'I tuoi brani',
    coverColors: ['#1B2430', '#51606F'],
    bpm: analisi.bpm,
    keySignature: doc.keySignature ?? 'C',
    timeSignature: analisi.timeSignature,
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
      partsUsed: doc.parts.filter((_, i) => ruoli[i] !== 'excluded').map((p) => p.index),
      partsExcluded: doc.parts.filter((_, i) => ruoli[i] === 'excluded').map((p) => p.index),
      notesImported: finali.length,
      notesOutOfRange: fuoriTastiera,
      notesMerged: merged,
      rightNotes: finali.filter((n) => n.hand === 'right').length,
      leftNotes: finali.filter((n) => n.hand === 'left').length,
      splitMidiUsed: serveSoglia ? options.splitMidi : null,
      quantized: griglia > 0,
      sections: sezioni.length,
      bars: battute,
      durationMs,
      fingeringsKept: finali.filter((n) => n.finger !== undefined).length,
    },
  };
}

/** La mano scritta nel file vince sempre sul criterio automatico. */
function handOf(nota: ImportNote, ruolo: PartRole, soglia: number): Hand {
  if (ruolo === 'right') return 'right';
  if (ruolo === 'left') return 'left';
  if (nota.hand) return nota.hand;
  return nota.midi >= soglia ? 'right' : 'left';
}

function snap(tick: number, griglia: number): number {
  return griglia > 0 ? Math.round(tick / griglia) * griglia : tick;
}

export function slugify(testo: string): string {
  return testo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'brano-importato';
}

/**
 * Fonde le note che il matcher non saprebbe distinguere.
 *
 * Due note della stessa altezza e della stessa mano sovrapposte nel
 * tempo sono una sola nota per chi suona: tenerle separate farebbe
 * contare un errore a ogni ripetizione. Succede davvero nei file che
 * raddoppiano la melodia su due tracce, e nei MusicXML con più voci
 * sullo stesso pentagramma.
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
      // Se la nota assorbita portava una diteggiatura e l'altra no, la
      // si conserva: è un dato del file, non va perso nella fusione.
      if (precedente.finger === undefined && nota.finger !== undefined) {
        precedente.finger = nota.finger;
      }
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
 * Un file non dice dove finisce una strofa. Si tagliano quindi blocchi
 * regolari, che è una scelta onesta e dichiarata: servono perché
 * ripetere, rallentare e isolare una mano funzionano per sezione.
 */
function buildSections(
  battute: number,
  lunghezzaBattuta: number,
  inMs: (tick: number) => number,
  durationMs: number,
): SongSection[] {
  const perSezione = battute >= 32 ? 8 : battute >= 12 ? 4 : 2;
  const sezioni: SongSection[] = [];

  for (let prima = 0; prima < battute; prima += perSezione) {
    const ultima = Math.min(battute, prima + perSezione);
    const startMs = inMs(prima * lunghezzaBattuta);
    const endMs = ultima >= battute ? durationMs : inMs(ultima * lunghezzaBattuta);
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

/** Riepilogo per parte, usato dalla schermata di revisione. */
export function partLabel(p: PartSummary, indice: number): string {
  return p.name || p.instrument || `Parte ${indice + 1}`;
}

export type { ImportPart };
