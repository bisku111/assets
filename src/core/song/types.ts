/**
 * Modello di dominio del brano.
 *
 * E' la stessa forma del JSON dei contenuti e delle righe del database:
 * un solo modello, nessuna traduzione mentale fra strati.
 */

export type Hand = 'left' | 'right';

export type DifficultyKey = 'beginner' | 'easy' | 'intermediate' | 'advanced' | 'complete';

export type SectionKind = 'intro' | 'verse' | 'chorus' | 'bridge' | 'solo' | 'outro' | 'exercise';

export type LicenseStatus =
  | 'original'        // scritto per questo progetto
  | 'public_domain'   // autore deceduto da oltre 70 anni, o tradizionale anonimo
  | 'cleared'         // licenza ottenuta dall'avente diritto
  | 'pending'         // in trattativa: nessun contenuto musicale associato
  | 'expired'
  | 'blocked';

/** Gli stati che autorizzano a servire il contenuto musicale. */
export const SERVABLE_LICENSE_STATUSES: readonly LicenseStatus[] = ['original', 'public_domain', 'cleared'];

export interface SongLicense {
  status: LicenseStatus;
  owner: string | null;
  type: string | null;
  /** Territorio in cui la licenza e' valida. 'WW' = mondiale. */
  territory: string;
  startDate: string | null;  // ISO yyyy-mm-dd
  endDate: string | null;
}

export interface SongNote {
  midi: number;
  startMs: number;
  durationMs: number;
  hand: Hand;
  /** Diteggiatura 1 (pollice) .. 5 (mignolo). */
  finger?: number;
  /** 0..1. Dinamica suggerita, non usata per il giudizio. */
  velocity?: number;
  sectionId?: string;
}

export interface SongSection {
  id: string;
  kind: SectionKind;
  name: string;
  startMs: number;
  endMs: number;
  /** Sezione che vale la pena ripetere in loop (di norma il ritornello). */
  loopRecommended?: boolean;
}

export interface SongChord {
  symbol: string;
  startMs: number;
  durationMs: number;
}

/**
 * Un arrangiamento e' il brano scritto per un livello di difficolta'.
 * Cambiano le note, non la canzone.
 */
export interface SongArrangement {
  id: string;
  difficulty: DifficultyKey;
  hands: Hand[];
  /** Velocita' iniziale consigliata (0.25..1). */
  suggestedStartRate: number;
  /**
   * Durata di QUESTO arrangiamento. Livelli diversi hanno lunghezze
   * diverse: la barra di avanzamento deve seguire quella giusta.
   */
  durationMs: number;
  sections: SongSection[];
  /** Ordinate per startMs crescente: lo garantisce validateSong(). */
  notes: SongNote[];
  chords: SongChord[];
}

export interface Song {
  schemaVersion: 1;
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  artistId: string;
  artistName: string;
  /** Colore di copertina: niente immagini protette nel repository. */
  coverColors: [string, string];
  bpm: number;
  keySignature: string;
  timeSignature: [number, number];
  durationMs: number;
  baseDifficulty: DifficultyKey;
  isFree: boolean;
  tags: string[];
  license: SongLicense;
  arrangements: SongArrangement[];
}

export interface Artist {
  id: string;
  slug: string;
  name: string;
  bio?: string;
  /** Artista presente in catalogo ma senza repertorio licenziato. */
  isPlaceholder: boolean;
  coverColors: [string, string];
  sortOrder: number;
}

export const DIFFICULTY_ORDER: readonly DifficultyKey[] = [
  'beginner', 'easy', 'intermediate', 'advanced', 'complete',
];

export const DIFFICULTY_LABEL_IT: Record<DifficultyKey, string> = {
  beginner: 'Principiante',
  easy: 'Facile',
  intermediate: 'Intermedio',
  advanced: 'Avanzato',
  complete: 'Completo',
};

export const DIFFICULTY_STARS: Record<DifficultyKey, number> = {
  beginner: 1, easy: 2, intermediate: 3, advanced: 4, complete: 5,
};

export const SECTION_LABEL_IT: Record<SectionKind, string> = {
  intro: 'Intro',
  verse: 'Strofa',
  chorus: 'Ritornello',
  bridge: 'Bridge',
  solo: 'Assolo',
  outro: 'Finale',
  exercise: 'Esercizio',
};
