import { emptyMarks, expandRepeats, mergeMarks, type MeasureMarks } from './repeats';

/** Scrive i segni di una battuta in modo leggibile. */
function m(over: Partial<MeasureMarks> = {}): MeasureMarks {
  return { ...emptyMarks(), ...over };
}

const semplici = (quante: number) => Array.from({ length: quante }, () => m());

describe('senza ritornelli', () => {
  it('lascia le battute nell ordine scritto', () => {
    expect(expandRepeats(semplici(4)).order).toEqual([0, 1, 2, 3]);
  });

  it('non dice niente quando non c è niente da aprire', () => {
    expect(expandRepeats(semplici(4)).notices).toEqual([]);
  });

  it('non esplode su un brano vuoto', () => {
    expect(expandRepeats([]).order).toEqual([]);
  });
});

describe('ritornello semplice', () => {
  it('ripete la sezione fra |: e :|', () => {
    // |: 0 1 :| 2
    const marks = [m({ forwardRepeat: true }), m({ backwardRepeat: true }), m()];
    expect(expandRepeats(marks).order).toEqual([0, 1, 0, 1, 2]);
  });

  it('senza |: torna all inizio del brano', () => {
    // È la convenzione dello standard: un :| senza apertura rimanda
    // alla prima battuta.
    const marks = [m(), m(), m({ backwardRepeat: true })];
    expect(expandRepeats(marks).order).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it('rispetta il numero di esecuzioni dichiarato', () => {
    const marks = [m({ forwardRepeat: true }), m({ backwardRepeat: true, repeatTimes: 3 })];
    expect(expandRepeats(marks).order).toEqual([0, 1, 0, 1, 0, 1]);
  });

  it('un numero di esecuzioni assurdo vale comunque almeno due', () => {
    const marks = [m({ forwardRepeat: true }), m({ backwardRepeat: true, repeatTimes: 1 })];
    expect(expandRepeats(marks).order).toEqual([0, 1, 0, 1]);
  });

  it('dichiara quante battute sono diventate', () => {
    const marks = [m({ forwardRepeat: true }), m({ backwardRepeat: true }), m()];
    expect(expandRepeats(marks).notices[0]).toMatch(/3 battute scritte diventano 5/);
  });

  it('apre due ritornelli uno dopo l altro', () => {
    // |: 0 :| |: 1 :| 2
    const marks = [
      m({ forwardRepeat: true, backwardRepeat: true }),
      m({ forwardRepeat: true, backwardRepeat: true }),
      m(),
    ];
    expect(expandRepeats(marks).order).toEqual([0, 0, 1, 1, 2]);
  });

  it('dopo un ritornello il successivo non riparte da quello di prima', () => {
    // |: 0 1 :| 2 3 :|   — il secondo :| torna a 2, non a 0.
    const marks = [
      m({ forwardRepeat: true }), m({ backwardRepeat: true }),
      m(), m({ backwardRepeat: true }),
    ];
    expect(expandRepeats(marks).order).toEqual([0, 1, 0, 1, 2, 3, 2, 3]);
  });
});

describe('prima e seconda volta', () => {
  // |: 0 1 [1ª 2 :| [2ª 3 ] 4
  const conVolte = [
    m({ forwardRepeat: true }),
    m(),
    m({ endingStart: [1], endingStop: true, backwardRepeat: true }),
    m({ endingStart: [2], endingStop: true }),
    m(),
  ];

  it('suona la prima volta, ripete, poi suona la seconda', () => {
    expect(expandRepeats(conVolte).order).toEqual([0, 1, 2, 0, 1, 3, 4]);
  });

  it('la prima volta non viene mai risuonata', () => {
    const ordine = expandRepeats(conVolte).order;
    expect(ordine.filter((i) => i === 2)).toHaveLength(1);
  });

  it('regge volte lunghe più di una battuta', () => {
    // |: 0 [1ª 1 2 :| [2ª 3 4 ] 5
    const marks = [
      m({ forwardRepeat: true }),
      m({ endingStart: [1] }),
      m({ endingStop: true, backwardRepeat: true }),
      m({ endingStart: [2] }),
      m({ endingStop: true }),
      m(),
    ];
    expect(expandRepeats(marks).order).toEqual([0, 1, 2, 0, 3, 4, 5]);
  });

  it('regge una volta valida per più passaggi', () => {
    // La prima volta vale per il 1º e il 2º giro, la seconda per il 3º.
    const marks = [
      m({ forwardRepeat: true }),
      m({ endingStart: [1, 2], endingStop: true, backwardRepeat: true, repeatTimes: 3 }),
      m({ endingStart: [3], endingStop: true }),
    ];
    expect(expandRepeats(marks).order).toEqual([0, 1, 0, 1, 0, 2]);
  });

  it('non resta incastrato se una volta non si chiude mai', () => {
    // File scritto male: la volta comincia e non finisce.
    const marks = [
      m({ forwardRepeat: true }),
      m({ endingStart: [1], backwardRepeat: true }),
      m({ endingStart: [2], endingStop: true }),
    ];
    const ordine = expandRepeats(marks).order;
    expect(ordine.length).toBeLessThan(20);
    expect(ordine).toContain(2);
  });
});

describe('file ostili', () => {
  it('si ferma invece di girare all infinito', () => {
    // Un :| che rimanda a se stesso senza mai esaurirsi.
    const marks = [m({ forwardRepeat: true, backwardRepeat: true, repeatTimes: 99_999 })];
    const esito = expandRepeats(marks, { maxMeasures: 50 });
    expect(esito.order).toHaveLength(50);
    expect(esito.notices[0]).toMatch(/si richiudono su se stessi/);
  });
});

describe('segni sparsi su più parti', () => {
  it('unisce i ritornelli scritti su pentagrammi diversi', () => {
    // Molti file li segnano solo sul primo pentagramma; altri solo sul
    // secondo. Prenderne uno solo significherebbe perderli.
    const destra = [m({ forwardRepeat: true }), m()];
    const sinistra = [m(), m({ backwardRepeat: true })];
    const uniti = mergeMarks([destra, sinistra]);
    expect(uniti[0]?.forwardRepeat).toBe(true);
    expect(uniti[1]?.backwardRepeat).toBe(true);
    expect(expandRepeats(uniti).order).toEqual([0, 1, 0, 1]);
  });

  it('unisce anche i numeri delle volte', () => {
    const a = [m({ endingStart: [1] })];
    const b = [m({ endingStart: [2] })];
    expect(mergeMarks([a, b])[0]?.endingStart).toEqual([1, 2]);
  });

  it('regge parti di lunghezza diversa', () => {
    expect(mergeMarks([semplici(3), semplici(1)])).toHaveLength(3);
  });
});
