import { AudioNoteTracker } from '../../core/dsp/noteTracker';
import type { InputStatus, NoteInputPort, PlayedNoteEvent, Unsubscribe } from '../../core/ports/noteInput';

/**
 * Microfono reale tramite Web Audio API.
 *
 * L'audio non lascia MAI il dispositivo: i campioni entrano nel
 * tracciatore, che produce eventi di nota, e vengono scartati. Non c'e'
 * registrazione, non c'e' invio, non c'e' buffer conservato. E' una
 * scelta di privacy, ed e' anche il motivo per cui la funzione puo'
 * essere offerta chiedendo solo il permesso di accesso al microfono.
 */

interface AudioContextLike {
  sampleRate: number;
  currentTime: number;
  createMediaStreamSource(stream: unknown): { connect(node: unknown): void; disconnect(): void };
  createScriptProcessor(bufferSize: number, input: number, output: number): ScriptProcessorLike;
  destination: unknown;
  close(): Promise<void>;
  resume(): Promise<void>;
}

interface ScriptProcessorLike {
  onaudioprocess:
    | ((event: { inputBuffer: { getChannelData(channel: number): Float32Array } }) => void)
    | null;
  connect(node: unknown): void;
  disconnect(): void;
}

export interface WebAudioDependencies {
  getUserMedia: (constraints: { audio: unknown }) => Promise<{ getTracks(): Array<{ stop(): void }> }>;
  createContext: () => AudioContextLike;
  now: () => number;
}

const BLOCK_SIZE = 2048;

export class WebAudioMicrophoneInput implements NoteInputPort {
  readonly id = 'microphone' as const;
  /** YIN e' monofonico: gli accordi al microfono non sono affidabili. */
  readonly polyphonic = false;

  private readonly listeners = new Set<(event: PlayedNoteEvent) => void>();
  private status: InputStatus = { state: 'idle' };
  private tracker: AudioNoteTracker | null = null;
  private context: AudioContextLike | null = null;
  private processor: ScriptProcessorLike | null = null;
  private stream: { getTracks(): Array<{ stop(): void }> } | null = null;

  constructor(
    private readonly deps: WebAudioDependencies | null = defaultDependencies(),
    private readonly midiRange: { min: number; max: number } = { min: 33, max: 96 },
  ) {}

  getStatus(): InputStatus { return this.status; }

  async start(): Promise<InputStatus> {
    if (!this.deps) {
      this.status = {
        state: 'unavailable',
        reason: 'platform-unsupported',
        detail: 'Web Audio non e disponibile in questo ambiente',
      };
      return this.status;
    }

    this.status = { state: 'starting' };
    try {
      this.stream = await this.deps.getUserMedia({
        audio: {
          // Queste elaborazioni migliorano la voce e ROVINANO la musica:
          // la cancellazione dell'eco toglie proprio le code delle note.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch (error) {
      const name = (error as { name?: string } | null)?.name;
      this.status =
        name === 'NotAllowedError' || name === 'PermissionDeniedError'
          ? { state: 'denied', reason: 'permesso microfono negato' }
          : name === 'NotFoundError'
            ? { state: 'unavailable', reason: 'no-device', detail: 'nessun microfono disponibile' }
            : { state: 'error', detail: String((error as Error)?.message ?? error) };
      return this.status;
    }

    const context = this.deps.createContext();
    this.context = context;
    await context.resume();

    this.tracker = new AudioNoteTracker({ sampleRate: context.sampleRate, midiRange: this.midiRange });

    const source = context.createMediaStreamSource(this.stream);
    const processor = context.createScriptProcessor(BLOCK_SIZE, 1, 1);
    processor.onaudioprocess = (event) => {
      const samples = event.inputBuffer.getChannelData(0);
      // Il blocco e' gia' stato catturato quando arriva qui: il suo
      // istante e' "adesso meno la durata del blocco".
      const capturedAt = this.deps!.now() - (BLOCK_SIZE / context.sampleRate) * 1000;
      for (const played of this.tracker!.process(samples, capturedAt)) this.emit(played);
    };

    source.connect(processor);
    processor.connect(context.destination);
    this.processor = processor;

    this.status = { state: 'ready', deviceName: 'Microfono' };
    return this.status;
  }

  stop(): void {
    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.tracker) {
      for (const event of this.tracker.flush(this.deps?.now() ?? 0)) this.emit(event);
      this.tracker = null;
    }
    // Fermare le tracce spegne l'indicatore di microfono attivo: e' cio'
    // che dimostra all'utente che non lo stiamo piu' ascoltando.
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close();
    this.context = null;
    this.status = { state: 'idle' };
  }

  subscribe(listener: (event: PlayedNoteEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: PlayedNoteEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function defaultDependencies(): WebAudioDependencies | null {
  const nav = globalThis.navigator as unknown as
    | { mediaDevices?: { getUserMedia?: (c: unknown) => Promise<unknown> } }
    | undefined;
  const g = globalThis as {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!nav?.mediaDevices?.getUserMedia || !Ctor) return null;

  return {
    getUserMedia: (constraints) =>
      nav.mediaDevices!.getUserMedia!(constraints) as Promise<{
        getTracks(): Array<{ stop(): void }>;
      }>,
    createContext: () => new Ctor(),
    now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  };
}
