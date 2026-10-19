import type { ImportMeta } from '../../core/backup/format';
import { selectValidSongs } from '../../core/song/validate';
import type { Song } from '../../core/song/types';
import { asyncStorageStore } from './asyncStorageStore';
import { readJson, writeJson, type KeyValueStore } from './keyValue';

/**
 * I brani che l'utente ha importato dai propri file.
 *
 * Stanno solo qui, sul dispositivo. Non vengono caricati da nessuna
 * parte e non entrano nel catalogo: non sono contenuto del progetto,
 * sono materiale di chi l'ha importato. È la distinzione che tiene in
 * piedi la funzione senza violare i diritti di nessuno.
 *
 * Insieme al brano si conserva **come è stato importato**: quali parti,
 * quale divisione delle mani, quale allineamento. Serve a rifare la
 * stessa scelta domani e a finire nel backup.
 */

const KEY = 'maestro.importedSongs';

/**
 * Oltre questo numero l'archivio locale diventa lento da leggere a
 * ogni avvio, e nessuno studia trenta brani importati insieme.
 */
export const MAX_IMPORTED_SONGS = 30;

export interface ImportedEntry {
  song: Song;
  meta: ImportMeta;
}

export function emptyMeta(): ImportMeta {
  return {
    importedAt: '', sourceName: null, sourceFormat: null,
    splitMidi: null, quantizeDivision: 0, partsUsed: [], partsExcluded: [],
  };
}

export class ImportedSongStore {
  constructor(private readonly store: KeyValueStore) {}

  /**
   * Le voci salvate, scartando quelle che non passano la validazione.
   * Un brano scritto da una versione precedente dell'app non deve far
   * crashare il player: si perde quel brano, non la libreria.
   */
  async listEntries(): Promise<ImportedEntry[]> {
    const grezze = await readJson<unknown[]>(this.store, KEY, []);
    if (!Array.isArray(grezze)) return [];

    const voci = grezze.map(migra).filter((v): v is ImportedEntry => v !== null);
    const validi = new Set(selectValidSongs(voci.map((v) => v.song)).songs.map((s) => s.id));
    return voci.filter((v) => validi.has(v.song.id));
  }

  async list(): Promise<Song[]> {
    return (await this.listEntries()).map((v) => v.song);
  }

  async getMeta(songId: string): Promise<ImportMeta | null> {
    return (await this.listEntries()).find((v) => v.song.id === songId)?.meta ?? null;
  }

  async add(song: Song, meta: ImportMeta): Promise<void> {
    const attuali = await this.listEntries();
    const senzaDoppione = attuali.filter((v) => v.song.id !== song.id);
    // Il più recente in testa, e si tengono solo i primi.
    await this.replaceAll([{ song, meta }, ...senzaDoppione]);
  }

  /** Riscrive l'intera libreria: la usa il ripristino da backup. */
  async replaceAll(entries: readonly ImportedEntry[]): Promise<void> {
    await writeJson(this.store, KEY, entries.slice(0, MAX_IMPORTED_SONGS));
  }

  async remove(songId: string): Promise<void> {
    const attuali = await this.listEntries();
    await this.replaceAll(attuali.filter((v) => v.song.id !== songId));
  }

  /** Cancella tutto: serve ai collaudi e alla voce "svuota la libreria". */
  async clear(): Promise<void> {
    await this.store.remove(KEY);
  }
}

/**
 * Legge sia il formato attuale sia quello precedente.
 *
 * Le prime versioni salvavano un elenco di brani nudi, senza sapere
 * come fossero stati importati. Quei brani devono continuare a
 * funzionare: si avvolgono in una voce con i dati di importazione
 * vuoti, che è la verità — non si sa come sono stati fatti.
 */
function migra(grezzo: unknown): ImportedEntry | null {
  if (!grezzo || typeof grezzo !== 'object') return null;

  if ('song' in grezzo) {
    const voce = grezzo as Partial<ImportedEntry>;
    if (!voce.song || typeof voce.song !== 'object') return null;
    return { song: voce.song as Song, meta: { ...emptyMeta(), ...(voce.meta ?? {}) } };
  }

  if ('arrangements' in grezzo) {
    return { song: grezzo as Song, meta: emptyMeta() };
  }
  return null;
}

export const importedSongs = new ImportedSongStore(asyncStorageStore);
