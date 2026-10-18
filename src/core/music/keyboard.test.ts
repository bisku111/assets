import { keyboardGeometry } from './keyboard';

describe('keyboardGeometry', () => {
  it('allarga gli estremi fino al tasto bianco più vicino', () => {
    // DO#4 (61) .. FA#4 (66): deve partire da DO4 e finire su SOL4.
    const g = keyboardGeometry(61, 66);
    expect(g.start).toBe(60);
    expect(g.end).toBe(67);
  });

  it('copre esattamente la larghezza con i tasti bianchi', () => {
    const g = keyboardGeometry(60, 72); // un'ottava: 8 bianchi
    expect(g.whites).toHaveLength(8);
    const ultimo = g.box(72);
    expect(ultimo?.left ?? 0).toBeCloseTo(7 / 8, 10);
    expect((ultimo?.left ?? 0) + (ultimo?.width ?? 0)).toBeCloseTo(1, 10);
  });

  it('mette ogni nero a cavallo fra i due bianchi giusti', () => {
    const g = keyboardGeometry(60, 72);
    const do4 = g.box(60)!;
    const re4 = g.box(62)!;
    const doD = g.box(61)!;
    expect(doD.black).toBe(true);
    // Il centro del nero cade fra i due bianchi che lo circondano.
    expect(doD.center).toBeGreaterThan(do4.center);
    expect(doD.center).toBeLessThan(re4.center);
    // ...e coincide con il confine fra i due.
    expect(doD.center).toBeCloseTo(do4.left + do4.width, 10);
  });

  it('non lascia buchi né sovrapposizioni fra bianchi adiacenti', () => {
    const g = keyboardGeometry(21, 108); // 88 tasti
    expect(g.whites).toHaveLength(52);
    for (let i = 1; i < g.whites.length; i++) {
      const prima = g.box(g.whites[i - 1] as number)!;
      const dopo = g.box(g.whites[i] as number)!;
      expect(dopo.left).toBeCloseTo(prima.left + prima.width, 10);
    }
  });
});
