import type { InputStatus, NoteInputPort, PlayedNoteEvent, Unsubscribe } from '../../core/ports/noteInput';

/**
 * Microfono su iOS e Android.
 *
 * STATO: come per il MIDI nativo, il modulo `piano-io` non e' ancora
 * compilato. Ne' expo-audio ne' React Native espongono un flusso PCM a
 * bassa latenza: registrano su file, il che non serve a un coach che
 * deve rispondere entro poche decine di millisecondi.
 *
 * Quando il modulo esistera' (AVAudioEngine su iOS, AudioRecord su
 * Android), qui cambia solo l'aggancio: il tracciatore, YIN e il resto
 * del motore sono gia' quelli definitivi, gia' testati su segnali
 * sintetici.
 */

interface NativeAudioModule {
  startPcm(sampleRate: number): Promise<void>;
  stopPcm(): Promise<void>;
  addListener(
    event: 'pcmFrame',
    handler: (payload: { samples: number[]; timestamp: number }) => void,
  ): { remove(): void };
}

export function resolveNativeAudioModule(): NativeAudioModule | null {
  return null;
}

export class NativeMicrophoneInput implements NoteInputPort {
  readonly id = 'microphone' as const;
  readonly polyphonic = false;

  private readonly listeners = new Set<(event: PlayedNoteEvent) => void>();
  private status: InputStatus = { state: 'idle' };

  getStatus(): InputStatus { return this.status; }

  async start(): Promise<InputStatus> {
    if (!resolveNativeAudioModule()) {
      this.status = {
        state: 'unavailable',
        reason: 'native-module-missing',
        detail:
          "L'ascolto dal microfono non e' incluso in questa build. Serve un development build con il modulo piano-io.",
      };
      return this.status;
    }
    this.status = { state: 'unavailable', reason: 'native-module-missing', detail: 'non implementato' };
    return this.status;
  }

  stop(): void { this.status = { state: 'idle' }; }

  subscribe(listener: (event: PlayedNoteEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
