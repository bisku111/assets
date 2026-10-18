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

// =====================================================================
// 5. Valzer della domenica — il primo brano scritto per DUE MANI fin dal
//    livello principiante. Tre tempi, SOL maggiore.
//
//    La mano destra resta ferma nella posizione di SOL (pollice su SOL4,
//    mignolo su RE5): non deve mai spostarsi, e così tutta l'attenzione
//    va al coordinamento fra le due mani, che è la cosa nuova.
//
//    La sinistra impara il valzer in due passi: prima solo il basso
//    tenuto per tutta la battuta, poi il classico basso-accordo-accordo.
// =====================================================================

/** Basso sul primo movimento, accordo sul secondo e sul terzo. */
const valzer = (basso: string, accordo: string) => `${basso}:1@5 ${accordo}:1 ${accordo}:1`;

const VALZER_G = valzer('SOL2', 'RE3@2+SOL3@1');
const VALZER_C = valzer('DO3', 'MI3@3+SOL3@1');
const VALZER_D = valzer('RE3', 'FA#3@3+LA3@1');

const VALZER_MELODIA = {
  // G – C – G – D
  intro:
    'SOL4:1@1 SI4:1@3 RE5:1@5 ' +
    'DO5:2@4 SI4:1@3 ' +
    'LA4:1@2 SI4:1@3 SOL4:1@1 ' +
    'LA4:3@2',
  // G – G – C – G – C – G – D – G
  chorus:
    'RE5:1@5 SI4:1@3 SOL4:1@1 ' +
    'SI4:2@3 RE5:1@5 ' +
    'DO5:1@4 SI4:1@3 LA4:1@2 ' +
    'SOL4:3@1 ' +
    'DO5:1@4 RE5:1@5 DO5:1@4 ' +
    'SI4:2@3 SOL4:1@1 ' +
    'LA4:1@2 SI4:1@3 LA4:1@2 ' +
    'SOL4:3@1',
  // C – G – D – G
  outro:
    'DO5:1@4 SI4:1@3 LA4:1@2 ' +
    'SI4:2@3 SOL4:1@1 ' +
    'LA4:3@2 ' +
    'SOL4:3~@1',
};

export const VALZER_DOMENICA: SongDef = {
  id: 'song-valzer-domenica',
  slug: 'valzer-della-domenica',
  title: 'Valzer della domenica',
  subtitle: 'Il primo brano a due mani',
  artistId: 'artist-maestro-originals',
  artistName: 'Maestro Originals',
  coverColors: ['#3B2410', '#E0A458'],
  bpm: 120,
  keySignature: 'G',
  timeSignature: [3, 4],
  isFree: true,
  tags: ['due-mani', 'principianti', 'valzer', 'italiana'],
  license: ORIGINAL_LICENSE,
  arrangements: [
    {
      difficulty: 'beginner',
      suggestedStartRate: 0.6,
      sections: [
        {
          id: 'intro', kind: 'intro', name: 'Giravolta',
          right: VALZER_MELODIA.intro,
          // Un basso solo per battuta: la sinistra si limita a tenere il
          // tempo mentre la destra impara la melodia.
          left: 'SOL3:3@1 DO3:3@5 SOL3:3@1 RE3:3@4',
          chords: ['G', 'C', 'G', 'D'],
        },
        {
          id: 'chorus', kind: 'chorus', name: 'Ritornello', loopRecommended: true,
          right: VALZER_MELODIA.chorus,
          left: 'SOL3:3@1 SOL3:3@1 DO3:3@5 SOL3:3@1 DO3:3@5 SOL3:3@1 RE3:3@4 SOL3:3@1',
          chords: ['G', 'G', 'C', 'G', 'C', 'G', 'D', 'G'],
        },
        {
          id: 'outro', kind: 'outro', name: 'Inchino',
          right: VALZER_MELODIA.outro,
          left: 'DO3:3@5 SOL3:3@1 RE3:3@4 SOL3:3~@1',
          chords: ['C', 'G', 'D', 'G'],
        },
      ],
    },
    {
      difficulty: 'easy',
      suggestedStartRate: 0.6,
      sections: [
        {
          id: 'intro', kind: 'intro', name: 'Giravolta',
          right: VALZER_MELODIA.intro,
          left: `${VALZER_G} ${VALZER_C} ${VALZER_G} ${VALZER_D}`,
          chords: ['G', 'C', 'G', 'D'],
        },
        {
          id: 'chorus', kind: 'chorus', name: 'Ritornello', loopRecommended: true,
          right: VALZER_MELODIA.chorus,
          left:
            `${VALZER_G} ${VALZER_G} ${VALZER_C} ${VALZER_G} ` +
            `${VALZER_C} ${VALZER_G} ${VALZER_D} ${VALZER_G}`,
          chords: ['G', 'G', 'C', 'G', 'C', 'G', 'D', 'G'],
        },
        {
          id: 'outro', kind: 'outro', name: 'Inchino',
          right: VALZER_MELODIA.outro,
          left: `${VALZER_C} ${VALZER_G} ${VALZER_D} SOL2:1@5 RE3@2+SOL3@1:2~`,
          chords: ['C', 'G', 'D', 'G'],
        },
      ],
    },
  ],
};

// =====================================================================
// 6. Ultimo tram — ballata in RE minore, il secondo brano a due mani.
//
//    Carattere opposto al valzer: lento, quattro quarti, note lunghe.
//    Entrambe le mani restano in una posizione fissa di cinque dita
//    (destra RE4-LA4, sinistra DO3-SOL3) per tutto il livello
//    principiante: non c'è un solo spostamento da imparare.
//
//    L'armatura di RE minore porta un bemolle, e il SIb dell'accordo
//    di SOL minore si scrive bemolle, non LA#: è la tonalità a
//    deciderlo, e lo spartito lo mostra così.
// =====================================================================

/** Basso sul primo movimento, bicordo sul terzo. */
const ballata = (basso: string, bicordo: string) => `${basso}:2@5 ${bicordo}:2`;

const TRAM_DM = ballata('RE3', 'FA3@3+LA3@1');
const TRAM_F = ballata('FA3', 'LA3@3+DO4@1');
const TRAM_C = ballata('DO3', 'MI3@3+SOL3@1');
const TRAM_GM = ballata('SOL2', 'RE3@5+SIb3@1');

const TRAM_MELODIA = {
  // Dm – F – C – Dm
  verse:
    'RE4:1@1 FA4:1@3 LA4:2@5 ' +
    'SOL4:1@4 FA4:1@3 MI4:2@2 ' +
    'MI4:1@2 SOL4:1@4 MI4:2@2 ' +
    'RE4:4@1',
  // Gm – F – C – Dm, due volte
  chorus:
    'SOL4:2@4 LA4:2@5 ' +
    'LA4:1@5 SOL4:1@4 FA4:2@3 ' +
    'MI4:2@2 SOL4:2@4 ' +
    'FA4:3@3 MI4:1@2 ' +
    'RE4:1@1 SOL4:1@4 LA4:2@5 ' +
    'LA4:1@5 SOL4:1@4 FA4:1@3 MI4:1@2 ' +
    'MI4:2@2 RE4:2@1 ' +
    'RE4:4@1',
  // F – C – Dm – Dm
  outro:
    'LA4:1@5 SOL4:1@4 FA4:2@3 ' +
    'MI4:2@2 SOL4:2@4 ' +
    'FA4:1@3 MI4:1@2 RE4:2@1 ' +
    'RE4:4~@1',
};

export const ULTIMO_TRAM: SongDef = {
  id: 'song-ultimo-tram',
  slug: 'ultimo-tram',
  title: 'Ultimo tram',
  subtitle: 'Ballata in minore, due mani',
  artistId: 'artist-maestro-originals',
  artistName: 'Maestro Originals',
  coverColors: ['#101C2E', '#3E6DA8'],
  bpm: 72,
  keySignature: 'Dm',
  isFree: true,
  tags: ['due-mani', 'italiana', 'ballata', 'principianti'],
  license: ORIGINAL_LICENSE,
  arrangements: [
    {
      difficulty: 'beginner',
      suggestedStartRate: 0.6,
      sections: [
        {
          id: 'verse', kind: 'verse', name: 'Strofa',
          right: TRAM_MELODIA.verse,
          // Una nota sola per battuta: la sinistra tiene l'armonia e
          // basta, mentre la destra impara la melodia.
          left: 'RE3:4@4 FA3:4@2 DO3:4@5 RE3:4@4',
          chords: ['Dm', 'F', 'C', 'Dm'],
        },
        {
          id: 'chorus', kind: 'chorus', name: 'Ritornello', loopRecommended: true,
          right: TRAM_MELODIA.chorus,
          left: 'SOL3:4@1 FA3:4@2 DO3:4@5 RE3:4@4 SOL3:4@1 FA3:4@2 DO3:4@5 RE3:4@4',
          chords: ['Gm', 'F', 'C', 'Dm', 'Gm', 'F', 'C', 'Dm'],
        },
        {
          id: 'outro', kind: 'outro', name: 'Capolinea',
          right: TRAM_MELODIA.outro,
          left: 'FA3:4@2 DO3:4@5 RE3:4@4 RE3:4~@4',
          chords: ['F', 'C', 'Dm', 'Dm'],
        },
      ],
    },
    {
      difficulty: 'easy',
      suggestedStartRate: 0.6,
      sections: [
        {
          id: 'verse', kind: 'verse', name: 'Strofa',
          right: TRAM_MELODIA.verse,
          left: `${TRAM_DM} ${TRAM_F} ${TRAM_C} ${TRAM_DM}`,
          chords: ['Dm', 'F', 'C', 'Dm'],
        },
        {
          id: 'chorus', kind: 'chorus', name: 'Ritornello', loopRecommended: true,
          right: TRAM_MELODIA.chorus,
          left:
            `${TRAM_GM} ${TRAM_F} ${TRAM_C} ${TRAM_DM} ` +
            `${TRAM_GM} ${TRAM_F} ${TRAM_C} ${TRAM_DM}`,
          chords: ['Gm', 'F', 'C', 'Dm', 'Gm', 'F', 'C', 'Dm'],
        },
        {
          id: 'outro', kind: 'outro', name: 'Capolinea',
          right: TRAM_MELODIA.outro,
          left: `${TRAM_F} ${TRAM_C} ${TRAM_DM} RE3:2@5 FA3@3+LA3@1:2~`,
          chords: ['F', 'C', 'Dm', 'Dm'],
        },
      ],
    },
  ],
};

export const ORIGINAL_SONGS: SongDef[] = [
  PIANO_PIANO, VALZER_DOMENICA, ULTIMO_TRAM, BALLATA_LUNGOMARE, NOTTE_DI_SETTEMBRE, ESTATE_A_RIMINI,
];
