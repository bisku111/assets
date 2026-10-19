/**
 * Genera i file usati dalle prove end-to-end dell'importazione.
 *
 *   npx tsx scripts/make-import-fixture.ts
 *
 * I file sono versionati perché la prova deve partire da byte identici
 * a ogni esecuzione; questo script esiste perché quei byte siano
 * riproducibili e non binari calati dal cielo.
 *
 * Il contenuto musicale è una frase originale scritta per questo scopo.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  indicazioneTempo, nomeTraccia, programma, smf, tempo, traccia,
} from '../src/core/import/__fixtures__/smf';
import { battuta, nota, partitura } from '../src/core/import/__fixtures__/musicxml';
import { buildMxl } from '../src/core/import/__fixtures__/mxl';

const fuori = (nome: string) => join('scripts', 'fixtures', nome);

// ---- MIDI: due tracce, una per mano ---------------------------------
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

writeFileSync(fuori('prova-importazione.mid'), Buffer.from(smf([destra, sinistra], { division: TPQ })));

// ---- MusicXML: due pentagrammi, diteggiature, legatura, accordo ------
const SPARTITO = partitura([{
  id: 'P1', name: 'Piano', program: 1,
  battute: [
    battuta({
      number: 1, divisions: 2, staves: 2, beats: 4, fifths: 1, tempo: 96,
      contenuto:
        nota({ step: 'G', octave: 4, duration: 2, staff: 1, finger: 1 }) +
        nota({ step: 'B', octave: 4, duration: 2, staff: 1, finger: 3 }) +
        nota({ step: 'D', octave: 5, duration: 4, staff: 1, finger: 5, tie: 'start' }) +
        '<backup><duration>8</duration></backup>' +
        nota({ step: 'G', octave: 2, duration: 4, staff: 2, voice: 2, finger: 5 }) +
        nota({ step: 'D', octave: 3, duration: 4, staff: 2, voice: 2, finger: 1 }),
    }),
    battuta({
      number: 2,
      contenuto:
        nota({ step: 'D', octave: 5, duration: 2, staff: 1, finger: 5, tie: 'stop' }) +
        nota({ step: 'B', octave: 4, duration: 2, staff: 1, finger: 3 }) +
        nota({ step: 'G', octave: 4, duration: 4, staff: 1, finger: 1 }) +
        '<backup><duration>8</duration></backup>' +
        nota({ step: 'C', octave: 3, duration: 4, staff: 2, voice: 2, finger: 5 }) +
        nota({ step: 'E', octave: 3, duration: 4, staff: 2, voice: 2, finger: 3, chord: true }) +
        nota({ step: 'G', octave: 3, duration: 4, staff: 2, voice: 2, finger: 1, chord: true }) +
        nota({ rest: true, duration: 4, staff: 2, voice: 2 }),
    }),
  ],
}], { title: 'Prova MusicXML', composer: 'Maestro Originals' });

writeFileSync(fuori('prova-importazione.musicxml'), Buffer.from(SPARTITO, 'utf8'));
writeFileSync(fuori('prova-importazione.mxl'), Buffer.from(buildMxl(SPARTITO)));

console.log('scritti: prova-importazione.mid, .musicxml, .mxl');
