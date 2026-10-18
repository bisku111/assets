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
 */

const KEY = 'maestro.importedSongs';

/**
 * Oltre questo numero l'archivio locale diventa lento da leggere a
 * ogni avvio, e nessuno studia trenta brani importati insieme.
 */
export const MAX_IMPORTED_SONGS = 30;

export class ImportedSongStore {
  constructor(private readonly store: KeyValueStore) {}

  /**
   * I brani salvati, scartando quelli che non passano la validazione.
   * Un brano scritto da una versione precedente dell'app non deve far
   * crashare il player: si perde quel brano, non la libreria.
   */
  async list(): Promise<Song[]> {
    const grezzi = await readJson<Song[]>(this.store, KEY, []);
    if (!Array.isArray(grezzi)) return [];
    return selectValidSongs(grezzi).songs;
  }

  async add(song: Song): Promise<void> {
    const attuali = await this.list();
    const senzaDoppione = attuali.filter((s) => s.id !== song.id);
    // Il più recente in testa, e si tengono solo i primi.
    const aggiornati = [song, ...senzaDoppione].slice(0, MAX_IMPORTED_SONGS);
    await writeJson(this.store, KEY, aggiornati);
  }

  async remove(songId: string): Promise<void> {
    const attuali = await this.list();
    await writeJson(this.store, KEY, attuali.filter((s) => s.id !== songId));
  }
}

export const importedSongs = new ImportedSongStore(asyncStorageStore);
