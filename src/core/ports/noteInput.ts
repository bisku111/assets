import type { Hand } from '../song/types';

/**
 * Porta di ingresso delle note.
 *
 * Tastiera MIDI, microfono e tastiera a schermo implementano questa stessa
 * interfaccia. Il motore non sa quale sorgente stia usando: e' il motivo
 * per cui aggiungere il MIDI Bluetooth non richiedera' di toccare il
 * matcher, il punteggio o la UI del tutorial.
 */

export type InputSourceId = 'midi' | 'microphone' | 'virtual-keyboard';

export type InputStatus =
  | { state: 'idle' }
  | { state: 'starting' }
  | { state: 'ready'; deviceName?: string }
  /** L'utente ha negato il permesso (microfono, Bluetooth). */
  | { state: 'denied'; reason: string }
  /** Tecnicamente non disponibile qui: manca il modulo nativo, o l'API non esiste. */
  | { state: 'unavailable'; reason: UnavailableReason; detail: string }
  | { state: 'error'; detail: string };

export type UnavailableReason =
  | 'native-module-missing'
  | 'platform-unsupported'
  | 'no-device'
  | 'insecure-context';

export interface PlayedNoteEvent {
  type: 'note-on' | 'note-off';
  midi: number;
  /** 0..1. Per il microfono e' l'ampiezza normalizzata. */
  velocity: number;
  /**
   * Millisecondi presi ALLA SORGENTE, non al momento del render.
   * Confondere i due significa misurare la latenza di React invece di
   * quella dell'esecuzione dell'utente.
   */
  timestamp: number;
  /** 1 per il MIDI (e' un dato esatto), 0..1 per il riconoscimento audio. */
  confidence: number;
  source: InputSourceId;
  /** Presente solo per la tastiera a schermo, che sa quale mano sta usando. */
  hand?: Hand;
}

export type Unsubscribe = () => void;

export interface NoteInputPort {
  readonly id: InputSourceId;
  /** Il microfono con pitch detection monofonico non riconosce gli accordi. */
  readonly polyphonic: boolean;
  getStatus(): InputStatus;
  start(): Promise<InputStatus>;
  stop(): void;
  subscribe(listener: (event: PlayedNoteEvent) => void): Unsubscribe;
}

/** Messaggio leggibile per l'utente. Mai mostrare la causa tecnica cruda. */
export function inputStatusMessageIt(status: InputStatus, source: InputSourceId): string {
  const nome =
    source === 'midi' ? 'La tastiera MIDI' : source === 'microphone' ? 'Il microfono' : 'La tastiera';

  switch (status.state) {
    case 'idle':
      return `${nome} non e' ancora attiva.`;
    case 'starting':
      return `Sto collegando ${nome.toLowerCase()}...`;
    case 'ready':
      return status.deviceName ? `Collegato: ${status.deviceName}` : `${nome} e' pronta.`;
    case 'denied':
      return source === 'microphone'
        ? 'Per ascoltarti serve il permesso di usare il microfono. Puoi darlo dalle impostazioni, oppure suonare sulla tastiera a schermo.'
        : `Permesso negato per ${nome.toLowerCase()}. Puoi suonare sulla tastiera a schermo.`;
    case 'unavailable':
      switch (status.reason) {
        case 'native-module-missing':
          return `${nome} non e' disponibile in questa versione dell'app. Puoi suonare sulla tastiera a schermo.`;
        case 'no-device':
          return 'Non trovo nessuna tastiera collegata. Collegala via USB o Bluetooth e riprova.';
        case 'insecure-context':
          return 'Questa funzione richiede una connessione sicura (https).';
        case 'platform-unsupported':
          return `${nome} non e' supportata su questo dispositivo. Puoi suonare sulla tastiera a schermo.`;
      }
    // eslint-disable-next-line no-fallthrough
    case 'error':
      return `Qualcosa non ha funzionato con ${nome.toLowerCase()}. Puoi continuare con la tastiera a schermo.`;
  }
}
