import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import type { FilePickerPort, PickedFile } from '../../core/ports/filePicker';

/**
 * Selettore di file su iOS e Android.
 *
 * Il selettore restituisce un indirizzo, non il contenuto: il file si
 * legge a parte. L'API di expo-file-system restituisce direttamente i
 * byte, quindi non serve passare da base64 e non c'è nessuna
 * conversione in cui sbagliare.
 */
export class NativeFilePicker implements FilePickerPort {
  async pick(): Promise<PickedFile | null> {
    // Il filtro per tipo è inaffidabile fra i vari fornitori di file su
    // mobile: si accetta tutto e si riconosce il formato dai byte.
    const esito = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (esito.canceled) return null;

    const scelto = esito.assets?.[0];
    if (!scelto) return null;

    const file = new File(scelto.uri);
    const bytes = await file.bytes();
    return { name: scelto.name, bytes };
  }
}
