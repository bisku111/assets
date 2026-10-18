/**
 * Lettura di un file MIDI standard (SMF).
 *
 * Serve a importare un brano che l'utente possiede, non a riconoscere
 * musica da una registrazione: qui le note ci sono già scritte, e il
 * lavoro è leggerle senza sbagliare i tempi.
 *
 * TypeScript puro e nessuna dipendenza: un parser di formato binario è
 * esattamente il genere di codice che va provato in Node con byte
 * costruiti a mano, non a occhio su un file vero.
 */

export class MidiFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MidiFileError';
  }
}

export interface RawNote {
  /** Attacco, in tick. */
  tick: number;
  durationTicks: number;
  midi: number;
  /** 0..127 come nel file. */
  velocity: number;
  channel: number;
}

export interface MidiTrack {
  index: number;
  name: string | null;
  notes: RawNote[];
  /** Strumenti dichiarati dalla traccia (program change General MIDI). */
  programs: number[];
  channels: number[];
}

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

export interface MidiFile {
  format: number;
  ticksPerQuarter: number;
  tracks: MidiTrack[];
  tempoMap: TempoChange[];
  timeSignatures: TimeSignature[];
}

/** 500000 µs = 120 BPM: è il valore che lo standard impone in assenza di indicazioni. */
const DEFAULT_US_PER_QUARTER = 500_000;

/**
 * Un file più grande di così non è un brano da studiare: è un errore
 * di scelta del file, e tenerlo in memoria bloccherebbe il telefono.
 */
export const MAX_MIDI_BYTES = 2 * 1024 * 1024;
export const MAX_NOTES = 20_000;

class Reader {
  private pos = 0;
  constructor(private readonly data: Uint8Array) {}

  get offset(): number { return this.pos; }
  get remaining(): number { return this.data.length - this.pos; }

  byte(): number {
    if (this.pos >= this.data.length) throw new MidiFileError('file troncato');
    return this.data[this.pos++] as number;
  }

  /** Guarda il prossimo byte senza consumarlo: serve al running status. */
  peek(): number {
    if (this.pos >= this.data.length) throw new MidiFileError('file troncato');
    return this.data[this.pos] as number;
  }

  uint16(): number { return (this.byte() << 8) | this.byte(); }
  uint32(): number {
    // Non si usano gli shift: 0x80000000 diventerebbe negativo.
    return this.byte() * 0x1000000 + this.byte() * 0x10000 + this.byte() * 0x100 + this.byte();
  }

  bytes(n: number): Uint8Array {
    if (n < 0 || this.pos + n > this.data.length) throw new MidiFileError('file troncato');
    const slice = this.data.subarray(this.pos, this.pos + n);
    this.pos += n;
    return slice;
  }

  ascii(n: number): string {
    return String.fromCharCode(...this.bytes(n));
  }

  /** Quantità a lunghezza variabile: sette bit per byte, il più alto dice "continua". */
  varLength(): number {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.byte();
      value = (value << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) return value;
    }
    throw new MidiFileError('numero a lunghezza variabile malformato');
  }

  skip(n: number): void {
    if (this.pos + n > this.data.length) throw new MidiFileError('file troncato');
    this.pos += n;
  }
}

export function parseMidiFile(data: Uint8Array): MidiFile {
  if (data.length > MAX_MIDI_BYTES) {
    throw new MidiFileError('il file è troppo grande per essere un brano da studiare');
  }

  const reader = new Reader(data);
  if (reader.remaining < 14 || reader.ascii(4) !== 'MThd') {
    throw new MidiFileError('non è un file MIDI');
  }

  const headerLength = reader.uint32();
  const format = reader.uint16();
  const declaredTracks = reader.uint16();
  const division = reader.uint16();
  // L'intestazione può essere più lunga di sei byte nelle versioni
  // future dello standard: si saltano i byte in più invece di arrendersi.
  if (headerLength > 6) reader.skip(headerLength - 6);

  if ((division & 0x8000) !== 0) {
    // Divisione SMPTE: i tick sono legati ai fotogrammi video, non al
    // movimento musicale. Non si finge di saperla leggere.
    throw new MidiFileError('questo file usa una divisione temporale SMPTE, che non so ancora leggere');
  }
  const ticksPerQuarter = division;
  if (ticksPerQuarter <= 0) throw new MidiFileError('divisione temporale non valida');

  const tracks: MidiTrack[] = [];
  const tempoMap: TempoChange[] = [];
  const timeSignatures: TimeSignature[] = [];

  let totali = 0;
  while (reader.remaining >= 8 && tracks.length < declaredTracks) {
    const tipo = reader.ascii(4);
    const lunghezza = reader.uint32();
    if (tipo !== 'MTrk') {
      // Lo standard prevede che i chunk sconosciuti si saltino.
      reader.skip(Math.min(lunghezza, reader.remaining));
      continue;
    }
    const corpo = reader.bytes(lunghezza);
    const traccia = parseTrack(corpo, tracks.length, tempoMap, timeSignatures);
    totali += traccia.notes.length;
    if (totali > MAX_NOTES) {
      throw new MidiFileError('il file contiene troppe note per essere studiato come un brano');
    }
    tracks.push(traccia);
  }

  if (tracks.length === 0) throw new MidiFileError('il file non contiene nessuna traccia');

  tempoMap.sort((a, b) => a.tick - b.tick);
  timeSignatures.sort((a, b) => a.tick - b.tick);
  return { format, ticksPerQuarter, tracks, tempoMap, timeSignatures };
}

interface Aperta {
  tick: number;
  velocity: number;
  channel: number;
}

/** Quanti byte di dati porta ogni tipo di messaggio di canale. */
function dataBytesFor(status: number): number {
  const tipo = status & 0xf0;
  return tipo === 0xc0 || tipo === 0xd0 ? 1 : 2;
}

function parseTrack(
  body: Uint8Array,
  index: number,
  tempoMap: TempoChange[],
  timeSignatures: TimeSignature[],
): MidiTrack {
  const reader = new Reader(body);
  const notes: RawNote[] = [];
  const programs = new Set<number>();
  const channels = new Set<number>();
  // Chiave canale*128+nota: lo stesso tasto su canali diversi è suonato
  // da due strumenti diversi e non va chiuso per sbaglio.
  const aperte = new Map<number, Aperta>();

  let name: string | null = null;
  let tick = 0;
  let runningStatus = 0;

  const chiudi = (chiave: number, fine: number) => {
    const aperta = aperte.get(chiave);
    if (!aperta) return;
    aperte.delete(chiave);
    notes.push({
      tick: aperta.tick,
      // Una durata nulla non esiste: sarebbe una nota invisibile.
      durationTicks: Math.max(1, fine - aperta.tick),
      midi: chiave % 128,
      velocity: aperta.velocity,
      channel: aperta.channel,
    });
  };

  while (reader.remaining > 0) {
    tick += reader.varLength();
    if (reader.remaining === 0) break;

    const prossimo = reader.peek();

    if (prossimo === 0xff) {
      reader.byte();
      const tipo = reader.byte();
      const dati = reader.bytes(reader.varLength());
      if (tipo === 0x03 && name === null) name = decodeAscii(dati);
      else if (tipo === 0x51 && dati.length === 3) {
        tempoMap.push({
          tick,
          usPerQuarter: (dati[0] as number) * 0x10000 + (dati[1] as number) * 0x100 + (dati[2] as number),
        });
      } else if (tipo === 0x58 && dati.length >= 2) {
        timeSignatures.push({
          tick,
          numerator: dati[0] as number,
          denominator: 2 ** (dati[1] as number),
        });
      } else if (tipo === 0x2f) {
        break;
      }
      continue;
    }

    if (prossimo === 0xf0 || prossimo === 0xf7) {
      reader.byte();
      reader.skip(reader.varLength());
      // Un SysEx azzera il running status: lo stato precedente non vale più.
      runningStatus = 0;
      continue;
    }

    // Running status: se il byte non ha il bit alto è gia' un dato, e
    // lo stato è quello dell'evento precedente. Senza questo, metà dei
    // file MIDI reali non si legge: è il modo normale di scriverli.
    let status: number;
    if (prossimo >= 0x80) {
      status = reader.byte();
      runningStatus = status;
    } else {
      if (runningStatus === 0) throw new MidiFileError('evento senza stato iniziale');
      status = runningStatus;
    }

    const tipo = status & 0xf0;
    const canale = status & 0x0f;
    const d1 = reader.byte();
    const d2 = dataBytesFor(status) === 2 ? reader.byte() : 0;

    if (tipo === 0x90 || tipo === 0x80) {
      channels.add(canale);
      const chiave = canale * 128 + d1;
      // Nota accesa con intensità zero: lo standard la definisce uguale
      // a una nota spenta, ed è così che la scrivono quasi tutti.
      const accende = tipo === 0x90 && d2 > 0;
      if (accende) {
        // Stesso tasto riattaccato prima del rilascio: si chiude il
        // precedente, altrimenti resterebbe aperto fino a fine traccia.
        chiudi(chiave, tick);
        aperte.set(chiave, { tick, velocity: d2, channel: canale });
      } else {
        chiudi(chiave, tick);
      }
    } else if (tipo === 0xc0) {
      channels.add(canale);
      programs.add(d1);
    }
  }

  for (const chiave of [...aperte.keys()]) chiudi(chiave, tick);

  notes.sort((a, b) => a.tick - b.tick || a.midi - b.midi);
  return {
    index, name, notes,
    programs: [...programs].sort((a, b) => a - b),
    channels: [...channels].sort((a, b) => a - b),
  };
}

function decodeAscii(data: Uint8Array): string {
  return String.fromCharCode(...data).replace(/\0+$/, '').trim();
}

/**
 * Converte i tick in millisecondi seguendo tutti i cambi di tempo.
 *
 * Non basta il primo tempo del file: un brano che rallenta alla fine,
 * letto con un tempo solo, finirebbe diversi secondi fuori sincrono, e
 * l'allievo si sentirebbe dire che sbaglia quando sbaglia il software.
 */
export function tickToMs(file: MidiFile): (tick: number) => number {
  const cambi = file.tempoMap.length > 0
    ? file.tempoMap
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
    const durata = ((ora.tick - prima.tick) * prima.usPerQuarter) / file.ticksPerQuarter / 1000;
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
    const extra = ((tick - segmento.tick) * segmento.usPerQuarter) / file.ticksPerQuarter / 1000;
    return (msAllInizio[lo] as number) + extra;
  };
}
