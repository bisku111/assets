import type { PlayedNoteEvent } from '../ports/noteInput';
import type { MidiEvent } from './parser';

/**
 * Da eventi MIDI a eventi di dominio.
 *
 * Fa una cosa sola ma importante: tiene conto del PEDALE. Con il pedale
 * premuto, il rilascio del tasto non spegne la nota; il note-off va
 * rimandato al momento in cui il pedale si alza. Senza questo, la
 * tastiera a schermo mostrerebbe le note spegnersi mentre il pianoforte
 * suona ancora, e l'allievo penserebbe di aver sbagliato.
 *
 * Il punteggio non ne risente comunque, perche' si valutano gli attacchi
 * (vedi matcher.ts): questo serve alla rappresentazione a schermo.
 */
export class MidiNoteTranslator {
  private sustainDown = false;
  private readonly heldByPedal = new Set<number>();
  private readonly physicallyDown = new Set<number>();

  translate(event: MidiEvent): PlayedNoteEvent[] {
    switch (event.type) {
      case 'note-on': {
        this.physicallyDown.add(event.midi);
        this.heldByPedal.delete(event.midi);
        return [{
          type: 'note-on',
          midi: event.midi,
          velocity: event.velocity,
          timestamp: event.timestamp,
          confidence: 1, // il MIDI e' un dato esatto, non una stima
          source: 'midi',
        }];
      }

      case 'note-off': {
        this.physicallyDown.delete(event.midi);
        if (this.sustainDown) {
          this.heldByPedal.add(event.midi);
          return [];
        }
        return [this.offEvent(event.midi, event.timestamp)];
      }

      case 'sustain': {
        this.sustainDown = event.down;
        if (event.down) return [];
        // Pedale alzato: si spengono tutte le note che stava tenendo.
        const released = [...this.heldByPedal].map((midi) => this.offEvent(midi, event.timestamp));
        this.heldByPedal.clear();
        return released;
      }

      case 'all-notes-off': {
        const all = new Set([...this.physicallyDown, ...this.heldByPedal]);
        this.physicallyDown.clear();
        this.heldByPedal.clear();
        return [...all].map((midi) => this.offEvent(midi, event.timestamp));
      }

      default:
        return [];
    }
  }

  /** Note attualmente in suono, pedale compreso. Serve alla tastiera a schermo. */
  soundingNotes(): number[] {
    return [...new Set([...this.physicallyDown, ...this.heldByPedal])].sort((a, b) => a - b);
  }

  get isSustainDown(): boolean { return this.sustainDown; }

  reset(): void {
    this.sustainDown = false;
    this.heldByPedal.clear();
    this.physicallyDown.clear();
  }

  private offEvent(midi: number, timestamp: number): PlayedNoteEvent {
    return { type: 'note-off', midi, velocity: 0, timestamp, confidence: 1, source: 'midi' };
  }
}
