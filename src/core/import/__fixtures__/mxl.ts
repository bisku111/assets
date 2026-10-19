import { zipSync, type Zippable } from 'fflate';

/**
 * Costruttori di archivi .mxl per i test e per le prove end-to-end.
 *
 * Non fa parte dell'applicazione: nessun file di `src/app` lo importa.
 */

function encodeUtf8(testo: string): Uint8Array {
  const bytes: number[] = [];
  for (const carattere of testo) {
    let codice = carattere.codePointAt(0) as number;
    if (codice < 0x80) bytes.push(codice);
    else if (codice < 0x800) bytes.push(0xc0 | (codice >> 6), 0x80 | (codice & 0x3f));
    else if (codice < 0x10000) {
      bytes.push(0xe0 | (codice >> 12), 0x80 | ((codice >> 6) & 0x3f), 0x80 | (codice & 0x3f));
    } else {
      bytes.push(
        0xf0 | (codice >> 18), 0x80 | ((codice >> 12) & 0x3f),
        0x80 | ((codice >> 6) & 0x3f), 0x80 | (codice & 0x3f),
      );
    }
    void codice;
  }
  return new Uint8Array(bytes);
}

export const CONTAINER_XML = (percorso: string): string =>
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<container><rootfiles>' +
  `<rootfile full-path="${percorso}" media-type="application/vnd.recordare.musicxml+xml"/>` +
  '</rootfiles></container>';

/** Costruisce un archivio dai file dati, come stringhe o byte. */
export function buildZip(file: Record<string, string | Uint8Array>): Uint8Array {
  const contenuto: Zippable = {};
  for (const [nome, dati] of Object.entries(file)) {
    contenuto[nome] = typeof dati === 'string' ? encodeUtf8(dati) : dati;
  }
  return zipSync(contenuto);
}

/** Un .mxl completo: container più documento. */
export function buildMxl(xml: string, percorso = 'score.musicxml'): Uint8Array {
  return buildZip({
    'META-INF/container.xml': CONTAINER_XML(percorso),
    [percorso]: xml,
  });
}
