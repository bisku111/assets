/**
 * Interprete dei messaggi MIDI.
 *
 * Sembra banale ("tre byte per nota") e non lo è. Le tastiere vere usano
 * tre convenzioni che, ignorate, producono note fantasma o note che
 * restano premute per sempre:
 *
 *  - RUNNING STATUS: dopo il primo messaggio, il byte di stato viene
 *    omesso finché non cambia. Uno stream di scale arriva come una
 *    sequenza di sole coppie nota/velocity.
 *  - NOTE ON CON VELOCITY 0: quasi tutte le tastiere rilasciano così,
 *    invece di mandare un vero Note Off. Chi non lo gestisce si ritrova
 *    tutti i tasti "premuti".
 *  - MESSAGGI REAL-TIME (0xF8..0xFF, clock e simili): possono comparire
 *    IN MEZZO a un altro messaggio e non devono né essere interpretati
 *    né azzerare il running status.
 */

export type MidiEvent =
  | { type: 'note-on'; channel: number; midi: number; velocity: number; timestamp: number }
  | { type: 'note-off'; channel: number; midi: number; timestamp: number }
  | { type: 'sustain'; channel: number; down: boolean; timestamp: number }
  | { type: 'control-change'; channel: number; controller: number; value: number; timestamp: number }
  | { type: 'pitch-bend'; channel: number; value: number; timestamp: number }
  | { type: 'all-notes-off'; channel: number; timestamp: number };

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const POLY_AFTERTOUCH = 0xa0;
const CONTROL_CHANGE = 0xb0;
const PROGRAM_CHANGE = 0xc0;
const CHANNEL_AFTERTOUCH = 0xd0;
const PITCH_BEND = 0xe0;

const CC_SUSTAIN = 64;
const CC_ALL_NOTES_OFF = 123;

/** Byte di dati richiesti da ciascun tipo di messaggio. */
function dataLength(status: number): number {
  switch (status & 0xf0) {
    case PROGRAM_CHANGE:
    case CHANNEL_AFTERTOUCH:
      return 1;
    default:
      return 2;
  }
}

export class MidiParser {
  private runningStatus: number | null = null;
  private pending: number[] = [];
  private inSysex = false;

  /** Interpreta un blocco di byte. Un messaggio può essere spezzato fra due chiamate. */
  parse(bytes: ArrayLike<number>, timestamp: number): MidiEvent[] {
    const events: MidiEvent[] = [];

    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i] as number;

      // --- Real-time: passano attraverso senza toccare nulla ----------
      if (byte >= 0xf8) continue;

      if (this.inSysex) {
        if (byte === 0xf7) this.inSysex = false;
        continue;
      }

      if (byte === 0xf0) {
        this.inSysex = true;
        this.runningStatus = null;
        this.pending = [];
        continue;
      }

      if (byte >= 0x80) {
        if (byte >= 0xf1 && byte <= 0xf7) {
          // System common: azzera il running status, non produce eventi.
          this.runningStatus = null;
          this.pending = [];
          continue;
        }
        this.runningStatus = byte;
        this.pending = [];
        continue;
      }

      // Byte di dati.
      if (this.runningStatus === null) continue; // dato orfano: si scarta

      this.pending.push(byte);
      if (this.pending.length === dataLength(this.runningStatus)) {
        const event = this.toEvent(this.runningStatus, this.pending, timestamp);
        if (event) events.push(event);
        this.pending = [];
      }
    }

    return events;
  }

  /** Da chiamare quando la periferica si scollega. */
  reset(): void {
    this.runningStatus = null;
    this.pending = [];
    this.inSysex = false;
  }

  private toEvent(status: number, data: number[], timestamp: number): MidiEvent | null {
    const type = status & 0xf0;
    const channel = status & 0x0f;
    const d0 = data[0] ?? 0;
    const d1 = data[1] ?? 0;

    switch (type) {
      case NOTE_ON:
        // Velocity 0 = rilascio: è il modo in cui la maggior parte delle
        // tastiere manda il Note Off.
        return d1 === 0
          ? { type: 'note-off', channel, midi: d0, timestamp }
          : { type: 'note-on', channel, midi: d0, velocity: d1 / 127, timestamp };

      case NOTE_OFF:
        return { type: 'note-off', channel, midi: d0, timestamp };

      case CONTROL_CHANGE:
        if (d0 === CC_SUSTAIN) {
          // Convenzione MIDI: sotto 64 il pedale è alzato.
          return { type: 'sustain', channel, down: d1 >= 64, timestamp };
        }
        if (d0 === CC_ALL_NOTES_OFF) return { type: 'all-notes-off', channel, timestamp };
        return { type: 'control-change', channel, controller: d0, value: d1, timestamp };

      case PITCH_BEND:
        return { type: 'pitch-bend', channel, value: ((d1 << 7) | d0) - 8192, timestamp };

      case POLY_AFTERTOUCH:
      case PROGRAM_CHANGE:
      case CHANNEL_AFTERTOUCH:
        return null; // non servono al tutorial

      default:
        return null;
    }
  }
}
