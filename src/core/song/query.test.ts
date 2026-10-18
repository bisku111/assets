import { startsWithTwoHands } from './query';
import type { Hand, Song } from './types';
describe('brani a due mani', () => {
  const brano = (hands: Hand[][]): Song => ({
    schemaVersion: 1, id: 'x', slug: 'x', title: 'x', artistId: 'a', artistName: 'A',
    coverColors: ['#000', '#111'], bpm: 100, keySignature: 'C', timeSignature: [4, 4],
    durationMs: 1000, baseDifficulty: 'beginner', isFree: true, tags: [],
    license: { status: 'original', owner: null, type: null, territory: 'WW', startDate: null, endDate: null },
    arrangements: hands.map((h, i) => ({
      id: `x-${i}`,
      difficulty: (['intermediate', 'beginner', 'easy'] as const)[i] ?? 'complete',
      hands: h, suggestedStartRate: 0.7, durationMs: 1000, sections: [], notes: [], chords: [],
    })),
  });

  it('riconosce il brano che parte già a due mani', () => {
    // Il livello più facile è il secondo in elenco: conta quello, non l'ordine.
    expect(startsWithTwoHands(brano([['right'], ['right', 'left']]))).toBe(true);
  });

  it('non conta il brano che diventa a due mani solo salendo di livello', () => {
    expect(startsWithTwoHands(brano([['right', 'left'], ['right']]))).toBe(false);
  });

  it('non si rompe su un brano senza arrangiamenti', () => {
    expect(startsWithTwoHands(brano([]))).toBe(false);
  });
});
