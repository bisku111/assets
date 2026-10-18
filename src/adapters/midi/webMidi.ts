import { MidiParser } from '../../core/midi/parser';
import { MidiNoteTranslator } from '../../core/midi/translator';
import type { InputStatus, NoteInputPort, PlayedNoteEvent, Unsubscribe } from '../../core/ports/noteInput';

/**
 * Ingresso MIDI reale tramite Web MIDI API.
 *
 * Funziona oggi su web (Chrome/Edge) e in qualunque contesto che esponga
 * `navigator.requestMIDIAccess`. Usa lo stesso parser e lo stesso
 * traduttore del core, quindi running status, velocity 0 e pedale sono
 * gestiti esattamente come li gestira' il modulo nativo.
 *
 * I timestamp della Web MIDI sono in millisecondi sulla stessa base di
 * `performance.now()`: la stessa dell'orologio di trasporto. Sono quindi
 * utilizzabili direttamente, senza conversioni che aggiungerebbero errore.
 */

// Tipi minimi: non si dipende da @types/webmidi per due interfacce.
interface MidiMessageEvent { data: Uint8Array; timeStamp: number }
interface MidiInputDevice {
  id: string;
  name: string | null;
  state: string;
  onmidimessage: ((event: MidiMessageEvent) => void) | null;
}
interface MidiAccessLike {
  inputs: Map<string, MidiInputDevice> | { values(): IterableIterator<MidiInputDevice> };
  onstatechange: ((event: unknown) => void) | null;
}

export type RequestMidiAccess = () => Promise<MidiAccessLike>;

export class WebMidiInput implements NoteInputPort {
  readonly id = 'midi' as const;
  readonly polyphonic = true;

  private readonly parser = new MidiParser();
  private readonly translator = new MidiNoteTranslator();
  private readonly listeners = new Set<(event: PlayedNoteEvent) => void>();
  private status: InputStatus = { state: 'idle' };
  private access: MidiAccessLike | null = null;
  private attached: MidiInputDevice[] = [];

  /** L'accesso e' iniettabile: e' cio' che rende testabile questo adapter. */
  constructor(private readonly requestAccess: RequestMidiAccess | null = defaultRequestAccess()) {}

  getStatus(): InputStatus { return this.status; }

  async start(): Promise<InputStatus> {
    if (!this.requestAccess) {
      this.status = {
        state: 'unavailable',
        reason: 'platform-unsupported',
        detail: 'navigator.requestMIDIAccess non e disponibile in questo ambiente',
      };
      return this.status;
    }

    this.status = { state: 'starting' };
    try {
      this.access = await this.requestAccess();
    } catch (error) {
      // Su web il rifiuto del permesso e un errore tecnico arrivano
      // entrambi come eccezione: si distinguono dal nome.
      const name = (error as { name?: string } | null)?.name;
      this.status =
        name === 'SecurityError' || name === 'NotAllowedError'
          ? { state: 'denied', reason: 'permesso MIDI negato' }
          : { state: 'error', detail: String((error as Error)?.message ?? error) };
      return this.status;
    }

    this.attachDevices();
    this.access.onstatechange = () => this.attachDevices();

    this.status =
      this.attached.length === 0
        ? { state: 'unavailable', reason: 'no-device', detail: 'nessuna tastiera MIDI collegata' }
        : { state: 'ready', deviceName: this.attached[0]?.name ?? 'Tastiera MIDI' };

    return this.status;
  }

  stop(): void {
    for (const device of this.attached) device.onmidimessage = null;
    this.attached = [];
    if (this.access) this.access.onstatechange = null;
    // Spegne le note rimaste accese allo scollegamento.
    for (const event of this.translator.translate({ type: 'all-notes-off', channel: 0, timestamp: 0 })) {
      this.emit(event);
    }
    this.parser.reset();
    this.translator.reset();
    this.status = { state: 'idle' };
  }

  subscribe(listener: (event: PlayedNoteEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  devices(): string[] {
    return this.attached.map((d) => d.name ?? 'Dispositivo MIDI');
  }

  private attachDevices(): void {
    if (!this.access) return;
    const devices = [...iterateInputs(this.access)];

    for (const device of devices) {
      if (this.attached.includes(device)) continue;
      device.onmidimessage = (event) => this.handleMessage(event);
      this.attached.push(device);
    }
    this.attached = this.attached.filter((d) => devices.includes(d));

    if (this.attached.length > 0 && this.status.state !== 'ready') {
      this.status = { state: 'ready', deviceName: this.attached[0]?.name ?? 'Tastiera MIDI' };
    }
  }

  private handleMessage(event: MidiMessageEvent): void {
    for (const midiEvent of this.parser.parse(event.data, event.timeStamp)) {
      for (const played of this.translator.translate(midiEvent)) this.emit(played);
    }
  }

  private emit(event: PlayedNoteEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function iterateInputs(access: MidiAccessLike): Iterable<MidiInputDevice> {
  const inputs = access.inputs as { values(): IterableIterator<MidiInputDevice> };
  return typeof inputs?.values === 'function' ? [...inputs.values()] : [];
}

function defaultRequestAccess(): RequestMidiAccess | null {
  const nav = globalThis.navigator as { requestMIDIAccess?: () => Promise<MidiAccessLike> } | undefined;
  if (!nav || typeof nav.requestMIDIAccess !== 'function') return null;
  return () => nav.requestMIDIAccess!();
}
