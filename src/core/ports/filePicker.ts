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
  /** Estensioni accettate, per il messaggio all'utente. */
  readonly accepts: readonly string[];
  /** null se l'utente annulla: non è un errore. */
  pick(): Promise<PickedFile | null>;
}

/** Quello che il selettore deve accettare oggi. */
export const MIDI_EXTENSIONS = ['.mid', '.midi'] as const;
