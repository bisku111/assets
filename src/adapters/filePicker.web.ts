import type { FilePickerPort } from '../core/ports/filePicker';
import { WebFilePicker } from './files/webFilePicker';

/** Nel browser. Metro sceglie questo file al posto di `filePicker.ts`. */
export function createFilePicker(): FilePickerPort {
  return new WebFilePicker();
}
