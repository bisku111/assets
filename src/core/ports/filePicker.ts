/**
 * Scelta di un file dal dispositivo.
 *
 * È una porta e non una chiamata diretta perché il modo di aprire un
 * selettore di file non ha niente in comune fra browser e telefono, e
 * perché il motore di importazione va provato senza nessuno dei due.
 */

export interface PickedFile {
  name: string;
  bytes: Uint8Array;
}

export interface FilePickerPort {
  /**
   * Apre il selettore. `accepts` sono le estensioni proposte: il
   * selettore del sistema le usa come filtro, non come garanzia, quindi
   * il formato si riconosce comunque dai byte.
   * null se l'utente annulla: non è un errore.
   */
  pick(accepts?: readonly string[]): Promise<PickedFile | null>;
}

/** Spartiti leggibili. */
export const SCORE_EXTENSIONS = ['.mid', '.midi', '.musicxml', '.xml', '.mxl'] as const;
/** Backup della libreria personale. */
export const BACKUP_EXTENSIONS = ['.maestro', '.json'] as const;
