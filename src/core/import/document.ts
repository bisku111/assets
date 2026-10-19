import type { Hand } from '../song/types';

/**
 * Modello musicale intermedio dell'importazione.
 *
 * È il punto in cui i formati convergono: un file MIDI e un MusicXML
 * producono *questo*, e da qui in poi il codice è uno solo. Senza
 * questo strato ci sarebbero due motori musicali paralleli da tenere
 * d'accordo, che è il modo più sicuro di farli divergere.
 *
 *   file → lettore del formato → ImportDocument → brano → archivio
 *
 * Il tempo è misurato in tick musicali e non in millisecondi: è l'unica
 * unità in cui si possono allineare le note a una griglia e tagliare
 * sezioni su battute intere. I millisecondi si calcolano alla fine,
 * seguendo tutta la mappa dei tempi.
 */

export interface TempoChange {
  tick: number;
  /** Microsecondi per semiminima. */
  usPerQuarter: number;
}

export interface TimeSignature {
  tick: number;
  numerator: number;
  /** Già risolto: 4 = semiminima, 8 = croma. */
  denominator: number;
}

/** 500000 µs = 120 BPM: il valore che lo standard impone in assenza di indicazioni. */
export const DEFAULT_US_PER_QUARTER = 500_000;

export interface ImportNote {
  startTick: number;
  durationTicks: number;
  midi: number;
  /** 0..1. Dinamica scritta nel file, non un'invenzione. */
  velocity?: number;
  /**
   * Mano dichiarata dal formato. Il MIDI non la dice quasi mai, il
   * MusicXML sì (pentagramma 1 e 2). Quando c'è, vince su qualunque
   * criterio automatico.
   */
  hand?: Hand;
  /** Diteggiatura ORIGINALE del file. Mai dedotta, mai inventata. */
  finger?: number;
  /** Numero di battuta d'origine, per poterla citare all'utente. */
  measure?: number;
}

export interface ImportPart {
  index: number;
  id: string;
  name: string | null;
  /** Strumento leggibile, se il file lo dichiara. */
  instrument: string | null;
  channel: number | null;
  /** Program General MIDI, se dichiarato. */
  program: number | null;
  isDrums: boolean;
  looksLikePiano: boolean;
  notes: ImportNote[];
}

export interface ImportDocument {
  format: 'midi' | 'musicxml';
  /** Metadati: solo se il file li contiene davvero. */
  title: string | null;
  composer: string | null;
  ticksPerQuarter: number;
  tempoMap: TempoChange[];
  timeSignatures: TimeSignature[];
  /** Tonalità in notazione anglosassone ("C", "Em", "Bb"), se dichiarata. */
  keySignature: string | null;
  parts: ImportPart[];
  /**
   * Cosa non si è potuto conservare. Va mostrato all'utente: un dato
   * perso in silenzio è peggio di un dato perso dichiarato.
   */
  notices: string[];
}

/**
 * Converte i tick in millisecondi seguendo tutti i cambi di tempo.
 *
 * Non basta il primo tempo del documento: un brano che rallenta alla
 * fine, letto con un tempo solo, finirebbe diversi secondi fuori
 * sincrono, e l'allievo si sentirebbe dire che sbaglia quando sbaglia
 * il software.
 */
export function tickToMsFor(
  source: { ticksPerQuarter: number; tempoMap: readonly TempoChange[] },
): (tick: number) => number {
  const cambi: TempoChange[] = source.tempoMap.length > 0
    ? [...source.tempoMap].sort((a, b) => a.tick - b.tick)
    : [{ tick: 0, usPerQuarter: DEFAULT_US_PER_QUARTER }];
  if ((cambi[0] as TempoChange).tick > 0) {
    cambi.unshift({ tick: 0, usPerQuarter: DEFAULT_US_PER_QUARTER });
  }

  // Millisecondi accumulati fino all'inizio di ogni segmento: si calcola
  // una volta sola, così la conversione di una nota è O(log n).
  const msAllInizio: number[] = [0];
  for (let i = 1; i < cambi.length; i++) {
    const prima = cambi[i - 1] as TempoChange;
    const ora = cambi[i] as TempoChange;
    const durata = ((ora.tick - prima.tick) * prima.usPerQuarter) / source.ticksPerQuarter / 1000;
    msAllInizio.push((msAllInizio[i - 1] as number) + durata);
  }

  return (tick: number) => {
    let lo = 0;
    let hi = cambi.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if ((cambi[mid] as TempoChange).tick <= tick) lo = mid;
      else hi = mid - 1;
    }
    const segmento = cambi[lo] as TempoChange;
    const extra = ((tick - segmento.tick) * segmento.usPerQuarter) / source.ticksPerQuarter / 1000;
    return (msAllInizio[lo] as number) + extra;
  };
}

/** Lunghezza di una battuta in tick, secondo l'indicazione di tempo. */
export function barTicks(doc: {
  ticksPerQuarter: number;
  timeSignatures: readonly TimeSignature[];
}): number {
  const sig = doc.timeSignatures[0];
  const numeratore = sig?.numerator ?? 4;
  const denominatore = sig?.denominator ?? 4;
  return Math.max(1, Math.round((doc.ticksPerQuarter * 4 * numeratore) / denominatore));
}

/** Quante note contiene il documento, parti escluse comprese. */
export function totalNotes(doc: ImportDocument): number {
  return doc.parts.reduce((n, p) => n + p.notes.length, 0);
}
