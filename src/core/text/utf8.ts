/**
 * Decodifica UTF-8 senza dipendere da `TextDecoder`.
 *
 * Il core deve restare TypeScript puro e identico su ogni piattaforma:
 * `TextDecoder` esiste nei browser ma non è garantito su ogni motore
 * JavaScript mobile.
 */
export function decodeUtf8(bytes: Uint8Array): string {
  let risultato = '';
  let i = 0;
  // Il marcatore di ordine dei byte non fa parte del testo.
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;

  while (i < bytes.length) {
    const b0 = bytes[i++] as number;
    let codice: number;

    if (b0 < 0x80) codice = b0;
    else if (b0 < 0xe0) codice = ((b0 & 0x1f) << 6) | ((bytes[i++] as number) & 0x3f);
    else if (b0 < 0xf0) {
      codice = ((b0 & 0x0f) << 12) |
        (((bytes[i++] as number) & 0x3f) << 6) |
        ((bytes[i++] as number) & 0x3f);
    } else {
      codice = ((b0 & 0x07) << 18) |
        (((bytes[i++] as number) & 0x3f) << 12) |
        (((bytes[i++] as number) & 0x3f) << 6) |
        ((bytes[i++] as number) & 0x3f);
    }

    if (!Number.isFinite(codice) || codice < 0 || codice > 0x10ffff) codice = 0xfffd;
    risultato += String.fromCodePoint(codice);
  }
  return risultato;
}
