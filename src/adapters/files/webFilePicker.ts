import type { FilePickerPort, PickedFile } from '../../core/ports/filePicker';
import { MIDI_EXTENSIONS } from '../../core/ports/filePicker';

/**
 * Selettore di file nel browser.
 *
 * Si crea un <input type="file"> al volo invece di tenerne uno nel
 * DOM: l'elemento nascosto in pagina si porta dietro problemi di
 * accessibilità e di stato fra un uso e l'altro.
 *
 * L'annullamento non emette alcun evento in nessun browser: si
 * risolve con null quando la finestra torna in primo piano senza che
 * sia arrivato un file, altrimenti la promessa resterebbe appesa per
 * sempre e l'interfaccia resterebbe a "sto leggendo".
 */
export class WebFilePicker implements FilePickerPort {
  readonly accepts = MIDI_EXTENSIONS;

  pick(): Promise<PickedFile | null> {
    if (typeof document === 'undefined') return Promise.resolve(null);

    return new Promise<PickedFile | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = [...MIDI_EXTENSIONS, 'audio/midi', 'audio/x-midi'].join(',');
      input.style.display = 'none';

      let risolto = false;
      const finisci = (valore: PickedFile | null) => {
        if (risolto) return;
        risolto = true;
        window.removeEventListener('focus', allAnnullamento);
        input.remove();
        resolve(valore);
      };

      const allAnnullamento = () => {
        // Il ritorno del fuoco arriva prima dell'evento change: si
        // concede un attimo al file di arrivare.
        setTimeout(() => finisci(null), 600);
      };

      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return finisci(null);
        void file.arrayBuffer().then(
          (buffer) => finisci({ name: file.name, bytes: new Uint8Array(buffer) }),
          () => finisci(null),
        );
      });

      document.body.appendChild(input);
      input.click();
      // L'ascolto dell'annullamento parte dopo il clic: in alcuni
      // browser il fuoco rientra nella pagina nello stesso istante in
      // cui si apre la finestra, e si annullerebbe da solo.
      setTimeout(() => {
        if (!risolto) window.addEventListener('focus', allAnnullamento);
      }, 400);
    });
  }
}
