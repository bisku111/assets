import type { FileExportPort } from '../core/ports/fileExport';
import { NativeFileExport } from './files/nativeFileExport';

/** Su iOS e Android. La versione web è in `fileExport.web.ts`. */
export function createFileExport(): FileExportPort {
  return new NativeFileExport();
}
