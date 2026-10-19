import type { FileExportPort } from '../core/ports/fileExport';
import { WebFileExport } from './files/webFileExport';

/** Nel browser. Metro sceglie questo file al posto di `fileExport.ts`. */
export function createFileExport(): FileExportPort {
  return new WebFileExport();
}
