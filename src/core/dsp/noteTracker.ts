import { frequencyToPitch } from '../music/note';
import type { PlayedNoteEvent } from '../ports/noteInput';
import { detectPitch, type YinOptions } from './yin';

/**
 * Da flusso audio a note.
 *
 * Il rilevatore di altezza da' una lettura per blocco (circa ogni 10-45
 * ms). Trasformarle in note è un problema a se': una singola lettura
 * non è una nota. Senza i filtri qui sotto, il microfono produrrebbe
 * decine di note fantasma al secondo e il punteggio sarebbe una lotteria.
 *
 * Quattro difese, ognuna contro un problema osservabile:
 *
 *  1. CONFERMA: servono N letture consecutive della stessa nota prima di
 *     dichiararla. Elimina i singoli blocchi sbagliati sull'attacco,
 *     dove il suono è ancora rumore percussivo.
 *  2. CHIAREZZA MINIMA: si scartano le letture poco periodiche (voci,
 *     traffico, ventola).
 *  3. INTONAZIONE: una lettura a più di ~35 cent dalla nota temperata
 *     è probabilmente rumore, non un tasto.
 *  4. ESTENSIONE: si accettano solo le note che il brano può contenere.
 *     È anche la difesa contro le sottoarmoniche (vedi yin.test.ts).
 *
 * E il RIATTACCO della stessa nota: se l'altezza non cambia, l'unica
 * traccia di un nuovo colpo è un balzo di energia. Viene rilevato, ma
 * la cosa è dichiarata come approssimata: due DO ribattuti velocemente
 * al microfono possono essere letti come uno solo. Chi vuole precisione
 * su questo usa il MIDI, e l'app glielo dice.
 */

export interface NoteTrackerOptions extends YinOptions {
  /** Letture consecutive necessarie per confermare una nota. */
  confirmations?: number;
  /** Chiarezza minima della lettura (0..1). */
  minClarity?: number;
  /** Scarto massimo dall'intonazione temperata, in cent. */
  maxCentsOff?: number;
  /** Estensione ammessa, di norma quella del brano allargata di un'ottava. */
  midiRange?: { min: number; max: number };
  /** Quante letture di silenzio prima di spegnere la nota. */
  releaseFrames?: number;
  /** Salto di ampiezza che segnala un nuovo colpo sulla stessa nota. */
  reattackRatio?: number;
  /** Durata minima di una nota, in ms: sotto è un artefatto. */
  minNoteMs?: number;
}

interface Candidate {
  midi: number;
  frames: number;
  firstTimestamp: number;
}

export class AudioNoteTracker {
  private readonly options: NoteTrackerOptions;

  private candidate: Candidate | null = null;
  private activeMidi: number | null = null;
  private activeSince = 0;
  private activeRms = 0;
  private silentFrames = 0;

  constructor(options: NoteTrackerOptions) {
    this.options = {
      confirmations: 2,
      minClarity: 0.75,
      maxCentsOff: 35,
      releaseFrames: 3,
      reattackRatio: 1.8,
      minNoteMs: 55,
      ...options,
    };
  }

  /**
   * Analizza un blocco di campioni.
   * @param timestamp istante in cui il blocco è stato CATTURATO.
   */
  process(samples: Float32Array | number[], timestamp: number): PlayedNoteEvent[] {
    const reading = detectPitch(samples, this.options);
    if (!reading || reading.clarity < (this.options.minClarity ?? 0.75)) {
      return this.handleSilence(timestamp);
    }

    const pitch = frequencyToPitch(reading.frequencyHz);
    if (!pitch || Math.abs(pitch.cents) > (this.options.maxCentsOff ?? 35)) {
      return this.handleSilence(timestamp);
    }

    const range = this.options.midiRange;
    if (range && (pitch.midi < range.min || pitch.midi > range.max)) {
      return this.handleSilence(timestamp);
    }

    this.silentFrames = 0;
    const events: PlayedNoteEvent[] = [];

    if (this.activeMidi === pitch.midi) {
      // Stessa nota: l'unico indizio di un nuovo colpo è l'energia.
      if (
        reading.rms > this.activeRms * (this.options.reattackRatio ?? 1.8) &&
        timestamp - this.activeSince > (this.options.minNoteMs ?? 55)
      ) {
        events.push(this.noteOff(pitch.midi, timestamp));
        events.push(this.noteOn(pitch.midi, reading.rms, reading.clarity, timestamp));
        this.activeSince = timestamp;
      }
      this.activeRms = Math.max(this.activeRms * 0.9, reading.rms);
      return events;
    }

    // Nota diversa: va confermata prima di essere dichiarata.
    if (this.candidate && this.candidate.midi === pitch.midi) {
      this.candidate.frames += 1;
    } else {
      this.candidate = { midi: pitch.midi, frames: 1, firstTimestamp: timestamp };
    }

    if (this.candidate.frames >= (this.options.confirmations ?? 2)) {
      if (this.activeMidi !== null) events.push(this.noteOff(this.activeMidi, timestamp));
      // Si data la nota al PRIMO blocco in cui è comparsa, non a quello
      // della conferma: altrimenti ogni nota risulterebbe in ritardo di
      // un paio di blocchi, cioe' di decine di millisecondi.
      events.push(this.noteOn(pitch.midi, reading.rms, reading.clarity, this.candidate.firstTimestamp));
      this.activeMidi = pitch.midi;
      this.activeSince = this.candidate.firstTimestamp;
      this.activeRms = reading.rms;
      this.candidate = null;
    }

    return events;
  }

  /** Chiude la nota eventualmente aperta: da chiamare a fine sessione. */
  flush(timestamp: number): PlayedNoteEvent[] {
    const events = this.activeMidi !== null ? [this.noteOff(this.activeMidi, timestamp)] : [];
    this.reset();
    return events;
  }

  reset(): void {
    this.candidate = null;
    this.activeMidi = null;
    this.activeSince = 0;
    this.activeRms = 0;
    this.silentFrames = 0;
  }

  get currentNote(): number | null { return this.activeMidi; }

  private handleSilence(timestamp: number): PlayedNoteEvent[] {
    this.candidate = null;
    if (this.activeMidi === null) return [];

    this.silentFrames += 1;
    // Non si spegne al primo blocco vuoto: un singolo blocco incerto in
    // mezzo a una nota tenuta è normale.
    if (this.silentFrames < (this.options.releaseFrames ?? 3)) return [];

    const event = this.noteOff(this.activeMidi, timestamp);
    this.activeMidi = null;
    this.activeRms = 0;
    this.silentFrames = 0;
    return [event];
  }

  private noteOn(midi: number, rms: number, clarity: number, timestamp: number): PlayedNoteEvent {
    return {
      type: 'note-on',
      midi,
      velocity: Math.min(1, rms * 3),
      timestamp,
      // Il microfono è una STIMA: la confidenza viaggia con l'evento e
      // arriva fino alla UI, che può essere più prudente nel correggere.
      confidence: clarity,
      source: 'microphone',
    };
  }

  private noteOff(midi: number, timestamp: number): PlayedNoteEvent {
    return { type: 'note-off', midi, velocity: 0, timestamp, confidence: 1, source: 'microphone' };
  }
}
