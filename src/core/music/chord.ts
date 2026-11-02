import { pitchClass, noteNameIt } from './note';
import type { PitchClass } from './note';

/**
 * Riconoscimento di triadi.
 *
 * Deterministico e volutamente povero: tre classi di altezza, una
 * tabella di intervalli, nessuna analisi di contesto. Non sa niente di
 * tonalità, funzioni armoniche o settime, e non deve saperlo: serve a
 * scrivere "DO mag" sotto un accordo mentre si studia, non ad
 * analizzare una partitura.
 *
 * Il principio che guida i casi dubbi: meglio nessun nome che un nome
 * sbagliato. Tutto ciò che non combacia esattamente con una delle
 * strutture previste non viene etichettato.
 */

export type TriadQuality = 'mag' | 'min' | 'dim' | 'aum' | 'sus2' | 'sus4';

export interface Triad {
  /** Fondamentale, dedotta dalla struttura degli intervalli. */
  root: PitchClass;
  quality: TriadQuality;
}

/**
 * Le strutture riconosciute, in semitoni dalla fondamentale.
 *
 * L'ordine conta. Le prime quattro sono terziarie e si escludono a
 * vicenda: per un dato insieme di note al massimo una rotazione
 * combacia, quindi la fondamentale esce dalla struttura e non da dove
 * la nota capita a cadere. Le sospese stanno in fondo perché sono
 * l'unico caso in cui due letture restano entrambe valide.
 */
const STRUTTURE: readonly (readonly [string, TriadQuality])[] = [
  ['0,4,7', 'mag'],
  ['0,3,7', 'min'],
  ['0,3,6', 'dim'],
  ['0,4,8', 'aum'],
  ['0,2,7', 'sus2'],
  ['0,5,7', 'sus4'],
];

const TABELLA = new Map<string, TriadQuality>(STRUTTURE.map(([k, v]) => [k, v]));

/** Le tre letture possibili: una per ogni nota presa come fondamentale. */
function letture(pcs: readonly PitchClass[]): { root: PitchClass; quality: TriadQuality }[] {
  const trovate: { root: PitchClass; quality: TriadQuality }[] = [];
  for (const root of pcs) {
    const intervalli = pcs
      .map((pc) => (((pc - root) % 12) + 12) % 12)
      .sort((a, b) => a - b)
      .join(',');
    const quality = TABELLA.get(intervalli);
    if (quality) trovate.push({ root, quality });
  }
  return trovate;
}

/**
 * Riconosce la triade formata da un gruppo di note.
 *
 * I raddoppi di ottava spariscono: FA#3 + LA#3 + DO#4 + FA#4 sono tre
 * classi di altezza, non quattro note, ed è l'accordo di FA# maggiore.
 *
 * Restituisce `null` quando le classi di altezza distinte non sono
 * esattamente tre, o quando la loro struttura non è fra quelle
 * previste: due note non bastano a decidere fra maggiore e minore, e
 * un grappolo non è un accordo.
 */
export function recognizeTriad(midis: readonly number[]): Triad | null {
  const pcs = [...new Set(midis.map(pitchClass))] as PitchClass[];
  if (pcs.length !== 3) return null;

  const trovate = letture(pcs);
  if (trovate.length === 0) return null;
  if (trovate.length === 1) return trovate[0] as Triad;

  /*
   * Due letture restano in piedi solo in due casi, ed entrambi sono
   * ambigui nella musica stessa, non nel codice:
   *
   *  - l'accordo aumentato divide l'ottava in parti uguali, quindi le
   *    tre rotazioni danno la stessa struttura e nulla, dentro
   *    l'accordo, dice quale nota sia la fondamentale;
   *  - sus2 e sus4 sono l'uno il rivolto dell'altro: DO-RE-SOL è DO
   *    sus2 letto dal basso e SOL sus4 letto da SOL.
   *
   * Si sceglie la lettura che poggia sul basso, che è quella che
   * l'orecchio sente come fondamentale quando manca altro contesto.
   */
  const basso = pitchClass(Math.min(...midis));
  return (trovate.find((l) => l.root === basso) ?? trovate[0]) as Triad;
}

/** Es. "DO mag", "FA# min". Usa i nomi italiani già in uso a schermo. */
export function triadLabelIt(triad: Triad): string {
  return `${noteNameIt(triad.root, false)} ${triad.quality}`;
}
