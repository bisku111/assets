import type { FilePickerPort } from '../core/ports/filePicker';
import { NativeFilePicker } from './files/nativeFilePicker';

/** Su iOS e Android. La versione web è in `filePicker.web.ts`. */
export function createFilePicker(): FilePickerPort {
  return new NativeFilePicker();
}
