import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { FileExportPort, SavedFile } from '../../core/ports/fileExport';

/**
 * Salvataggio su iOS e Android.
 *
 * Il file si scrive nella cartella dei documenti dell'app e poi si
 * apre il foglio di condivisione, che è il solo modo perché l'utente
 * possa davvero metterlo dove vuole. Se la condivisione non è
 * disponibile si dice dove il file è rimasto, invece di far finta di
 * averlo consegnato.
 */
export class NativeFileExport implements FileExportPort {
  async save(name: string, text: string, mime = 'application/json'): Promise<SavedFile> {
    const file = new File(Paths.document, name);
    // Riscrivere un backup con lo stesso nome deve funzionare.
    if (file.exists) file.delete();
    file.create();
    file.write(text);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name });
      return { delivered: true, where: file.uri };
    }
    return { delivered: false, where: file.uri };
  }
}
