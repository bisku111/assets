import type { HandStats } from '../learning/progression';
import type { ClockPort } from '../ports/clock';
import type { PlayedNoteEvent } from '../ports/noteInput';
import { computeScore, type ScoreBreakdown } from '../scoring/score';
import { filterNotes, sectionById } from '../song/query';
import type { Hand, SongArrangement, SongNote, SongSection } from '../song/types';
import {
  NoteMatcher, TOLERANCE_BY_MODE,
  type ExpectedNoteState, type MatchOutcome, type PracticeMode,
} from './matcher';
import { Transport } from './transport';

/**
 * Una sessione di studio: trasporto + confronto + punteggio, in un solo
 * oggetto che la UI pilota.
 *
 * È "a lettura": non ha timer propri. Chi disegna chiama `tick()` una
 * volta per frame e riceve tutto quello che serve a disegnare. Così il
 * motore non conosce React, e i test possono far scorrere il tempo a
 * mano invece di aspettarlo davvero.
 */

export interface PracticeSessionOptions {
  arrangement: SongArrangement;
  clock: ClockPort;
  mode: PracticeMode;
  /** 25..100. */
  ratePct: number;
  /** null = tutto il brano. */
  sectionId?: string | null;
  hands?: Hand[];
  /** Ripete la sezione all'infinito. */
  loopSection?: boolean;
  inputLatencyMs?: number;
  countInMs?: number;
  /**
   * Modalità IMPARA: il brano si ferma ad aspettare la nota giusta
   * invece di andare avanti lasciando indietro l'allievo.
   */
  waitForInput?: boolean;
}

export interface SessionFrame {
  positionMs: number;
  progress: number;
  state: 'idle' | 'playing' | 'paused' | 'ended';
  /** Nota che il brano sta aspettando (solo in modalità IMPARA). */
  waitingFor: SongNote | null;
  currentSection: SongSection | null;
  /** Ultimo esito, per il feedback immediato a schermo. */
  lastOutcome: MatchOutcome | null;
  notesJustMissed: ExpectedNoteState[];
  live: LiveStats;
}

export interface LiveStats {
  expected: number;
  correct: number;
  wrong: number;
  missed: number;
  extra: number;
  /** Note giuste di fila: alimenta la barra "serie". */
  streak: number;
}

export interface SessionResult {
  breakdown: ScoreBreakdown;
  handStats: Partial<Record<Hand, HandStats>>;
  durationMs: number;
  mode: PracticeMode;
  ratePct: number;
  sectionId: string | null;
  hands: Hand[];
}

export class PracticeSession {
  readonly transport: Transport;
  readonly matcher: NoteMatcher;
  readonly notes: SongNote[];
  readonly hands: Hand[];
  readonly mode: PracticeMode;
  readonly section: SongSection | null;
  readonly toleranceMs: number;

  private readonly clock: ClockPort;
  private readonly arrangement: SongArrangement;
  private readonly ratePct: number;
  private readonly waitForInput: boolean;

  private waitingForState: ExpectedNoteState | null = null;
  private lastOutcomeState: MatchOutcome | null = null;
  private streak = 0;
  private startedAtMs: number;
  private elapsedMs = 0;

  constructor(options: PracticeSessionOptions) {
    const {
      arrangement, clock, mode, ratePct,
      sectionId = null,
      hands = arrangement.hands,
      loopSection = false,
      inputLatencyMs = 0,
      countInMs = 0,
      waitForInput = mode === 'learn',
    } = options;

    this.arrangement = arrangement;
    this.clock = clock;
    this.mode = mode;
    this.hands = hands;
    this.ratePct = ratePct;
    this.waitForInput = waitForInput;
    this.section = sectionId ? sectionById(arrangement, sectionId) : null;
    this.toleranceMs = TOLERANCE_BY_MODE[mode];

    this.notes = filterNotes(arrangement, { hands, sectionId });
    this.matcher = new NoteMatcher(this.notes, { toleranceMs: this.toleranceMs, inputLatencyMs });

    const start = this.section?.startMs ?? 0;
    const end = this.section?.endMs ?? arrangement.durationMs;

    this.transport = new Transport({
      durationMs: end,
      clock,
      rate: ratePct / 100,
      countInMs,
      loop: loopSection && this.section ? { startMs: start, endMs: end } : null,
    });
    this.transport.seek(start === 0 ? -countInMs : start);
    this.startedAtMs = clock.now();
  }

  start(): void {
    this.startedAtMs = this.clock.now();
    this.transport.play();
  }

  pause(): void {
    this.transport.pause();
  }

  resume(): void {
    if (this.waitingForState) return; // si riprende suonando la nota giusta
    this.transport.play();
  }

  /** Ricomincia la stessa sezione da capo azzerando il punteggio. */
  restart(): void {
    this.matcher.reset();
    this.streak = 0;
    this.lastOutcomeState = null;
    this.waitingForState = null;
    this.elapsedMs = 0;
    this.transport.seek(this.section?.startMs ?? 0);
    this.startedAtMs = this.clock.now();
    this.transport.play();
  }

  /** Registra un evento della sorgente di ingresso. */
  handleInput(event: PlayedNoteEvent): MatchOutcome | null {
    if (event.type !== 'note-on') return null;

    // In attesa (modalità IMPARA) il brano è fermo: si valuta la nota
    // al tempo in cui era attesa, non "adesso", altrimenti chi aspetta
    // due secondi risulterebbe in ritardo di due secondi.
    const position = this.waitingForState
      ? this.waitingForState.note.startMs
      : this.transport.positionAt(event.timestamp);

    const outcome = this.matcher.noteOn(event.midi, position);
    this.lastOutcomeState = outcome;

    if (outcome.kind === 'correct') {
      this.streak += 1;
      if (this.waitingForState && this.waitingForState.index === outcome.noteIndex) {
        this.waitingForState = null;
        this.transport.play();
      }
    } else {
      this.streak = 0;
    }

    return outcome;
  }

  /** Da chiamare una volta per frame. */
  tick(): SessionFrame {
    const position = this.transport.positionMs;
    let notesJustMissed: ExpectedNoteState[] = [];

    if (this.waitForInput) {
      // Nella modalità guidata non si "perdono" note: si aspetta.
      //
      // Il controllo NON dipende dal fatto che il trasporto stia
      // suonando. Se l'app resta in secondo piano, al ritorno la
      // posizione è balzata avanti di secondi e il trasporto può
      // essere già "finito": anche in quel caso bisogna tornare
      // indietro alla nota attesa, non saltarla.
      const pending = this.nextPendingNote();
      if (pending && !this.waitingForState && position >= pending.note.startMs) {
        this.transport.seek(pending.note.startMs);
        this.transport.pause();
        this.waitingForState = pending;
      }
    } else {
      notesJustMissed = this.matcher.update(position);
      if (notesJustMissed.length > 0) this.streak = 0;
    }

    if (this.transport.isPlaying) this.elapsedMs = this.clock.now() - this.startedAtMs;

    const snapshot = this.matcher.snapshot();

    return {
      positionMs: position,
      progress: this.transport.progress,
      state: this.transport.state,
      waitingFor: this.waitingForState?.note ?? null,
      currentSection: this.section ?? this.sectionAtPosition(position),
      lastOutcome: this.lastOutcomeState,
      notesJustMissed,
      live: {
        expected: snapshot.expected,
        correct: snapshot.correct,
        wrong: snapshot.wrong,
        missed: snapshot.missed,
        extra: snapshot.extra,
        streak: this.streak,
      },
    };
  }

  /**
   * Chiude la sessione e calcola il risultato.
   * Le note non ancora giudicate diventano mancate: interrompere a metà
   * non deve produrre un 100% ottenuto suonando tre note.
   */
  finish(): SessionResult {
    this.matcher.update(Number.POSITIVE_INFINITY);
    this.transport.pause();

    return {
      breakdown: computeScore(this.matcher.snapshot(), { toleranceMs: this.toleranceMs }),
      handStats: this.handStats(),
      durationMs: Math.round(this.elapsedMs),
      mode: this.mode,
      ratePct: this.ratePct,
      sectionId: this.section?.id ?? null,
      hands: this.hands,
    };
  }

  /** Precisione divisa per mano: è cio' che permette al maestro di isolarne una. */
  handStats(): Partial<Record<Hand, HandStats>> {
    const stats: Partial<Record<Hand, HandStats>> = {};
    for (const state of this.matcher.notes) {
      const hand = state.note.hand;
      const entry = stats[hand] ?? { expected: 0, correct: 0 };
      entry.expected += 1;
      if (state.status === 'hit') entry.correct += 1;
      stats[hand] = entry;
    }
    return stats;
  }

  /** Note da disegnare: quelle in arrivo nella finestra visibile. */
  visibleNotes(lookAheadMs: number): ExpectedNoteState[] {
    const position = this.transport.positionMs;
    return this.matcher.notes.filter(
      (s) =>
        s.note.startMs + s.note.durationMs >= position - 400 &&
        s.note.startMs <= position + lookAheadMs,
    );
  }

  private nextPendingNote(): ExpectedNoteState | null {
    return this.matcher.notes.find((s) => s.status === 'pending') ?? null;
  }

  private sectionAtPosition(positionMs: number): SongSection | null {
    return this.arrangement.sections.find((s) => positionMs >= s.startMs && positionMs < s.endMs) ?? null;
  }
}
