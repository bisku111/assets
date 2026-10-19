/**
 * Consegna di un file all'utente.
 *
 * È una porta perché "salvare un file" non vuol dire la stessa cosa in
 * un browser e su un telefono: nel primo caso è uno scaricamento, nel
 * secondo è un file scritto e poi condiviso. Chi esporta un backup non
 * deve sapere quale delle due sta succedendo.
 */

export interface SavedFile {
  /** Il file è stato consegnato all'utente. */
  delivered: boolean;
  /** Dove è finito, quando ha senso dirlo. */
  where: string | null;
}

export interface FileExportPort {
  save(name: string, text: string, mime?: string): Promise<SavedFile>;
}
