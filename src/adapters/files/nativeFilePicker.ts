import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import type { FilePickerPort, PickedFile } from '../../core/ports/filePicker';
import { MIDI_EXTENSIONS } from '../../core/ports/filePicker';

/**
 * Selettore di file su iOS e Android.
 *
 * Il file arriva come URI, non come byte: va letto a parte. Si legge
 * in base64 perché è l'unica codifica che expo-file-system garantisce
 * per i file binari su entrambe le piattaforme.
 */
export class NativeFilePicker implements FilePickerPort {
  readonly accepts = MIDI_EXTENSIONS;

  async pick(): Promise<PickedFile | null> {
    const esito = await DocumentPicker.getDocumentAsync({
      type: ['audio/midi', 'audio/x-midi', 'application/x-midi', '*/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (esito.canceled) return null;

    const file = esito.assets?.[0];
    if (!file) return null;

    const base64 = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return { name: file.name, bytes: base64ToBytes(base64) };
  }
}

function base64ToBytes(base64: string): Uint8Array {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const pulito = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((pulito.length * 3) / 4));

  let scritti = 0;
  let accumulatore = 0;
  let bit = 0;
  for (const carattere of pulito) {
    accumulatore = (accumulatore << 6) | alfabeto.indexOf(carattere);
    bit += 6;
    if (bit >= 8) {
      bit -= 8;
      bytes[scritti++] = (accumulatore >> bit) & 0xff;
    }
  }
  return bytes.subarray(0, scritti);
}
