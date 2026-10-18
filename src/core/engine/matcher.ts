import type { SongNote } from '../song/types';

/**
 * Confronto fra quello che l'utente suona e quello che il brano chiede.
 *
 * Decisioni di fondo, prese una volta e valide per tutto il motore:
 *
 * 1. Si giudica l'ATTACCO della nota, non il rilascio. È il motivo per
 *    cui il pedale di risonanza non falsa il punteggio: il sustain
 *    ritarda i note-off, non i note-on. Un sistema che misurasse anche la
 *    durata darebbe errori continui a chiunque usi il pedale.
 *
 * 2. Una nota attesa si consuma una volta sola. Senza questo, tenendo
 *    premuto e ripremendo lo stesso tasto si accumulerebbero "note
 *    corrette" gratis.
 *
 * 3. Se nella finestra non c'è la nota giusta ma ce n'è un'altra
 *    attesa, l'errore è "nota sbagliata" e si dice QUALE era attesa
 *    (Prevista: MI / Suonata: RE). Se non c'è nulla di atteso, è una
 *    nota di troppo: pesa meno, perché spesso è una ditata.
 */

export type MatchOutcome =
  | { kind: 'correct'; noteIndex: number; note: SongNote; deviationMs: number }
  | { kind: 'wrong'; noteIndex: number; expected: SongNote; playedMidi: number; deviationMs: number }
  | { kind: 'extra'; playedMidi: number; positionMs: number };

export interface ExpectedNoteState {
  index: number;
  note: SongNote;
  status: 'pending' | 'hit' | 'missed';
  /** Scarto in ms rispetto al tempo previsto: negativo = in anticipo. */
  deviationMs: number | null;
}

export interface MatcherOptions {
  /** Finestra entro cui una nota può essere considerata "a tempo". */
  toleranceMs: number;
  /**
   * Latenza dell'ingresso, misurata in calibrazione. Viene SOTTRATTA dal
   * momento in cui l'evento arriva: senza, un utente preciso con 80 ms di
   * latenza Bluetooth risulterebbe sistematicamente in ritardo.
   */
  inputLatencyMs?: number;
}

export interface MatcherSnapshot {
  expected: number;
  correct: number;
  wrong: number;
  missed: number;
  extra: number;
  deviations: number[];
}

export class NoteMatcher {
  private readonly states: ExpectedNoteState[];
  private readonly toleranceMs: number;
  private readonly inputLatencyMs: number;

  private correct = 0;
  private wrong = 0;
  private missed = 0;
  private extra = 0;
  private readonly deviations: number[] = [];

  /** Prima nota ancora da valutare: evita di riscorrere il brano da capo. */
  private cursor = 0;

  constructor(notes: SongNote[], options: MatcherOptions) {
    this.states = notes.map((note, index) => ({ index, note, status: 'pending', deviationMs: null }));
    this.toleranceMs = options.toleranceMs;
    this.inputLatencyMs = options.inputLatencyMs ?? 0;
  }

  get notes(): readonly ExpectedNoteState[] { return this.states; }
  get toleranceWindowMs(): number { return this.toleranceMs; }

  /**
   * Registra un attacco.
   * @param playedMidi nota suonata
   * @param positionMs posizione nel brano nell'istante dell'attacco
   */
  noteOn(playedMidi: number, positionMs: number): MatchOutcome {
    const position = positionMs - this.inputLatencyMs;

    let bestSame: ExpectedNoteState | null = null;
    let bestSameDistance = Number.POSITIVE_INFINITY;
    let bestAny: ExpectedNoteState | null = null;
    let bestAnyDistance = Number.POSITIVE_INFINITY;

    for (let i = this.cursor; i < this.states.length; i++) {
      const state = this.states[i] as ExpectedNoteState;
      const distance = state.note.startMs - position;

      // Le note sono ordinate: oltre la finestra futura non serve cercare.
      if (distance > this.toleranceMs) break;
      if (state.status !== 'pending') continue;
      if (distance < -this.toleranceMs) continue;

      const absolute = Math.abs(distance);
      if (state.note.midi === playedMidi && absolute < bestSameDistance) {
        bestSame = state;
        bestSameDistance = absolute;
      }
      if (absolute < bestAnyDistance) {
        bestAny = state;
        bestAnyDistance = absolute;
      }
    }

    if (bestSame) {
      const deviation = position - bestSame.note.startMs;
      bestSame.status = 'hit';
      bestSame.deviationMs = deviation;
      this.correct += 1;
      this.deviations.push(deviation);
      this.advanceCursor();
      return { kind: 'correct', noteIndex: bestSame.index, note: bestSame.note, deviationMs: deviation };
    }

    if (bestAny) {
      // Nota sbagliata: la nota attesa NON viene consumata, così l'utente
      // può ancora correggersi dentro la finestra.
      this.wrong += 1;
      return {
        kind: 'wrong',
        noteIndex: bestAny.index,
        expected: bestAny.note,
        playedMidi,
        deviationMs: position - bestAny.note.startMs,
      };
    }

    this.extra += 1;
    return { kind: 'extra', playedMidi, positionMs: position };
  }

  /**
   * Segna come mancate le note il cui momento è passato.
   * Va chiamata ad ogni frame: è così che una nota non suonata diventa
   * un errore invece di restare in sospeso per sempre.
   */
  update(positionMs: number): ExpectedNoteState[] {
    const deadline = positionMs - this.inputLatencyMs - this.toleranceMs;
    const nowMissed: ExpectedNoteState[] = [];

    for (let i = this.cursor; i < this.states.length; i++) {
      const state = this.states[i] as ExpectedNoteState;
      if (state.note.startMs > deadline) break;
      if (state.status === 'pending') {
        state.status = 'missed';
        this.missed += 1;
        nowMissed.push(state);
      }
    }
    this.advanceCursor();
    return nowMissed;
  }

  /** Note ancora attese in un dato istante, per l'aiuto visivo. */
  pendingAt(positionMs: number, windowMs: number): ExpectedNoteState[] {
    return this.states.filter(
      (s) =>
        s.status === 'pending' &&
        s.note.startMs >= positionMs - this.toleranceMs &&
        s.note.startMs <= positionMs + windowMs,
    );
  }

  snapshot(): MatcherSnapshot {
    return {
      expected: this.states.length,
      correct: this.correct,
      wrong: this.wrong,
      missed: this.missed,
      extra: this.extra,
      deviations: [...this.deviations],
    };
  }

  reset(): void {
    for (const state of this.states) {
      state.status = 'pending';
      state.deviationMs = null;
    }
    this.correct = 0;
    this.wrong = 0;
    this.missed = 0;
    this.extra = 0;
    this.deviations.length = 0;
    this.cursor = 0;
  }

  private advanceCursor(): void {
    while (this.cursor < this.states.length && this.states[this.cursor]!.status !== 'pending') {
      this.cursor += 1;
    }
  }
}

/** Tolleranze per modalità: imparando si perdona, esibendosi no. */
export const TOLERANCE_BY_MODE = {
  learn: 400,
  practice: 220,
  play: 150,
  performance: 90,
} as const;

export type PracticeMode = keyof typeof TOLERANCE_BY_MODE;

export const MODE_LABEL_IT: Record<PracticeMode, string> = {
  learn: 'Impara',
  practice: 'Esercitati',
  play: 'Suona',
  performance: 'Performance',
};

export const MODE_DESCRIPTION_IT: Record<PracticeMode, string> = {
  learn: 'Il brano ti aspetta: niente va avanti finché non suoni la nota giusta.',
  practice: 'Velocità costante con feedback continuo su ogni nota.',
  play: 'Si suona davvero, con il giudizio a fine esecuzione.',
  performance: 'Come su un palco: nessun aiuto a schermo, giudizio severo.',
};
