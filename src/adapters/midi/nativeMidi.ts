import type { InputStatus, NoteInputPort, PlayedNoteEvent, Unsubscribe } from '../../core/ports/noteInput';

/**
 * Ingresso MIDI su iOS e Android.
 *
 * STATO: il modulo nativo `piano-io` non è ancora compilato, quindi
 * questo adapter DICHIARA di non essere disponibile. Non finge, non
 * restituisce note inventate, non resta in "collegamento..." per sempre.
 * La UI mostra il messaggio e propone la tastiera a schermo.
 *
 * Per attivarlo servono (vedi ARCHITECTURE.md §7.3):
 *   iOS      CoreMIDI, MIDIClientCreateWithBlock (USB e Bluetooth LE)
 *   Android  android.media.midi, MidiManager (USB e BLE)
 * Il modulo deve esporre `listDevices()` e `onMidiMessage(bytes, timestamp)`
 * con i timestamp presi nel callback nativo. A quel punto qui cambia solo
 * il corpo di `start()`: parser, traduttore e resto del motore sono già
 * quelli definitivi e già testati.
 */

interface NativeMidiModule {
  listDevices(): Promise<Array<{ id: string; name: string }>>;
  addListener(
    event: 'midiMessage',
    handler: (payload: { data: number[]; timestamp: number }) => void,
  ): { remove(): void };
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** Sarà popolata dal modulo nativo quando esistera'. */
export function resolveNativeMidiModule(): NativeMidiModule | null {
  return null;
}

export class NativeMidiInput implements NoteInputPort {
  readonly id = 'midi' as const;
  readonly polyphonic = true;

  private readonly listeners = new Set<(event: PlayedNoteEvent) => void>();
  private status: InputStatus = { state: 'idle' };

  getStatus(): InputStatus { return this.status; }

  async start(): Promise<InputStatus> {
    if (!resolveNativeMidiModule()) {
      this.status = {
        state: 'unavailable',
        reason: 'native-module-missing',
        detail:
          "Il modulo nativo MIDI non è incluso in questa build. Serve un development build con il modulo piano-io.",
      };
      return this.status;
    }
    // Il collegamento vero si scrive qui quando il modulo esiste.
    this.status = { state: 'unavailable', reason: 'native-module-missing', detail: 'non implementato' };
    return this.status;
  }

  stop(): void { this.status = { state: 'idle' }; }

  subscribe(listener: (event: PlayedNoteEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
