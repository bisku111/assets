import type { FileExportPort, SavedFile } from '../../core/ports/fileExport';

/**
 * Scaricamento nel browser.
 *
 * Si crea un collegamento temporaneo e lo si attiva: è l'unico modo
 * che una pagina ha di consegnare un file senza passare da un server,
 * ed è esattamente quello che serve qui — il backup non deve mai
 * uscire dal dispositivo.
 */
export class WebFileExport implements FileExportPort {
  async save(name: string, text: string, mime = 'application/json'): Promise<SavedFile> {
    if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') {
      return { delivered: false, where: null };
    }

    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const collegamento = document.createElement('a');
    collegamento.href = url;
    collegamento.download = name;
    collegamento.style.display = 'none';
    document.body.appendChild(collegamento);
    collegamento.click();

    // Si libera dopo un attimo: revocare subito annullerebbe lo
    // scaricamento in alcuni browser.
    setTimeout(() => {
      collegamento.remove();
      URL.revokeObjectURL(url);
    }, 2000);

    return { delivered: true, where: name };
  }
}
