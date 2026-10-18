import {
  barLines, buildStaffScore, clefForHand, keySignatureOf, keySignaturePositions, ledgerLines,
  rhythmicValue, spell, stepsBelowTop,
} from './staff';
import type { SongNote } from '../song/types';

const DO = (key = 'C') => keySignatureOf(key);

describe('armatura di chiave', () => {
  it('riconosce maggiori e minori sul circolo delle quinte', () => {
    expect(keySignatureOf('C')).toMatchObject({ kind: 'sharp', count: 0 });
    expect(keySignatureOf('G')).toMatchObject({ kind: 'sharp', count: 1 });
    expect(keySignatureOf('Am')).toMatchObject({ kind: 'sharp', count: 0 });
    expect(keySignatureOf('Dm')).toMatchObject({ kind: 'flat', count: 1 });
    expect(keySignatureOf('Eb')).toMatchObject({ kind: 'flat', count: 3 });
  });

  it('mette i diesis nell'+"'"+'ordine FA DO SOL RE LA', () => {
    // 3 = FA, 0 = DO, 4 = SOL.
    expect(keySignatureOf('A').letters).toEqual([3, 0, 4]);
  });

  it('su una tonalità sconosciuta non inventa alterazioni', () => {
    expect(keySignatureOf('Hm7/9')).toMatchObject({ kind: 'sharp', count: 0 });
  });
});

describe('scrittura della nota', () => {
  it('scrive i tasti neri col diesis nelle tonalità diesizzate', () => {
    expect(spell(66, DO('G'))).toEqual({ letter: 3, octave: 4, alteration: 1 }); // FA#4
  });

  it('scrive i tasti neri col bemolle nelle tonalità bemollizzate', () => {
    // In FA maggiore il tasto 70 è SIb3, non LA#3.
    expect(spell(70, DO('F'))).toEqual({ letter: 6, octave: 4, alteration: -1 });
  });

  it('non sbaglia ottava sui tasti neri al confine di ottava', () => {
    // SIb (70) appartiene all'ottava 4 anche se nasce da LA#4.
    expect(spell(70, DO('F')).octave).toBe(4);
    // DO#4 (61) resta in ottava 4.
    expect(spell(61, DO('C'))).toEqual({ letter: 0, octave: 4, alteration: 1 });
  });
});

describe('posizione sul rigo', () => {
  const pos = (midi: number, clef: 'treble' | 'bass') => stepsBelowTop(spell(midi, DO()), clef);

  it('mette MI4 sulla riga inferiore della chiave di violino', () => {
    expect(pos(64, 'treble')).toBe(8);
  });

  it('mette FA5 sulla riga superiore della chiave di violino', () => {
    expect(pos(77, 'treble')).toBe(0);
  });

  it('mette SOL2 sulla riga inferiore della chiave di basso', () => {
    expect(pos(43, 'bass')).toBe(8);
  });

  it('mette il DO centrale su un taglio addizionale in entrambe le chiavi', () => {
    // È il senso del sistema a due righi: lo stesso DO, appena sotto il
    // violino e appena sopra il basso.
    expect(pos(60, 'treble')).toBe(10);
    expect(ledgerLines(pos(60, 'treble'))).toEqual([10]);
    expect(pos(60, 'bass')).toBe(-2);
    expect(ledgerLines(pos(60, 'bass'))).toEqual([-2]);
  });

  it('non mette tagli alle note dentro al rigo', () => {
    for (let u = 0; u <= 8; u++) expect(ledgerLines(u)).toEqual([]);
  });

  it('aggiunge un taglio ogni due mezzi spazi fuori dal rigo', () => {
    expect(ledgerLines(14)).toEqual([10, 12, 14]);
    expect(ledgerLines(-5)).toEqual([-2, -4]);
  });
});

describe('valore ritmico', () => {
  const beat = 500; // 120 BPM

  it('riconosce il valore scritto nonostante il fattore di legato', () => {
    // Il compositore scrive 1 movimento, il builder produce 470 ms.
    expect(rhythmicValue(470, beat)).toEqual({ head: 'quarter', dotted: false });
    expect(rhythmicValue(940, beat)).toEqual({ head: 'half', dotted: false });
    expect(rhythmicValue(235, beat)).toEqual({ head: 'eighth', dotted: false });
  });

  it('riconosce i valori puntati', () => {
    expect(rhythmicValue(705, beat)).toEqual({ head: 'quarter', dotted: true });
  });

  it('non fa esplodere una nota tenuta col pedale', () => {
    // 4 movimenti con fattore 1.6 = 3200 ms: resta una semibreve.
    expect(rhythmicValue(3200, beat).head).toBe('whole');
  });
});

describe('costruzione del rigo', () => {
  const nota = (over: Partial<SongNote>): SongNote => ({
    midi: 60, startMs: 0, durationMs: 470, hand: 'right', ...over,
  });

  it('scrive la mano destra in violino e la sinistra in basso', () => {
    expect(clefForHand('right')).toBe('treble');
    expect(clefForHand('left')).toBe('bass');
  });

  it('raggruppa in un accordo le note con lo stesso attacco e la stessa mano', () => {
    const score = buildStaffScore(
      [nota({ midi: 60 }), nota({ midi: 64 }), nota({ midi: 67 })],
      { keySignature: 'C', msPerBeat: 500 },
    );
    expect(score.items).toHaveLength(1);
    expect(score.items[0]?.heads.map((h) => h.midi)).toEqual([67, 64, 60]); // acuto -> grave
  });

  it('non unisce note di mani diverse nello stesso accordo', () => {
    const score = buildStaffScore(
      [nota({ midi: 60, hand: 'right' }), nota({ midi: 48, hand: 'left' })],
      { keySignature: 'C', msPerBeat: 500 },
    );
    expect(score.items).toHaveLength(2);
    expect(score.items.map((i) => i.clef).sort()).toEqual(['bass', 'treble']);
  });

  it('sposta a destra la testa che starebbe addosso alla precedente', () => {
    // DO4 e RE4: distanza di seconda, non stanno in colonna.
    const score = buildStaffScore(
      [nota({ midi: 60 }), nota({ midi: 62 })],
      { keySignature: 'C', msPerBeat: 500 },
    );
    const teste = score.items[0]?.heads ?? [];
    expect(teste.map((h) => h.shifted)).toEqual([false, true]);
  });

  it('non sposta le teste a distanza di terza', () => {
    const score = buildStaffScore(
      [nota({ midi: 60 }), nota({ midi: 64 })],
      { keySignature: 'C', msPerBeat: 500 },
    );
    expect((score.items[0]?.heads ?? []).every((h) => !h.shifted)).toBe(true);
  });

  it('omette l'+"'"+'alterazione già presente in armatura', () => {
    const inSol = buildStaffScore([nota({ midi: 66 })], { keySignature: 'G', msPerBeat: 500 });
    expect(inSol.items[0]?.heads[0]?.accidental).toBeNull();

    const inDo = buildStaffScore([nota({ midi: 66 })], { keySignature: 'C', msPerBeat: 500 });
    expect(inDo.items[0]?.heads[0]?.accidental).toBe('#');
  });

  it('segna il bequadro quando la nota contraddice l'+"'"+'armatura', () => {
    // FA naturale in SOL maggiore: l'armatura dice FA#, serve il bequadro.
    const score = buildStaffScore([nota({ midi: 65 })], { keySignature: 'G', msPerBeat: 500 });
    expect(score.items[0]?.heads[0]?.accidental).toBe('n');
  });

  it('gira il gambo in giù per le note alte e in su per le basse', () => {
    const alta = buildStaffScore([nota({ midi: 79 })], { keySignature: 'C', msPerBeat: 500 });
    expect(alta.items[0]?.stem).toBe('down');
    const bassa = buildStaffScore([nota({ midi: 60 })], { keySignature: 'C', msPerBeat: 500 });
    expect(bassa.items[0]?.stem).toBe('up');
  });

  it('conserva l'+"'"+'indice della nota, che lega la testa allo stato del motore', () => {
    const score = buildStaffScore(
      [nota({ midi: 60 }), nota({ midi: 62, startMs: 500 })],
      { keySignature: 'C', msPerBeat: 500 },
    );
    expect(score.items.map((i) => i.heads[0]?.noteIndex)).toEqual([0, 1]);
  });
});

describe('armatura sul rigo', () => {
  it('scrive i diesis nelle posizioni canoniche in chiave di violino', () => {
    // FA# riga superiore, DO# terzo spazio, SOL# sopra il rigo,
    // RE# seconda riga, LA# secondo spazio dal basso.
    expect(keySignaturePositions(keySignatureOf('B'), 'treble')).toEqual([0, 3, -1, 2, 5]);
  });

  it('scrive i diesis più in basso in chiave di basso', () => {
    // Lo stesso disegno, traslato di un grado: FA# quarta riga.
    expect(keySignaturePositions(keySignatureOf('B'), 'bass')).toEqual([2, 5, 1, 4, 7]);
  });

  it('scrive i bemolli a partire dal SI sulla riga mediana', () => {
    expect(keySignaturePositions(keySignatureOf('Eb'), 'treble')).toEqual([4, 1, 5]);
    expect(keySignaturePositions(keySignatureOf('Eb'), 'bass')).toEqual([6, 3, 7]);
  });

  it('non scrive nulla in DO maggiore', () => {
    expect(keySignaturePositions(keySignatureOf('C'), 'treble')).toEqual([]);
  });

  it('tiene ogni alterazione a portata del rigo', () => {
    // Nessuna alterazione va così lontano da richiedere tagli: sarebbe
    // scritta corretta ma illeggibile.
    for (const key of ['C#', 'Cb']) {
      for (const clef of ['treble', 'bass'] as const) {
        for (const u of keySignaturePositions(keySignatureOf(key), clef)) {
          expect(u).toBeGreaterThanOrEqual(-1);
          expect(u).toBeLessThanOrEqual(9);
        }
      }
    }
  });
});

describe('stanghette di battuta', () => {
  it('cadono sui multipli della battuta dentro la finestra', () => {
    expect(barLines(900, 4100, 2000)).toEqual([2000, 4000]);
  });

  it('non restituisce nulla se la finestra non contiene battute', () => {
    expect(barLines(2100, 3900, 2000)).toEqual([]);
  });
});
