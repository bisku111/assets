import type { SongDef } from '../core/song/builder';

/**
 * Percorso didattico: esercizi originali, in ordine di difficolta'.
 *
 * Scale, arpeggi e progressioni di accordi non sono materiale tutelabile
 * — sono il vocabolario dello strumento — e questi sono comunque scritti
 * per il progetto. Ogni lezione introduce UNA cosa nuova: la lezione che
 * ne introduce due e' la lezione in cui l'allievo si perde.
 */

const ESERCIZIO = {
  status: 'original' as const,
  owner: 'Maestro',
  type: 'exercise',
  territory: 'WW',
  startDate: null,
  endDate: null,
};

function esercizio(
  numero: number,
  slug: string,
  title: string,
  subtitle: string,
  bpm: number,
  sezioni: SongDef['arrangements'][number]['sections'],
  colori: [string, string],
): SongDef {
  return {
    id: `lesson-${numero}-${slug}`,
    slug: `lezione-${numero}-${slug}`,
    title,
    subtitle,
    artistId: 'artist-maestro-originals',
    artistName: 'Maestro Originals',
    coverColors: colori,
    bpm,
    keySignature: 'C',
    isFree: true,
    tags: ['lezione', 'esercizio'],
    license: ESERCIZIO,
    arrangements: [{ difficulty: 'beginner', suggestedStartRate: 0.6, sections: sezioni }],
  };
}

// 1. Le cinque dita ferme: nessun movimento della mano, solo le dita.
export const LEZIONE_1 = esercizio(1, 'cinque-dita', 'Le cinque dita', 'Mano destra, posizione di DO', 60, [
  { id: 'salita', kind: 'exercise', name: 'In salita',
    right: 'DO4:1@1 RE4:1@2 MI4:1@3 FA4:1@4 SOL4:4@5' },
  { id: 'discesa', kind: 'exercise', name: 'In discesa', loopRecommended: true,
    right: 'SOL4:1@5 FA4:1@4 MI4:1@3 RE4:1@2 DO4:4@1' },
], ['#1F3A5F', '#4A90D9']);

// 2. Il ritmo: stesse note, durate diverse. Si cambia una cosa sola.
export const LEZIONE_2 = esercizio(2, 'ritmo', 'Il ritmo', 'Semiminime, minime e crome', 72, [
  { id: 'lunghe', kind: 'exercise', name: 'Note lunghe',
    right: 'DO4:2@1 MI4:2@3 SOL4:4@5 MI4:2@3 DO4:2@1 DO4:4@1' },
  { id: 'crome', kind: 'exercise', name: 'Note veloci', loopRecommended: true,
    right: 'DO4:0.5@1 RE4:0.5@2 MI4:0.5@3 FA4:0.5@4 SOL4:1@5 MI4:1@3 ' +
           'DO4:0.5@1 RE4:0.5@2 MI4:0.5@3 RE4:0.5@2 DO4:2@1' },
], ['#3D2A0F', '#D9A441']);

// 3. Gli accordi: piu' tasti insieme. Il primo vero salto di coordinazione.
export const LEZIONE_3 = esercizio(3, 'accordi', 'I primi accordi', 'DO, FA e SOL con la mano sinistra', 60, [
  { id: 'triadi', kind: 'exercise', name: 'Tre accordi',
    right: 'DO4+MI4+SOL4:4@1 FA3+LA3+DO4:4@1 SOL3+SI3+RE4:4@1 DO4+MI4+SOL4:4@1',
    chords: ['C', 'F', 'G', 'C'] },
  { id: 'giro', kind: 'exercise', name: 'Il giro di DO', loopRecommended: true,
    right: 'DO4+MI4+SOL4:2@1 LA3+DO4+MI4:2@1 FA3+LA3+DO4:2@1 SOL3+SI3+RE4:2@1 ' +
           'DO4+MI4+SOL4:2@1 LA3+DO4+MI4:2@1 FA3+LA3+DO4:2@1 SOL3+SI3+RE4:2@1',
    chords: ['C', 'Am', 'F', 'G'] },
], ['#0F3D3E', '#2EC4B6']);

// 4. Due mani: la destra fa la melodia, la sinistra tiene il basso.
export const LEZIONE_4 = esercizio(4, 'due-mani', 'Due mani insieme', 'Melodia a destra, bassi a sinistra', 60, [
  { id: 'bassi', kind: 'exercise', name: 'Un basso per battuta',
    right: 'DO4:1@1 RE4:1@2 MI4:1@3 FA4:1@4 SOL4:2@5 MI4:2@3 DO4:4@1',
    left: 'DO3:4@5 SOL2:4@5 DO3:4@5',
    chords: ['C', 'G', 'C'] },
  { id: 'alternato', kind: 'exercise', name: 'Basso e quinta', loopRecommended: true,
    right: 'MI4:2@3 SOL4:2@5 MI4:2@3 DO4:2@1 RE4:2@2 FA4:2@4 MI4:4@3',
    left: 'DO3:2@5 SOL3:2@2 DO3:2@5 SOL3:2@2 SOL2:2@5 RE3:2@2 DO3:4@5',
    chords: ['C', 'C', 'G', 'C'] },
], ['#2B1B4D', '#8E5BFF']);

// 5. Il passaggio del pollice: come si supera la posizione fissa.
export const LEZIONE_5 = esercizio(5, 'scala', 'La scala di DO', 'Il passaggio del pollice', 66, [
  { id: 'ottava', kind: 'exercise', name: 'Un ottava in salita',
    right: 'DO4:1@1 RE4:1@2 MI4:1@3 FA4:1@1 SOL4:1@2 LA4:1@3 SI4:1@4 DO5:2@5' },
  { id: 'ritorno', kind: 'exercise', name: 'E in discesa', loopRecommended: true,
    right: 'DO5:1@5 SI4:1@4 LA4:1@3 SOL4:1@2 FA4:1@1 MI4:1@3 RE4:1@2 DO4:2@1' },
], ['#7A3B12', '#FF9F45']);

// 6. Tutto insieme: e' gia' musica, non piu' un esercizio.
export const LEZIONE_6 = esercizio(6, 'insieme', 'Tutto insieme', 'Melodia, accordi e due mani', 72, [
  { id: 'frase', kind: 'exercise', name: 'Prima frase',
    right: 'SOL4:1@3 MI4:1@1 SOL4:2@3 LA4:1@4 SOL4:1@3 MI4:2@1 RE4:4@2',
    left: 'DO3+MI3:4@5 FA2+LA2:4@5 SOL2+SI2:4@5',
    chords: ['C', 'F', 'G'] },
  { id: 'chiusa', kind: 'exercise', name: 'Chiusura', loopRecommended: true,
    right: 'MI4:1@1 SOL4:1@3 DO5:2@5 SI4:1@4 SOL4:1@3 MI4:2@1 DO4:4@1',
    left: 'DO3+MI3:4@5 SOL2+SI2:4@5 DO3+MI3:4~@5',
    chords: ['C', 'G', 'C'] },
], ['#101A3D', '#3F5BA8']);

export const LESSON_SONGS: SongDef[] = [
  LEZIONE_1, LEZIONE_2, LEZIONE_3, LEZIONE_4, LEZIONE_5, LEZIONE_6,
];

/** Cosa insegna ciascuna lezione: compare nell'elenco del percorso. */
export const LESSON_GOALS: Record<string, string> = {
  'lesson-1-cinque-dita': 'Trovare le note senza guardare le mani.',
  'lesson-2-ritmo': 'Tenere durate diverse restando a tempo.',
  'lesson-3-accordi': 'Premere piu tasti insieme, puliti.',
  'lesson-4-due-mani': 'Far fare due cose diverse alle due mani.',
  'lesson-5-scala': 'Passare il pollice per uscire dalle cinque dita.',
  'lesson-6-insieme': 'Mettere insieme tutto: e gia una canzone.',
};
