import {
  frequencyToPitch, isBlackKey, midiToFrequency, noteNameEn, noteNameIt,
  octaveOf, parseNoteName, whiteKeyIndex,
} from './note';

describe('teoria musicale', () => {
  it('nomina le note in italiano con ottava', () => {
    expect(noteNameIt(60)).toBe('DO4');
    expect(noteNameIt(61)).toBe('DO#4');
    expect(noteNameIt(69)).toBe('LA4');
    expect(noteNameIt(71)).toBe('SI4');
    expect(noteNameIt(72, false)).toBe('DO');
  });

  it('nomina le note in inglese', () => {
    expect(noteNameEn(60)).toBe('C4');
    expect(noteNameEn(21)).toBe('A0');
  });

  it('calcola l ottava scientifica', () => {
    expect(octaveOf(60)).toBe(4);
    expect(octaveOf(59)).toBe(3);
  });

  it('riconosce i tasti neri', () => {
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(60)).toBe(false);
    expect(isBlackKey(70)).toBe(true);
  });

  it('converte MIDI in frequenza', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 6);
    expect(midiToFrequency(81)).toBeCloseTo(880, 6);
    expect(midiToFrequency(60)).toBeCloseTo(261.6256, 3);
  });

  it('converte una frequenza nella nota piu vicina con lo scarto in cent', () => {
    expect(frequencyToPitch(440)).toEqual({ midi: 69, cents: 0 });
    const calante = frequencyToPitch(437);
    expect(calante?.midi).toBe(69);
    expect(calante?.cents).toBeLessThan(0);
    expect(calante?.cents).toBeGreaterThan(-15);
    const ambigua = frequencyToPitch(midiToFrequency(60.49));
    expect(Math.abs(ambigua?.cents ?? 99)).toBeLessThanOrEqual(50);
  });

  it('rifiuta frequenze non valide', () => {
    expect(frequencyToPitch(0)).toBeNull();
    expect(frequencyToPitch(-10)).toBeNull();
  });

  it('interpreta i nomi delle note in entrambe le lingue', () => {
    expect(parseNoteName('DO4')).toBe(60);
    expect(parseNoteName('do#4')).toBe(61);
    expect(parseNoteName('C4')).toBe(60);
    expect(parseNoteName('SOL3')).toBe(55);
    expect(parseNoteName('Bb3')).toBe(58);
    expect(parseNoteName('H4')).toBeNull();
    expect(parseNoteName('')).toBeNull();
  });

  it('indicizza i tasti bianchi in modo monotono', () => {
    expect(whiteKeyIndex(60)).toBe(whiteKeyIndex(59) + 1);
    expect(whiteKeyIndex(72) - whiteKeyIndex(60)).toBe(7);
  });
});
