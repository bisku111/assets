import { inflateSync } from 'fflate';
import { decodeUtf8 } from '../text/utf8';
import { child, childrenNamed, parseXml } from './xml';

export { decodeUtf8 };

/**
 * Lettura di un file .mxl, cioè un MusicXML dentro un archivio ZIP.
 *
 * Un archivio arriva da fuori e va trattato come ostile finché non è
 * stato controllato. Qui l'indice dell'archivio si legge a mano — è
 * una struttura semplice e non compressa — e **si decide cosa
 * estrarre prima di estrarlo**: nomi, dimensioni dichiarate e rapporto
 * di compressione vengono verificati sull'indice, non dopo aver
 * riempito la memoria.
 *
 * I tre pericoli veri, e come sono chiusi:
 *  - percorsi che escono dall'archivio (`../../qualcosa`): qui non si
 *    scrive mai niente su disco, ma un nome del genere indica un file
 *    costruito per fare danno e viene rifiutato comunque;
 *  - bombe di decompressione: limite sulla dimensione dichiarata, sul
 *    totale e sul rapporto fra compresso e decompresso;
 *  - archivi corrotti: ogni campo viene verificato, e un errore è un
 *    messaggio comprensibile, non un'eccezione qualunque.
 */

export class MxlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MxlError';
  }
}

export interface MxlLimits {
  maxArchiveBytes: number;
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
  /** Rapporto massimo fra byte decompressi e compressi. */
  maxRatio: number;
}

export const DEFAULT_MXL_LIMITS: MxlLimits = {
  maxArchiveBytes: 16 * 1024 * 1024,
  maxEntries: 512,
  maxEntryBytes: 24 * 1024 * 1024,
  maxTotalBytes: 32 * 1024 * 1024,
  maxRatio: 200,
};

export interface MxlDocument {
  /** Percorso del documento principale dentro l'archivio. */
  path: string;
  xml: string;
  /** Avvisi su come è stato individuato il documento. */
  notices: string[];
}

interface Entry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const CONTAINER_PATH = 'META-INF/container.xml';

export function readMxl(data: Uint8Array, limits: MxlLimits = DEFAULT_MXL_LIMITS): MxlDocument {
  if (data.length > limits.maxArchiveBytes) throw new MxlError('l’archivio è troppo grande');
  if (data.length < 22) throw new MxlError('non è un archivio .mxl valido');

  const voci = leggiIndice(data, limits);
  const notices: string[] = [];

  const container = voci.find((v) => v.name === CONTAINER_PATH);
  let principale: Entry | undefined;

  if (container) {
    const percorso = percorsoDalContainer(estrai(data, container, limits));
    if (!percorso) throw new MxlError('il file container.xml non indica nessun documento');
    principale = voci.find((v) => v.name === percorso || v.name === percorso.replace(/^\.\//, ''));
    if (!principale) {
      throw new MxlError(`il documento indicato dall’archivio (${percorso}) non c’è`);
    }
  } else {
    // Senza container si cerca un unico candidato evidente invece di
    // arrendersi: molti archivi veri sono scritti così.
    const candidati = voci.filter(
      (v) => /\.(musicxml|xml)$/i.test(v.name) && !v.name.startsWith('META-INF/'),
    );
    if (candidati.length !== 1) {
      throw new MxlError(
        'l’archivio non contiene META-INF/container.xml e non ha un unico documento MusicXML',
      );
    }
    principale = candidati[0] as Entry;
    notices.push(`L’archivio non ha un container.xml: ho usato ${principale.name}.`);
  }

  const bytes = estrai(data, principale, limits);
  return { path: principale.name, xml: decodeUtf8(bytes), notices };
}

// ---------------------------------------------------------------------
// Indice dell'archivio
// ---------------------------------------------------------------------

function leggiIndice(data: Uint8Array, limits: MxlLimits): Entry[] {
  const vista = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const eocd = trovaEocd(vista, data.length);

  const quante = vista.getUint16(eocd + 10, true);
  const dimensioneIndice = vista.getUint32(eocd + 12, true);
  const inizioIndice = vista.getUint32(eocd + 16, true);

  if (quante > limits.maxEntries) throw new MxlError('l’archivio contiene troppi file');
  if (inizioIndice + dimensioneIndice > data.length) {
    throw new MxlError('l’archivio è danneggiato: l’indice punta fuori dal file');
  }

  const voci: Entry[] = [];
  let p = inizioIndice;

  for (let i = 0; i < quante; i++) {
    if (p + 46 > data.length) throw new MxlError('l’archivio è danneggiato: indice troncato');
    if (vista.getUint32(p, true) !== CENTRAL_SIGNATURE) {
      throw new MxlError('l’archivio è danneggiato: indice non riconosciuto');
    }

    const method = vista.getUint16(p + 10, true);
    const compressedSize = vista.getUint32(p + 20, true);
    const uncompressedSize = vista.getUint32(p + 24, true);
    const nameLen = vista.getUint16(p + 28, true);
    const extraLen = vista.getUint16(p + 30, true);
    const commentLen = vista.getUint16(p + 32, true);
    const localOffset = vista.getUint32(p + 42, true);

    if (p + 46 + nameLen > data.length) throw new MxlError('l’archivio è danneggiato: nome troncato');
    const name = decodeUtf8(data.subarray(p + 46, p + 46 + nameLen));

    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new MxlError('l’archivio usa il formato ZIP64, che non so ancora leggere');
    }
    controllaNome(name);

    voci.push({ name, method, compressedSize, uncompressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  const totale = voci.reduce((n, v) => n + v.uncompressedSize, 0);
  if (totale > limits.maxTotalBytes) {
    throw new MxlError('l’archivio contiene molti più dati di quanti ne possa contenere uno spartito');
  }
  return voci;
}

function trovaEocd(vista: DataView, lunghezza: number): number {
  // Il commento finale può essere lungo fino a 65535 byte: si cerca
  // all'indietro, non si assume che l'indice sia proprio in fondo.
  const minimo = Math.max(0, lunghezza - 22 - 0xffff);
  for (let p = lunghezza - 22; p >= minimo; p--) {
    if (vista.getUint32(p, true) === EOCD_SIGNATURE) return p;
  }
  throw new MxlError('non è un archivio .mxl valido');
}

/**
 * Rifiuta i nomi costruiti per uscire dall'archivio.
 *
 * Questo lettore non scrive niente su disco, quindi non sarebbe
 * sfruttabile; ma un nome così dice che il file è stato costruito per
 * fare danno, e un file del genere non si apre.
 */
function controllaNome(name: string): void {
  if (name.length === 0) throw new MxlError('l’archivio contiene un file senza nome');
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.includes('\\')) {
    throw new MxlError('l’archivio contiene un percorso assoluto: non lo apro');
  }
  if (name.split('/').some((parte) => parte === '..')) {
    throw new MxlError('l’archivio contiene un percorso che esce dall’archivio: non lo apro');
  }
  if (name.includes('\0')) throw new MxlError('l’archivio contiene un nome non valido');
}

// ---------------------------------------------------------------------
// Estrazione
// ---------------------------------------------------------------------

function estrai(data: Uint8Array, voce: Entry, limits: MxlLimits): Uint8Array {
  if (voce.uncompressedSize > limits.maxEntryBytes) {
    throw new MxlError(`il file ${voce.name} dentro l’archivio è troppo grande`);
  }
  // Rapporto di compressione: è la firma di una bomba zip, e si vede
  // dall'indice senza decomprimere niente.
  if (
    voce.compressedSize > 0 &&
    voce.uncompressedSize / voce.compressedSize > limits.maxRatio
  ) {
    throw new MxlError('l’archivio è costruito per occupare tutta la memoria: non lo apro');
  }

  const vista = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const p = voce.localOffset;
  if (p + 30 > data.length) throw new MxlError('l’archivio è danneggiato: file troncato');
  if (vista.getUint32(p, true) !== LOCAL_SIGNATURE) {
    throw new MxlError('l’archivio è danneggiato: intestazione non riconosciuta');
  }

  const nameLen = vista.getUint16(p + 26, true);
  const extraLen = vista.getUint16(p + 28, true);
  const inizio = p + 30 + nameLen + extraLen;
  const fine = inizio + voce.compressedSize;
  if (fine > data.length) throw new MxlError('l’archivio è danneggiato: dati troncati');

  const payload = data.subarray(inizio, fine);

  if (voce.method === 0) return payload;
  if (voce.method !== 8) {
    throw new MxlError('l’archivio usa una compressione che non so leggere');
  }

  try {
    const risultato = inflateSync(payload, { out: new Uint8Array(voce.uncompressedSize) });
    return risultato;
  } catch {
    throw new MxlError('l’archivio è danneggiato: non riesco a decomprimerlo');
  }
}

function percorsoDalContainer(bytes: Uint8Array): string | null {
  const radice = parseXml(decodeUtf8(bytes));
  const rootfiles = child(radice, 'rootfiles');
  for (const rootfile of childrenNamed(rootfiles, 'rootfile')) {
    const percorso = rootfile.attrs['full-path'];
    if (percorso) return percorso;
  }
  return null;
}
