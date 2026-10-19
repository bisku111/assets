import type { ImportDocument } from './document';
import { midiToDocument } from './fromMidi';
import { MidiFileError, parseMidiFile } from './midiFile';
import { readMxl } from './mxl';
import { parseMusicXml } from './musicXml';
import { decodeUtf8 } from '../text/utf8';

/**
 * Unico ingresso dell'importazione.
 *
 * Riconosce il formato dai **byte** e non dall'estensione: un file
 * rinominato a mano è un caso normale, e l'estensione è solo un
 * suggerimento. Da qui in poi MIDI, MusicXML e .mxl percorrono la
 * stessa strada.
 */

export class UnsupportedFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedFileError';
  }
}

export type ImportFormat = 'midi' | 'musicxml' | 'mxl';

/** Nome leggibile del formato, per la schermata di revisione. */
export const SCORE_LABEL: Record<ImportFormat, string> = {
  midi: 'file MIDI',
  musicxml: 'MusicXML',
  mxl: 'MusicXML compresso',
};

/** Estensioni proposte dal selettore di file. */
export const IMPORT_EXTENSIONS = ['.mid', '.midi', '.musicxml', '.xml', '.mxl'] as const;

export interface OpenedFile {
  format: ImportFormat;
  document: ImportDocument;
}

/** Firme dei formati audio, per dire con precisione perché non vanno bene. */
const AUDIO_SIGNATURES: { bytes: number[]; nome: string }[] = [
  { bytes: [0x49, 0x44, 0x33], nome: 'MP3' },
  { bytes: [0x52, 0x49, 0x46, 0x46], nome: 'WAV' },
  { bytes: [0x4f, 0x67, 0x67, 0x53], nome: 'OGG' },
  { bytes: [0x66, 0x4c, 0x61, 0x43], nome: 'FLAC' },
];

export function detectFormat(bytes: Uint8Array, filename = ''): ImportFormat | null {
  if (startsWith(bytes, [0x4d, 0x54, 0x68, 0x64])) return 'midi';   // "MThd"
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return 'mxl';    // "PK\3\4"
  if (sembraXml(bytes)) return 'musicxml';

  // Nessuna firma riconosciuta: l'estensione è l'ultimo indizio.
  const ext = filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  if (ext === '.mid' || ext === '.midi') return 'midi';
  if (ext === '.mxl') return 'mxl';
  if (ext === '.musicxml' || ext === '.xml') return 'musicxml';
  return null;
}

export function openImportFile(bytes: Uint8Array, filename = ''): OpenedFile {
  const audio = AUDIO_SIGNATURES.find((a) => startsWith(bytes, a.bytes));
  if (audio || /\.(mp3|wav|m4a|aac|ogg|flac|mp4|mov|avi)$/i.test(filename)) {
    throw new UnsupportedFileError(
      `Questo è un file audio${audio ? ` (${audio.nome})` : ''}. Per ricavarne le note servirebbe ` +
      'riconoscerle a orecchio separando il pianoforte dal resto: non so ancora farlo, ' +
      'e preferisco dirtelo invece di darti un risultato inventato.',
    );
  }

  const formato = detectFormat(bytes, filename);
  if (!formato) {
    throw new UnsupportedFileError(
      'Non riconosco questo formato. So leggere file MIDI (.mid) e MusicXML (.musicxml, .xml, .mxl).',
    );
  }

  if (formato === 'midi') {
    return { format: 'midi', document: midiToDocument(parseMidiFile(bytes)) };
  }

  if (formato === 'mxl') {
    const archivio = readMxl(bytes);
    const documento = parseMusicXml(archivio.xml);
    return {
      format: 'mxl',
      document: { ...documento, notices: [...archivio.notices, ...documento.notices] },
    };
  }

  return { format: 'musicxml', document: parseMusicXml(decodeUtf8(bytes)) };
}

function startsWith(bytes: Uint8Array, firma: readonly number[]): boolean {
  if (bytes.length < firma.length) return false;
  return firma.every((b, i) => bytes[i] === b);
}

/** Un XML può cominciare con spazi, un BOM o la dichiarazione. */
function sembraXml(bytes: Uint8Array): boolean {
  let i = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  while (i < bytes.length && i < 64) {
    const b = bytes[i] as number;
    if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d) { i++; continue; }
    return b === 0x3c; // '<'
  }
  return false;
}

export { MidiFileError };
