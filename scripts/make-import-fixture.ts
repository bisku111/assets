/**
 * Genera il file MIDI usato dalla prova end-to-end dell'importazione.
 *
 *   npx tsx scripts/make-import-fixture.ts
 *
 * Il file è versionato perché la prova deve partire da byte identici a
 * ogni esecuzione; questo script esiste perché quei byte siano
 * riproducibili e non un binario calato dal cielo.
 *
 * Il contenuto è una frase originale scritta per questo scopo.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  indicazioneTempo, nomeTraccia, programma, smf, tempo, traccia,
} from '../src/core/import/__fixtures__/smf';

const TPQ = 480;
const q = TPQ;

const destra = traccia(
  [
    { midi: 67, da: 0, durata: q },
    { midi: 69, da: q, durata: q },
    { midi: 71, da: q * 2, durata: q },
    { midi: 72, da: q * 3, durata: q },
    { midi: 71, da: q * 4, durata: q * 2 },
    { midi: 67, da: q * 6, durata: q * 2 },
  ],
  [...nomeTraccia('Piano Right'), ...programma(0, 0), ...tempo(500_000), ...indicazioneTempo(4, 4)],
);

const sinistra = traccia(
  [
    { midi: 48, da: 0, durata: q * 4, canale: 1 },
    { midi: 55, da: 0, durata: q * 4, canale: 1 },
    { midi: 43, da: q * 4, durata: q * 4, canale: 1 },
    { midi: 50, da: q * 4, durata: q * 4, canale: 1 },
  ],
  [...nomeTraccia('Piano Left'), ...programma(1, 0)],
);

const percorso = join('scripts', 'fixtures', 'prova-importazione.mid');
writeFileSync(percorso, Buffer.from(smf([destra, sinistra], { division: TPQ })));
console.log(`scritto ${percorso}`);
