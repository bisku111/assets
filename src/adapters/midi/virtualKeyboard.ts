import { systemClock, type ClockPort } from '../../core/ports/clock';
import type { InputStatus, NoteInputPort, PlayedNoteEvent, Unsubscribe } from '../../core/ports/noteInput';
import type { Hand } from '../../core/song/types';

/**
 * La tastiera a schermo come sorgente di ingresso vera e propria.
 *
 * Non è un ripiego cosmetico: implementa la stessa porta di MIDI e
 * microfono, quindi l'intera esperienza (tutorial, feedback, punteggio,
 * progressi) è completa e utilizzabile su qualsiasi telefono, anche
 * senza pianoforte collegato. È cio' che rende l'MVP provabile davvero
 * mentre il modulo nativo audio/MIDI viene compilato.
 */
export class VirtualKeyboardInput implements NoteInputPort {
  readonly id = 'virtual-keyboard' as const;
  readonly polyphonic = true;

  private readonly clock: ClockPort;
  private readonly listeners = new Set<(event: PlayedNoteEvent) => void>();
  private status: InputStatus = { state: 'idle' };
  private readonly down = new Set<number>();

  constructor(clock: ClockPort = systemClock) {
    this.clock = clock;
  }

  getStatus(): InputStatus { return this.status; }

  async start(): Promise<InputStatus> {
    this.status = { state: 'ready', deviceName: 'Tastiera a schermo' };
    return this.status;
  }

  stop(): void {
    // Rilascia i tasti rimasti premuti: se l'utente esce con un dito
    // appoggiato, la nota resterebbe accesa per sempre.
    for (const midi of [...this.down]) this.release(midi);
    this.status = { state: 'idle' };
  }

  subscribe(listener: (event: PlayedNoteEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Chiamata dal componente tastiera al tocco. */
  press(midi: number, hand?: Hand, velocity = 0.8): void {
    if (this.down.has(midi)) return; // il tocco continuo non ribatte la nota
    this.down.add(midi);
    this.emit({
      type: 'note-on', midi, velocity,
      timestamp: this.clock.now(), confidence: 1, source: 'virtual-keyboard',
      ...(hand ? { hand } : {}),
    });
  }

  release(midi: number): void {
    if (!this.down.delete(midi)) return;
    this.emit({
      type: 'note-off', midi, velocity: 0,
      timestamp: this.clock.now(), confidence: 1, source: 'virtual-keyboard',
    });
  }

  pressedNotes(): number[] {
    return [...this.down].sort((a, b) => a - b);
  }

  private emit(event: PlayedNoteEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
