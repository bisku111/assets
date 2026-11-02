import { render } from '@testing-library/react-native';
import { buildStaffScore } from '../core/notation/staff';
import type { SongNote } from '../core/song/types';
import { StaffView } from './StaffView';

/**
 * Il nome dell'accordo sul pentagramma.
 *
 * `chord.test.ts` verifica il riconoscitore in isolamento; qui si
 * verifica che arrivi davvero a schermo passando per il
 * raggruppamento vero di `buildStaffScore`, cioe' che il gruppo
 * grafico e il gruppo armonico siano lo stesso insieme di note.
 *
 * I testi si leggono dall'albero e non con `getByText`: dentro un SVG
 * la stringa sta in una prop di `RNSVGTSpan`, non in un nodo di
 * testo, e una query che non la trova mai farebbe passare da sola
 * ogni verifica "non deve comparire".
 */

function testiDi(albero: any): string[] {
  const trovati: string[] = [];
  const cammina = (n: any): void => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(cammina); return; }
    if (typeof n.props?.content === 'string') trovati.push(n.props.content);
    (n.children ?? []).forEach(cammina);
  };
  cammina(albero);
  return trovati;
}

function disegna(midis: number[]): { testi: string[]; altezza: unknown } {
  const notes: SongNote[] = midis.map((midi) => ({
    midi, startMs: 0, durationMs: 500, hand: 'right' as const,
  }));
  const score = buildStaffScore(notes, { keySignature: 'C', msPerBeat: 500 });
  const { toJSON, unmount } = render(
    <StaffView
      score={score} positionMs={0} msPerBar={2000} width={300}
      statuses={new Map()} waitingIndex={null} windowMs={4000} clefs={['treble']}
    />,
  );
  const albero: any = toJSON();
  const stile = [albero?.props?.style].flat(2).find((s: any) => s && 'height' in s);
  const risultato = { testi: testiDi(albero), altezza: stile?.height };
  unmount();
  return risultato;
}

/** Il nome dell'accordo, se c'e'. Le qualita' sono quelle supportate. */
const etichetta = (midis: number[]): string | undefined =>
  disegna(midis).testi.find((t) => /^\S+ (mag|min|dim|aum|sus2|sus4)$/.test(t));

describe('nome della triade sul pentagramma', () => {
  it('etichetta una maggiore in posizione fondamentale', () => {
    expect(etichetta([60, 64, 67])).toBe('DO mag');
  });

  it('etichetta il primo rivolto con la fondamentale giusta', () => {
    expect(etichetta([64, 67, 72])).toBe('DO mag');
  });

  it('etichetta il secondo rivolto con la fondamentale giusta', () => {
    expect(etichetta([67, 72, 76])).toBe('DO mag');
  });

  it('etichetta una minore', () => {
    expect(etichetta([69, 72, 76])).toBe('LA min');
  });

  it('ignora il raddoppio di ottava', () => {
    expect(etichetta([54, 58, 61, 66])).toBe('FA# mag');
  });

  it('i nomi delle singole note restano accanto a quello dell accordo', () => {
    const { testi } = disegna([60, 64, 67]);
    expect(testi).toEqual(['DO mag', 'SOL', 'MI', 'DO']);
  });
});

describe('gruppi che non vanno etichettati', () => {
  it('una nota sola', () => {
    expect(etichetta([60])).toBeUndefined();
  });

  it('un intervallo di due note', () => {
    expect(etichetta([60, 64])).toBeUndefined();
  });

  it('una settima: quattro classi di altezza', () => {
    expect(etichetta([60, 64, 67, 71])).toBeUndefined();
  });

  it('un grappolo di semitoni', () => {
    expect(etichetta([60, 61, 62])).toBeUndefined();
  });

  it('senza accordo restano solo i nomi delle note', () => {
    expect(disegna([60, 64]).testi).toEqual(['MI', 'DO']);
  });
});

describe('altezza del pentagramma', () => {
  it('non cambia quando un accordo viene riconosciuto', () => {
    // L'etichetta entra in una corsia che esiste gia': se cambiasse
    // l'altezza, lo spartito salterebbe a ogni accordo che scorre.
    const conAccordo = disegna([60, 64, 67]);
    expect(conAccordo.altezza).toBeGreaterThan(0);
    expect(disegna([60, 61, 62]).altezza).toBe(conAccordo.altezza);
    expect(disegna([60]).altezza).toBe(conAccordo.altezza);
  });
});
