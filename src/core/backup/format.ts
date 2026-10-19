import type { SongProgressRecord } from '../ports/repository';
import { isPrivateImport } from '../song/license';
import type { Song } from '../song/types';
import { selectValidSongs, validateSong } from '../song/validate';

/**
 * Backup dei brani personali.
 *
 * Serve a una cosa concreta: i brani importati vivono solo sul
 * dispositivo, e un telefono si perde. Il file di backup è l'unico
 * modo di portarli altrove senza caricarli da nessuna parte — resta
 * tutto offline, dentro un file che l'utente possiede.
 *
 * È un JSON leggibile e versionato di proposito: un archivio binario
 * illeggibile sarebbe un formato ostaggio. Chi apre il file deve poter
 * capire cosa contiene.
 */

export const BACKUP_FORMAT = 'maestro-backup-v1';
export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_EXTENSION = '.maestro';

/** Come è stato importato un brano: serve a rifare la stessa scelta domani. */
export interface ImportMeta {
  importedAt: string;
  sourceName: string | null;
  sourceFormat: 'midi' | 'musicxml' | 'mxl' | null;
  splitMidi: number | null;
  quantizeDivision: number;
  partsUsed: number[];
  partsExcluded: number[];
}

export interface BackupEntry {
  song: Song;
  meta: ImportMeta;
  /** Progressi collegati a questo brano, se ce ne sono. */
  progress: SongProgressRecord[];
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  createdAt: string;
  app: string;
  entries: BackupEntry[];
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

// ---------------------------------------------------------------------
// Scrittura
// ---------------------------------------------------------------------

export function buildBackup(
  entries: readonly BackupEntry[],
  options: { createdAt?: string; app?: string } = {},
): BackupFile {
  // Nel backup finiscono solo i brani personali. Il catalogo non è
  // roba dell'utente e non va duplicato in un file che può girare.
  const personali = entries.filter((e) => isPrivateImport(e.song));
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: options.createdAt ?? new Date().toISOString(),
    app: options.app ?? 'Maestro',
    entries: personali,
  };
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

/** Nome proposto per il file, con la data: serve a distinguerli. */
export function backupFileName(createdAt: string = new Date().toISOString()): string {
  const giorno = createdAt.slice(0, 10);
  return `maestro-${giorno}${BACKUP_EXTENSION}`;
}

// ---------------------------------------------------------------------
// Lettura e ispezione
// ---------------------------------------------------------------------

export interface BackupSongInfo {
  id: string;
  title: string;
  notes: number;
  durationMs: number;
  importedAt: string | null;
  hasProgress: boolean;
}

export interface BackupInspection {
  createdAt: string | null;
  schemaVersion: number | null;
  app: string | null;
  /** Brani leggibili e validi. */
  entries: BackupEntry[];
  songs: BackupSongInfo[];
  /** Problemi trovati: vanno mostrati PRIMA di confermare. */
  errors: string[];
  /** Il file è di una versione che non so leggere. */
  incompatible: boolean;
}

/**
 * Apre un backup senza applicarlo.
 *
 * Non lancia eccezioni sui contenuti: raccoglie i problemi e li
 * restituisce, perché l'utente deve poterli leggere prima di
 * decidere. Un file illeggibile del tutto è invece un errore.
 */
export function inspectBackup(testo: string): BackupInspection {
  let grezzo: unknown;
  try {
    grezzo = JSON.parse(testo);
  } catch {
    throw new BackupError('Il file non è un backup di Maestro: non riesco a leggerlo.');
  }

  if (!grezzo || typeof grezzo !== 'object') {
    throw new BackupError('Il file non è un backup di Maestro.');
  }
  const dati = grezzo as Partial<BackupFile>;
  if (dati.format !== BACKUP_FORMAT) {
    throw new BackupError('Il file non è un backup di Maestro.');
  }

  const errors: string[] = [];
  const schemaVersion = typeof dati.schemaVersion === 'number' ? dati.schemaVersion : null;
  const incompatible = schemaVersion === null || schemaVersion > BACKUP_SCHEMA_VERSION;
  if (incompatible) {
    errors.push(
      `Questo backup è stato scritto da una versione più recente di Maestro (schema ${schemaVersion ?? '?'}). ` +
      'Aggiorna l’app per aprirlo.',
    );
    return {
      createdAt: typeof dati.createdAt === 'string' ? dati.createdAt : null,
      schemaVersion, app: typeof dati.app === 'string' ? dati.app : null,
      entries: [], songs: [], errors, incompatible: true,
    };
  }

  const grezze = Array.isArray(dati.entries) ? dati.entries : [];
  const entries: BackupEntry[] = [];

  grezze.forEach((voce, i) => {
    const song = (voce as BackupEntry | undefined)?.song;
    if (!song || typeof song !== 'object') {
      errors.push(`La voce ${i + 1} non contiene nessun brano ed è stata saltata.`);
      return;
    }
    const esito = validateSong(song);
    if (!esito.valid) {
      errors.push(
        `"${song.title ?? `voce ${i + 1}`}" è danneggiato e non è stato importato ` +
        `(${esito.errors[0]?.message ?? 'dati non validi'}).`,
      );
      return;
    }
    if (!isPrivateImport(song)) {
      errors.push(`"${song.title}" non è un brano personale ed è stato saltato.`);
      return;
    }
    entries.push({
      song,
      meta: normalizzaMeta((voce as BackupEntry).meta),
      progress: Array.isArray((voce as BackupEntry).progress) ? (voce as BackupEntry).progress : [],
    });
  });

  return {
    createdAt: typeof dati.createdAt === 'string' ? dati.createdAt : null,
    schemaVersion,
    app: typeof dati.app === 'string' ? dati.app : null,
    entries,
    songs: entries.map((e) => ({
      id: e.song.id,
      title: e.song.title,
      notes: e.song.arrangements.reduce((n, a) => n + a.notes.length, 0),
      durationMs: e.song.durationMs,
      importedAt: e.meta.importedAt || null,
      hasProgress: e.progress.length > 0,
    })),
    errors,
    incompatible: false,
  };
}

function normalizzaMeta(meta: Partial<ImportMeta> | undefined): ImportMeta {
  return {
    importedAt: typeof meta?.importedAt === 'string' ? meta.importedAt : '',
    sourceName: typeof meta?.sourceName === 'string' ? meta.sourceName : null,
    sourceFormat: meta?.sourceFormat ?? null,
    splitMidi: typeof meta?.splitMidi === 'number' ? meta.splitMidi : null,
    quantizeDivision: typeof meta?.quantizeDivision === 'number' ? meta.quantizeDivision : 0,
    partsUsed: Array.isArray(meta?.partsUsed) ? meta.partsUsed : [],
    partsExcluded: Array.isArray(meta?.partsExcluded) ? meta.partsExcluded : [],
  };
}

// ---------------------------------------------------------------------
// Fusione con la libreria esistente
// ---------------------------------------------------------------------

export type DuplicatePolicy = 'keep' | 'copy' | 'replace';

/**
 * Impronta di un brano, per riconoscere lo stesso materiale importato
 * due volte. L'identificatore non basta: reimportando lo stesso file
 * si ottiene un identificatore nuovo ma la stessa musica.
 */
export function songFingerprint(song: Song): string {
  const note = song.arrangements.reduce((n, a) => n + a.notes.length, 0);
  return `${song.slug}|${song.durationMs}|${note}`;
}

export interface MergeResult {
  entries: BackupEntry[];
  added: number;
  replaced: number;
  kept: number;
  copied: number;
  duplicates: string[];
}

/** I titoli già presenti, per avvisare prima di confermare. */
export function findDuplicates(
  esistenti: readonly BackupEntry[],
  backup: readonly BackupEntry[],
): string[] {
  const impronte = new Set(esistenti.map((e) => songFingerprint(e.song)));
  const identificatori = new Set(esistenti.map((e) => e.song.id));
  return backup
    .filter((e) => impronte.has(songFingerprint(e.song)) || identificatori.has(e.song.id))
    .map((e) => e.song.title);
}

/**
 * Unisce un backup alla libreria.
 *
 * Un duplicato non viene mai sovrascritto in silenzio: la politica
 * arriva da fuori, cioè da una scelta esplicita dell'utente.
 */
export function mergeBackup(
  esistenti: readonly BackupEntry[],
  backup: readonly BackupEntry[],
  policy: DuplicatePolicy,
): MergeResult {
  const risultato: BackupEntry[] = [...esistenti];
  let added = 0;
  let replaced = 0;
  let kept = 0;
  let copied = 0;
  const duplicates: string[] = [];

  for (const voce of backup) {
    const impronta = songFingerprint(voce.song);
    const indice = risultato.findIndex(
      (e) => e.song.id === voce.song.id || songFingerprint(e.song) === impronta,
    );

    if (indice < 0) {
      risultato.unshift(voce);
      added++;
      continue;
    }

    duplicates.push(voce.song.title);
    if (policy === 'keep') { kept++; continue; }
    if (policy === 'replace') {
      risultato[indice] = voce;
      replaced++;
      continue;
    }

    // 'copy': entra come brano distinto, con un identificatore nuovo.
    risultato.unshift(comeCopia(voce));
    copied++;
  }

  return { entries: risultato, added, replaced, kept, copied, duplicates };
}

function comeCopia(voce: BackupEntry): BackupEntry {
  const suffisso = `-copia-${Date.now().toString(36)}`;
  const id = `${voce.song.id}${suffisso}`;
  const arrangements = voce.song.arrangements.map((a) => ({
    ...a,
    id: `${id}--${a.difficulty}`,
  }));
  return {
    song: { ...voce.song, id, slug: `${voce.song.slug}${suffisso}`, title: `${voce.song.title} (copia)`, arrangements },
    meta: voce.meta,
    // I progressi restano sull'originale: la copia è un brano nuovo.
    progress: [],
  };
}

/** Scarta i brani non validi: non deve mai crashare il player. */
export function validEntries(entries: readonly BackupEntry[]): BackupEntry[] {
  const validi = new Set(selectValidSongs(entries.map((e) => e.song)).songs.map((s) => s.id));
  return entries.filter((e) => validi.has(e.song.id));
}
