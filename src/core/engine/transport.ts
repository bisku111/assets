import type { ClockPort } from '../ports/clock';

/**
 * Orologio di trasporto del brano.
 *
 * Regola non negoziabile: la posizione NON viene mai accumulata
 * (`pos += dt`). Ogni accumulo, con i timer di JavaScript, produce una
 * deriva di decine di millisecondi al minuto: dopo un ritornello le note
 * a schermo non corrispondono piu' a quelle attese e il giudizio sul
 * ritmo diventa privo di senso.
 *
 * Qui la posizione e' sempre ricalcolata da un ancoraggio:
 *
 *     posizione = ancoraggio + (adesso - istanteAncoraggio) * velocita'
 *
 * L'ancoraggio si sposta solo quando cambia qualcosa (play, pausa, seek,
 * cambio di velocita', giro di loop). Il trasporto e' "a lettura": non ha
 * timer propri, e' chi disegna il frame a chiedere che ora e'.
 */

export type TransportState = 'idle' | 'playing' | 'paused' | 'ended';

export interface LoopRange {
  startMs: number;
  endMs: number;
}

export interface TransportOptions {
  durationMs: number;
  clock: ClockPort;
  /** 0.25..1 — la funzione "rallenta". */
  rate?: number;
  loop?: LoopRange | null;
  /** Conto alla rovescia prima della prima nota. */
  countInMs?: number;
}

export class Transport {
  private readonly clock: ClockPort;
  private durationMsValue: number;

  private anchorPosition = 0;
  private anchorRealTime = 0;
  private rateValue: number;
  private stateValue: TransportState = 'idle';
  private loopValue: LoopRange | null;
  private loopCountValue = 0;
  private countInMsValue: number;

  constructor(options: TransportOptions) {
    this.clock = options.clock;
    this.durationMsValue = options.durationMs;
    this.rateValue = clampRate(options.rate ?? 1);
    this.loopValue = options.loop ?? null;
    this.countInMsValue = Math.max(0, options.countInMs ?? 0);
    this.anchorPosition = this.minPosition;
  }

  /** Inizio della corsa: negativo solo se c'e' un conto alla rovescia. */
  private get minPosition(): number {
    return this.countInMsValue > 0 ? -this.countInMsValue : 0;
  }

  get state(): TransportState { return this.stateValue; }
  get isPlaying(): boolean { return this.stateValue === 'playing'; }
  get rate(): number { return this.rateValue; }
  get durationMs(): number { return this.durationMsValue; }
  get loop(): LoopRange | null { return this.loopValue; }
  /** Quante volte il loop e' ripartito da capo. */
  get loopCount(): number { return this.loopCountValue; }

  /**
   * Posizione nel brano. Negativa durante il conto alla rovescia:
   * -2000 significa "il brano inizia fra due secondi".
   */
  get positionMs(): number {
    if (this.stateValue !== 'playing') return this.anchorPosition;

    const raw = this.anchorPosition + (this.clock.now() - this.anchorRealTime) * this.rateValue;

    if (this.loopValue) {
      const { startMs, endMs } = this.loopValue;
      const length = endMs - startMs;
      if (length > 0 && raw >= endMs) {
        // Il giro di loop e' un evento: ri-ancora invece di lasciare che
        // la posizione cresca all'infinito.
        const overshoot = raw - endMs;
        this.loopCountValue += Math.floor(overshoot / length) + 1;
        this.anchorPosition = startMs + (overshoot % length);
        this.anchorRealTime = this.clock.now();
        return this.anchorPosition;
      }
      return raw;
    }

    if (raw >= this.durationMsValue) {
      this.anchorPosition = this.durationMsValue;
      this.stateValue = 'ended';
      return this.durationMsValue;
    }
    return raw;
  }

  /**
   * Posizione del brano corrispondente a un istante reale passato.
   *
   * Serve per gli eventi di ingresso: il timestamp e' quello in cui il
   * tasto e' stato premuto, non quello in cui l'evento arriva a noi.
   * Usare l'istante di arrivo significherebbe misurare la latenza del
   * runtime JavaScript e addebitarla all'utente.
   */
  positionAt(realTime: number): number {
    if (this.stateValue !== 'playing') return this.anchorPosition;
    return this.anchorPosition + (realTime - this.anchorRealTime) * this.rateValue;
  }

  play(): void {
    if (this.stateValue === 'playing') return;
    if (this.stateValue === 'ended') this.anchorPosition = this.loopValue?.startMs ?? 0;
    this.anchorRealTime = this.clock.now();
    this.stateValue = 'playing';
  }

  pause(): void {
    if (this.stateValue !== 'playing') return;
    this.anchorPosition = this.positionMs;
    this.anchorRealTime = this.clock.now();
    this.stateValue = 'paused';
  }

  stop(): void {
    this.anchorPosition = this.minPosition;
    this.anchorRealTime = this.clock.now();
    this.stateValue = 'idle';
    this.loopCountValue = 0;
  }

  seek(positionMs: number): void {
    this.anchorPosition = Math.min(Math.max(positionMs, this.minPosition), this.durationMsValue);
    this.anchorRealTime = this.clock.now();
    if (this.stateValue === 'ended' && this.anchorPosition < this.durationMsValue) {
      this.stateValue = 'paused';
    }
  }

  /**
   * Cambia velocita' senza far saltare la posizione: si ancora prima al
   * punto attuale, poi si cambia il fattore. Facendo il contrario, ogni
   * cambio di velocita' sposterebbe il brano di qualche decimo.
   */
  setRate(rate: number): void {
    const next = clampRate(rate);
    if (next === this.rateValue) return;
    this.anchorPosition = this.positionMs;
    this.anchorRealTime = this.clock.now();
    this.rateValue = next;
  }

  setLoop(loop: LoopRange | null): void {
    this.anchorPosition = this.positionMs;
    this.anchorRealTime = this.clock.now();
    this.loopValue = loop && loop.endMs > loop.startMs ? loop : null;
    this.loopCountValue = 0;
    if (this.loopValue && (this.anchorPosition < this.loopValue.startMs || this.anchorPosition >= this.loopValue.endMs)) {
      this.anchorPosition = this.loopValue.startMs;
    }
  }

  /** Frazione 0..1 di avanzamento, per la barra a schermo. */
  get progress(): number {
    if (this.durationMsValue <= 0) return 0;
    return Math.min(1, Math.max(0, this.positionMs / this.durationMsValue));
  }
}

export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(1, Math.max(0.25, rate));
}
