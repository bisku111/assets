import type { SongDef } from '../../core/song/builder';

/**
 * Brani ORIGINALI scritti per questo progetto.
 *
 * Sono la risposta al vincolo di copyright: danno all'app un repertorio
 * nello spirito della canzone italiana (ballata in minore, ritornello che
 * sale, giro Am-F-C-G) senza usare una sola nota di materiale protetto.
 * I diritti sono del progetto, quindi sono distribuibili senza limiti.
 */

const ORIGINAL_LICENSE = {
  status: 'original' as const,
  owner: 'Maestro',
  type: 'proprietary',
  territory: 'WW',
  startDate: null,
  endDate: null,
};

// =====================================================================
// 1. Piano piano — il primissimo brano. Solo mano destra, note lunghe,
//    nessuna alterazione: si suona con cinque dita ferme sulla posizione
//    di DO. È pensato per essere completato al primo tentativo.
// =====================================================================
export const PIANO_PIANO: SongDef = {
  id: 'song-piano-piano',
  slug: 'piano-piano',
  title: 'Piano piano',
  subtitle: 'Il tuo primo brano',
  artistId: 'artist-maestro-originals',
  artistName: 'Maestro Originals',
  coverColors: ['#1F3A5F', '#4A90D9'],
  bpm: 66,
  keySignature: 'C',
  isFree: true,
  tags: ['primo-brano', 'principianti', 'mano-destra'],
  license: ORIGINAL_LICENSE,
  arrangements: [
    {
      difficulty: 'beginner',
      suggestedStartRate: 0.6,
      sections: [
        {
          id: 'a', kind: 'intro', name: 'Prima frase',
          right: 'DO4:2@1 RE4:2@2 MI4:2@3 DO4:2@1 MI4:2@3 FA4:2@4 SOL4:4@5',
          chords: ['C', '', 'C', 'G'],
        },
        {
          id: 'b', kind: 'verse', name: 'Seconda frase', loopRecommended: true,
          right: 'SOL4:2@5 FA4:2@4 MI4:2@3 RE4:2@2 DO4:4@1 -:4',
          chords: ['G', 'F', 'C', ''],
        },
      ],
    },
    {
      difficulty: 'easy',
      suggestedStartRate: 0.7,
      sections: [
        {
          id: 'a', kind: 'intro', name: 'Prima frase',
          right: 'DO4:2@1 RE4:2@2 MI4:2@3 DO4:2@1 MI4:2@3 FA4:2@4 SOL4:4@5',
          left: 'DO3:4@5 DO3:4@5 DO3:4@5 SOL2:4@5',
          chords: ['C', '', 'C', 'G'],
        },
        {
          id: 'b', kind: 'verse', name: 'Seconda frase', loopRecommended: true,
          right: 'SOL4:2@5 FA4:2@4 MI4:2@3 RE4:2@2 DO4:4@1 -:4',
          left: 'SOL2:4@5 FA2:4@5 DO3:4@5 DO3:4@5',
          chords: ['G', 'F', 'C', ''],
        },
      ],
    },
  ],
};

// =====================================================================
// 2. Ballata sul lungomare — ballata in LA minore, giro Am-F-C-G.
//    Tre arrangiamenti: è il brano che dimostra la progressione
//    didattica dello stesso pezzo su tre livelli.
// =====================================================================
const BALLATA_MELODY = {
  intro: 'LA4:1@1 DO5:1@3 SI4:2@2 LA4:1@1 SOL4:1@5 MI4:2@3 FA4:1@1 LA4:1@3 SOL4:2@2 MI4:4@1',
  verse:
    'MI4:1@1 LA4:1@4 LA4:1@4 SI4:1@5 DO5:2@5 SI4:2@4 LA4:1@3 SOL4:1@2 FA4:1@1 MI4:1@1 RE4:4@1 ' +
    'MI4:1@1 FA4:1@2 SOL4:1@3 LA4:1@4 DO5:2@5 SI4:2@4 LA4:1@3 MI4:1@1 FA4:1@2 SOL4:1@3 LA4:4@4',
  chorus:
    'LA4:2@1 DO5:2@3 MI5:2@5 RE5:2@4 DO5:1@3 SI4:1@2 LA4:2@1 SOL4:4@1 ' +
    'FA4:2@1 LA4:2@3 DO5:2@5 SI4:2@4 LA4:1@3 SOL4:1@2 MI4:2@1 LA4:4@4',
  outro: 'MI4:2@1 SOL4:2@3 LA4:2@4 SOL4:2@3 MI4:2@1 RE4:2@1 LA3:4~@5',
};

/** Un giro di arpeggio in crome su una battuta: basso, quinta, ottava, quinta. */
const arpeggio = (basso: string, quinta: string, ottava: string) =>
  `${basso}:0.5@5 ${quinta}:0.5@2 ${ottava}:0.5@1 ${quinta}:0.5@2 ` +
  `${basso}:0.5@5 ${quinta}:0.5@2 ${ottava}:0.5@1 ${quinta}:0.5@2`;

const ARP_AM = arpeggio('LA2', 'MI3', 'LA3');
const ARP_F = arpeggio('FA2', 'DO3', 'FA3');
const ARP_C = arpeggio('DO3', 'SOL3', 'DO4');
const ARP_G = arpeggio('SOL2', 'RE3', 'SOL3');

export const BALLATA_LUNGOMARE: SongDef = {
  id: 'song-ballata-lungomare',
  slug: 'ballata-sul-lungomare',
  title: 'Ballata sul lungomare',
  artistId: 'artist-maestro-originals',
  artistName: 'Maestro Originals',
  coverColors: ['#2B1B4D', '#8E5BFF'],
  bpm: 84,
  keySignature: 'Am',
  isFree: true,
  tags: ['ballata', 'italiana', 'due-mani'],
  license: ORIGINAL_LICENSE,
  arrangements: [
    {
      difficulty: 'beginner',
      suggestedStartRate: 0.6,
      sections: [
        {
          id: 'intro', kind: 'intro', name: 'Intro',
          right: 'LA4:2@1 DO5:2@3 SI4:2@2 LA4:2@1 SOL4:2@5 MI4:2@3 LA4:4@1',
          chords: ['Am', 'F', 'C', 'G'],
        },
        {
          id: 'chorus', kind: 'chorus', name: 'Ritornello', loopRecommended: true,
          right: 'LA4:2@1 DO5:2@3 MI5:2@5 RE5:2@4 DO5:2@3 LA4:2@1 SOL4:4@1',
          chords: ['Am', 'F', 'C', 'G'],
        },
      ],
    },
    {
      difficulty: 'easy',
      suggestedStartRate: 0.7,
      sections: [
        {
          id: 'intro', kind: 'intro', name: 'Intro',
          right: BALLATA_MELODY.intro,
          left: 'LA2:4@5 FA2:4@5 DO3:4@5 SOL2:4@5',
          chords: ['Am', 'F', 'C', 'G'],
        },
        {
          id: 'verse', kind: 'verse', name: 'Strofa',
          right: BALLATA_MELODY.verse,
          left: 'LA2:4@5 FA2:4@5 DO3:4@5 SOL2:4@5 LA2:4@5 FA2:4@5 SOL2:4@5 LA2:4@5',
          chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'Am'],
        },
        {
          id: 'chorus', kind: 'chorus', name: 'Ritornello', loopRecommended: true,
          right: BALLATA_MELODY.chorus,
          left: 'LA2:4@5 FA2:4@5 DO3:4@5 SOL2:4@5 FA2:4@5 DO3:4@5 SOL2:4@5 LA2:4@5',
          chords: ['Am', 'F', 'C', 'G', 'F', 'C', 'G', 'Am'],
        },
        {
          id: 'outro', kind: 'outro', name: 'Finale',
          right: BALLATA_MELODY.outro,
          left: 'LA2:4@5 FA2:4@5 SOL2:4@5 LA2:4~@5',
          chords: ['Am', 'F', 'G', 'Am'],
        },
      ],
    },
    {
      difficulty: 'intermediate',
      suggestedStartRate: 0.7,
      sections: [
        {
          id: 'intro', kind: 'intro', name: 'Intro',
          right: BALLATA_MELODY.intro,
          // La sinistra smette di fare da tappeto e diventa movimento:
          // è il vero salto di difficoltà fra Facile e Intermedio.
          left: [ARP_AM, ARP_F, ARP_C, ARP_G].join(' '),
          chords: ['Am', 'F', 'C', 'G'],
        },
        {
          id: 'verse', kind: 'verse', name: 'Strofa',
          right: BALLATA_MELODY.verse,
          left:
            'LA2+MI3:2@5 LA3:2@1 FA2+DO3:2@5 FA3:2@1 DO3+SOL3:2@5 DO4:2@1 SOL2+RE3:2@5 SOL3:2@1 ' +
            'LA2+MI3:2@5 LA3:2@1 FA2+DO3:2@5 FA3:2@1 SOL2+RE3:2@5 SOL3:2@1 LA2+MI3:2@5 LA3:2@1',
          chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'Am'],
        },
        {
          id: 'chorus', kind: 'chorus', name: 'Ritornello', loopRecommended: true,
          right: BALLATA_MELODY.chorus,
          left: [ARP_AM, ARP_F, ARP_C, ARP_G, ARP_F, ARP_C, ARP_G, 'LA2+MI3:4@5'].join(' '),
          chords: ['Am', 'F', 'C', 'G', 'F', 'C', 'G', 'Am'],
        },
        {
          id: 'outro', kind: 'outro', name: 'Finale',
          right: BALLATA_MELODY.outro,
          left: 'LA2+MI3:4@5 FA2+DO3:4@5 SOL2+RE3:4@5 LA2+MI3:4~@5',
          chords: ['Am', 'F', 'G', 'Am'],
        },
      ],
    },
  ],
};

// =====================================================================
// 3. Notte di settembre — ballata in DO maggiore, andamento lento.
//    Brano PREMIUM: serve a verificare che il gating funzioni davvero
//    (in catalogo si vede, le note no, finché non c'è abbonamento).
// =====================================================================
export const NOTTE_DI_SETTEMBRE: SongDef = {
  id: 'song-notte-settembre',
  slug: 'notte-di-settembre',
  title: 'Notte di settembre',
  artistId: 'artist-maestro-originals',
  artistName: 'Maestro Originals',
  coverColors: ['#101A3D', '#3F5BA8'],
  bpm: 76,
  keySignature: 'C',
  isFree: false,
  tags: ['ballata', 'lenta', 'due-mani'],
  license: ORIGINAL_LICENSE,
  arrangements: [
    {
      difficulty: 'easy',
      suggestedStartRate: 0.7,
      sections: [
        {
          id: 'intro', kind: 'intro', name: 'Intro',
          right: 'SOL4:2@3 MI4:1@1 SOL4:1@3 LA4:2@4 SOL4:2@3 MI4:1@1 RE4:1@2 DO4:2@1 RE4:4@2',
          left: 'DO3:4@5 LA2:4@5 FA2:4@5 SOL2:4@5',
          chords: ['C', 'Am', 'F', 'G'],
        },
        {
          id: 'verse', kind: 'verse', name: 'Strofa',
          right:
            'DO4:1@1 MI4:1@3 SOL4:1@5 MI4:1@3 LA4:2@4 SOL4:2@3 FA4:1@2 MI4:1@1 RE4:2@2 DO4:4@1 ' +
            'DO4:1@1 MI4:1@2 SOL4:1@4 DO5:1@5 SI4:2@4 LA4:2@3 SOL4:1@2 FA4:1@1 MI4:2@1 RE4:4@2',
          left: 'DO3:4@5 LA2:4@5 FA2:4@5 DO3:4@5 DO3:4@5 MI3:4@5 FA2:4@5 SOL2:4@5',
          chords: ['C', 'Am', 'F', 'C', 'C', 'Em', 'F', 'G'],
        },
        {
          id: 'chorus', kind: 'chorus', name: 'Ritornello', loopRecommended: true,
          right:
            'SOL4:2@1 DO5:2@4 SI4:2@3 SOL4:2@1 LA4:1@2 SI4:1@3 DO5:2@4 SOL4:4@1 ' +
            'FA4:2@1 LA4:2@3 SOL4:2@2 MI4:2@1 RE4:1@1 MI4:1@2 FA4:2@3 MI4:4@2',
          left: 'DO3:4@5 SOL2:4@5 LA2:4@5 DO3:4@5 FA2:4@5 DO3:4@5 SOL2:4@5 DO3:4@5',
          chords: ['C', 'G', 'Am', 'C', 'F', 'C', 'G', 'C'],
        },
        {
          id: 'outro', kind: 'outro', name: 'Finale',
          right: 'DO5:4@5 SOL4:4@3 MI4:4@1 DO4:4~@1',
          left: 'DO3:4@5 SOL2:4@5 FA2:4@5 DO3:4~@5',
          chords: ['C', 'G', 'F', 'C'],
        },
      ],
    },
    {
      difficulty: 'intermediate',
      suggestedStartRate: 0.6,
      sections: [
        {
          id: 'intro', kind: 'intro', name: 'Intro',
          right: 'SOL4:2@3 MI4:1@1 SOL4:1@3 LA4:2@4 SOL4:2@3 MI4:1@1 RE4:1@2 DO4:2@1 RE4:4@2',
          left: [
            'DO3:0.5@5 SOL3:0.5@2 MI4:0.5@1 SOL3:0.5@2 DO3:0.5@5 SOL3:0.5@2 MI4:0.5@1 SOL3:0.5@2',
            'LA2:0.5@5 MI3:0.5@2 LA3:0.5@1 MI3:0.5@2 LA2:0.5@5 MI3:0.5@2 LA3:0.5@1 MI3:0.5@2',
            'FA2:0.5@5 DO3:0.5@2 FA3:0.5@1 DO3:0.5@2 FA2:0.5@5 DO3:0.5@2 FA3:0.5@1 DO3:0.5@2',
            'SOL2:0.5@5 RE3:0.5@2 SOL3:0.5@1 RE3:0.5@2 SOL2:0.5@5 RE3:0.5@2 SOL3:0.5@1 RE3:0.5@2',
          ].join(' '),
          chords: ['C', 'Am', 'F', 'G'],
        },
        {
          id: 'chorus', kind: 'chorus', name: 'Ritornello', loopRecommended: true,
          right:
            'SOL4:2@1 DO5:2@4 SI4:2@3 SOL4:2@1 LA4:1@2 SI4:1@3 DO5:2@4 SOL4:4@1 ' +
            'FA4:2@1 LA4:2@3 SOL4:2@2 MI4:2@1 RE4:1@1 MI4:1@2 FA4:2@3 MI4:4@2',
          left:
            'DO3+SOL3:2@5 MI4:2@1 SOL2+RE3:2@5 SI3:2@1 LA2+MI3:2@5 DO4:2@1 DO3+SOL3:2@5 MI4:2@1 ' +
            'FA2+DO3:2@5 LA3:2@1 DO3+SOL3:2@5 MI4:2@1 SOL2+RE3:2@5 SI3:2@1 DO3+SOL3:4~@5',
          chords: ['C', 'G', 'Am', 'C', 'F', 'C', 'G', 'C'],
        },
      ],
    },
  ],
};

// =====================================================================
// 4. Estate a Rimini — brano mosso in SOL maggiore, crome nella melodia.
//    Copre il caso "ritmo veloce": è il banco di prova della precisione
//    ritmica e della funzione di rallentamento.
// =====================================================================
export const ESTATE_A_RIMINI: SongDef = {
  id: 'song-estate-rimini',
  slug: 'estate-a-rimini',
  title: 'Estate a Rimini',
  artistId: 'artist-maestro-originals',
  artistName: 'Maestro Originals',
  coverColors: ['#7A3B12', '#FF9F45'],
  bpm: 124,
  keySignature: 'G',
  isFree: false,
  tags: ['allegra', 'ritmo', 'crome'],
  license: ORIGINAL_LICENSE,
  arrangements: [
    {
      difficulty: 'easy',
      suggestedStartRate: 0.5,
      sections: [
        {
          id: 'intro', kind: 'intro', name: 'Intro',
          right: 'SOL4:1@1 SI4:1@3 RE5:1@5 SI4:1@3 LA4:2@2 SOL4:2@1 MI4:1@1 SOL4:1@3 LA4:1@4 SI4:1@5 DO5:2@5 SI4:2@4',
          left: 'SOL2:4@5 RE3:4@5 MI3:4@5 DO3:4@5',
          chords: ['G', 'D', 'Em', 'C'],
        },
        {
          id: 'chorus', kind: 'chorus', name: 'Ritornello', loopRecommended: true,
          right:
            'RE5:1@5 SI4:1@3 SOL4:2@1 LA4:1@2 SI4:1@3 LA4:2@2 SOL4:1@1 SI4:1@3 RE5:2@5 MI5:2@5 RE5:2@4 ' +
            'DO5:1@3 SI4:1@2 LA4:2@1 SOL4:4@1',
          left: 'SOL2:4@5 RE3:4@5 MI3:4@5 DO3:4@5 SOL2:4@5 RE3:4@5 SOL2:4@5',
          chords: ['G', 'D', 'Em', 'C', 'G', 'D', 'G'],
        },
      ],
    },
    {
      difficulty: 'intermediate',
      suggestedStartRate: 0.5,
      sections: [
        {
          id: 'chorus', kind: 'chorus', name: 'Ritornello', loopRecommended: true,
          right:
            'RE5:0.5@5 SI4:0.5@3 SOL4:1@1 SI4:1@3 RE5:1@5 LA4:0.5@2 SI4:0.5@3 LA4:1@2 SOL4:1@1 SI4:1@3 ' +
            'RE5:1@5 MI5:1@5 RE5:1@4 SI4:1@2 DO5:0.5@3 SI4:0.5@2 LA4:1@1 SOL4:2@1',
          left:
            'SOL2:1@5 RE3:1@2 SOL3:1@1 RE3:1@2 RE3:1@5 LA3:1@2 RE4:1@1 LA3:1@2 ' +
            'MI3:1@5 SI3:1@2 MI4:1@1 SI3:1@2 DO3:1@5 SOL3:1@2 DO4:1@1 SOL3:1@2 ' +
            'SOL2:1@5 RE3:1@2 SOL3:1@1 RE3:1@2',
          chords: ['G', 'D', 'Em', 'C', 'G'],
        },
      ],
    },
  ],
};

export const ORIGINAL_SONGS: SongDef[] = [
  PIANO_PIANO, BALLATA_LUNGOMARE, NOTTE_DI_SETTEMBRE, ESTATE_A_RIMINI,
];
