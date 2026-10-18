import type { SongDef } from '../../core/song/builder';

/**
 * Brani di PUBBLICO DOMINIO.
 *
 * Criterio di ammissione, applicato senza eccezioni: melodia tradizionale
 * anonima, oppure autore deceduto da oltre settant'anni. Sono trascrizioni
 * proprie, non copiate da spartiti altrui: un'edizione critica recente è
 * a sua volta protetta, la melodia in se' no.
 */

const TRADITIONAL_LICENSE = {
  status: 'public_domain' as const,
  owner: null,
  type: 'traditional',
  territory: 'WW',
  startDate: null,
  endDate: null,
};

// =====================================================================
// Fra Martino campanaro — canone popolare (anonimo).
// Perfetto come secondo brano: cinque note, nessun salto, frasi ripetute.
// =====================================================================
export const FRA_MARTINO: SongDef = {
  id: 'song-fra-martino',
  slug: 'fra-martino-campanaro',
  title: 'Fra Martino campanaro',
  subtitle: 'Canone tradizionale',
  artistId: 'artist-tradizionale',
  artistName: 'Tradizionale e Classici',
  coverColors: ['#0F3D3È', '#2EC4B6'],
  bpm: 96,
  keySignature: 'C',
  isFree: true,
  tags: ['tradizionale', 'principianti', 'canone'],
  license: TRADITIONAL_LICENSE,
  arrangements: [
    {
      difficulty: 'beginner',
      suggestedStartRate: 0.6,
      sections: [
        { id: 'a', kind: 'verse', name: 'Fra Martino campanaro',
          right: 'DO4:1@1 RE4:1@2 MI4:1@3 DO4:1@1 DO4:1@1 RE4:1@2 MI4:1@3 DO4:1@1',
          chords: ['C', 'C'] },
        { id: 'b', kind: 'verse', name: 'Dormi tu?',
          right: 'MI4:1@3 FA4:1@4 SOL4:2@5 MI4:1@3 FA4:1@4 SOL4:2@5',
          chords: ['C', 'C'] },
        { id: 'c', kind: 'chorus', name: 'Suona le campane', loopRecommended: true,
          right: 'SOL4:0.5@5 LA4:0.5@5 SOL4:0.5@4 FA4:0.5@3 MI4:1@2 DO4:1@1 ' +
                 'SOL4:0.5@5 LA4:0.5@5 SOL4:0.5@4 FA4:0.5@3 MI4:1@2 DO4:1@1',
          chords: ['C', 'C'] },
        { id: 'd', kind: 'outro', name: 'Din don dan',
          right: 'DO4:1@2 SOL3:1@5 DO4:2@2 DO4:1@2 SOL3:1@5 DO4:2@2',
          chords: ['C', 'C'] },
      ],
    },
    {
      difficulty: 'easy',
      suggestedStartRate: 0.7,
      sections: [
        { id: 'a', kind: 'verse', name: 'Fra Martino campanaro',
          right: 'DO4:1@1 RE4:1@2 MI4:1@3 DO4:1@1 DO4:1@1 RE4:1@2 MI4:1@3 DO4:1@1',
          left: 'DO3:4@5 DO3:4@5', chords: ['C', 'C'] },
        { id: 'b', kind: 'verse', name: 'Dormi tu?',
          right: 'MI4:1@3 FA4:1@4 SOL4:2@5 MI4:1@3 FA4:1@4 SOL4:2@5',
          left: 'DO3:2@5 SOL2:2@5 DO3:2@5 SOL2:2@5', chords: ['C', 'C'] },
        { id: 'c', kind: 'chorus', name: 'Suona le campane', loopRecommended: true,
          right: 'SOL4:0.5@5 LA4:0.5@5 SOL4:0.5@4 FA4:0.5@3 MI4:1@2 DO4:1@1 ' +
                 'SOL4:0.5@5 LA4:0.5@5 SOL4:0.5@4 FA4:0.5@3 MI4:1@2 DO4:1@1',
          left: 'DO3:2@5 SOL2:2@5 DO3:2@5 SOL2:2@5', chords: ['C', 'C'] },
        { id: 'd', kind: 'outro', name: 'Din don dan',
          right: 'DO4:1@2 SOL3:1@5 DO4:2@2 DO4:1@2 SOL3:1@5 DO4:2@2',
          left: 'DO3:4@5 DO3:4~@5', chords: ['C', 'C'] },
      ],
    },
  ],
};

// =====================================================================
// Inno alla gioia — Ludwig van Beethoven (1770-1827), Nona Sinfonia,
// 1824. Pubblico dominio da quasi due secoli.
// =====================================================================
const GIOIA_A = 'MI4:1@3 MI4:1@3 FA4:1@4 SOL4:1@5 SOL4:1@5 FA4:1@4 MI4:1@3 RE4:1@2 ' +
                'DO4:1@1 DO4:1@1 RE4:1@2 MI4:1@3 MI4:1.5@3 RE4:0.5@2 RE4:2@2';
const GIOIA_B = 'MI4:1@3 MI4:1@3 FA4:1@4 SOL4:1@5 SOL4:1@5 FA4:1@4 MI4:1@3 RE4:1@2 ' +
                'DO4:1@1 DO4:1@1 RE4:1@2 MI4:1@3 RE4:1.5@2 DO4:0.5@1 DO4:2@1';

export const INNO_ALLA_GIOIA: SongDef = {
  id: 'song-inno-alla-gioia',
  slug: 'inno-alla-gioia',
  title: 'Inno alla gioia',
  subtitle: 'Ludwig van Beethoven, 1824',
  artistId: 'artist-tradizionale',
  artistName: 'Tradizionale e Classici',
  coverColors: ['#3D2A0F', '#D9A441'],
  bpm: 108,
  keySignature: 'C',
  isFree: true,
  tags: ['classica', 'principianti', 'famosa'],
  license: TRADITIONAL_LICENSE,
  arrangements: [
    {
      difficulty: 'beginner',
      suggestedStartRate: 0.6,
      sections: [
        { id: 'a', kind: 'verse', name: 'Tema', right: GIOIA_A, chords: ['C', 'G', 'C', 'G'] },
        { id: 'b', kind: 'chorus', name: 'Tema (risposta)', loopRecommended: true,
          right: GIOIA_B, chords: ['C', 'G', 'C', 'G'] },
      ],
    },
    {
      difficulty: 'easy',
      suggestedStartRate: 0.7,
      sections: [
        { id: 'a', kind: 'verse', name: 'Tema', right: GIOIA_A,
          left: 'DO3:4@5 SOL2:4@5 DO3:4@5 SOL2:4@5', chords: ['C', 'G', 'C', 'G'] },
        { id: 'b', kind: 'bridge', name: 'Parte centrale',
          right: 'RE4:1@2 RE4:1@2 MI4:1@3 DO4:1@1 RE4:1@2 MI4:0.5@3 FA4:0.5@4 MI4:1@3 DO4:1@1 ' +
                 'RE4:1@2 MI4:0.5@3 FA4:0.5@4 MI4:1@3 RE4:1@2 DO4:1@1 RE4:1@2 SOL3:2@5',
          left: 'SOL2:4@5 DO3:4@5 DO3:4@5 SOL2:4@5', chords: ['G', 'C', 'C', 'G'] },
        { id: 'c', kind: 'chorus', name: 'Tema finale', loopRecommended: true,
          right: GIOIA_B, left: 'DO3:4@5 SOL2:4@5 FA2:4@5 DO3:4~@5',
          chords: ['C', 'G', 'F', 'C'] },
      ],
    },
  ],
};

// =====================================================================
// Brilla brilla stellina — melodia tradizionale ("Ah! vous dirai-je,
// maman", 1761). Anonima e di pubblico dominio.
// =====================================================================
const BRILLA_A = 'DO4:1@1 DO4:1@1 SOL4:1@5 SOL4:1@5 LA4:1@5 LA4:1@5 SOL4:2@5 ' +
                 'FA4:1@4 FA4:1@4 MI4:1@3 MI4:1@3 RE4:1@2 RE4:1@2 DO4:2@1';
const BRILLA_B = 'SOL4:1@5 SOL4:1@5 FA4:1@4 FA4:1@4 MI4:1@3 MI4:1@3 RE4:2@2 ' +
                 'SOL4:1@5 SOL4:1@5 FA4:1@4 FA4:1@4 MI4:1@3 MI4:1@3 RE4:2@2';

export const BRILLA_BRILLA: SongDef = {
  id: 'song-brilla-brilla',
  slug: 'brilla-brilla-stellina',
  title: 'Brilla brilla stellina',
  subtitle: 'Melodia tradizionale',
  artistId: 'artist-tradizionale',
  artistName: 'Tradizionale e Classici',
  coverColors: ['#12213D', '#5B8DEF'],
  bpm: 100,
  keySignature: 'C',
  isFree: true,
  tags: ['tradizionale', 'principianti'],
  license: TRADITIONAL_LICENSE,
  arrangements: [
    {
      difficulty: 'beginner',
      suggestedStartRate: 0.6,
      sections: [
        { id: 'a', kind: 'verse', name: 'Brilla brilla', right: BRILLA_A, chords: ['C', 'C', 'F', 'C'] },
        { id: 'b', kind: 'bridge', name: 'Parte centrale', right: BRILLA_B, chords: ['C', 'G', 'C', 'G'] },
        { id: 'c', kind: 'chorus', name: 'Ripresa', loopRecommended: true, right: BRILLA_A, chords: ['C', 'C', 'F', 'C'] },
      ],
    },
    {
      difficulty: 'easy',
      suggestedStartRate: 0.7,
      sections: [
        { id: 'a', kind: 'verse', name: 'Brilla brilla', right: BRILLA_A,
          left: 'DO3:4@5 DO3:4@5 FA2:4@5 DO3:4@5', chords: ['C', 'C', 'F', 'C'] },
        { id: 'b', kind: 'bridge', name: 'Parte centrale', right: BRILLA_B,
          left: 'DO3:4@5 SOL2:4@5 DO3:4@5 SOL2:4@5', chords: ['C', 'G', 'C', 'G'] },
        { id: 'c', kind: 'chorus', name: 'Ripresa', loopRecommended: true, right: BRILLA_A,
          left: 'DO3:4@5 FA2:4@5 SOL2:4@5 DO3:4~@5', chords: ['C', 'F', 'G', 'C'] },
      ],
    },
  ],
};

export const PUBLIC_DOMAIN_SONGS: SongDef[] = [FRA_MARTINO, INNO_ALLA_GIOIA, BRILLA_BRILLA];
