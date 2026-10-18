import type { ClockPort } from '../ports/clock';
import { calibrateLatency, type CalibrationResult, type CalibrationSample } from './latency';

/**
 * Sessione di calibrazione: metronomo + raccolta dei colpi.
 *
 * COSA MISURA, detto chiaramente. Il ritardo fra il tasto premuto e
 * l'evento ricevuto non e' osservabile da solo: serve un riferimento, e
 * l'unico disponibile e' l'utente che suona a tempo. Quindi la misura
 * comprende DUE cose insieme:
 *   - il ritardo tecnico della catena (USB pochi ms, Bluetooth anche 100);
 *   - la tendenza personale di chi suona, che di norma anticipa di
 *     qualche decina di millisecondi.
 *
 * Non e' un difetto del metodo: e' esattamente cio' che serve, perche'
 * l'obiettivo e' che il giudizio dell'app coincida con quello che
 * l'allievo sente. La schermata lo dice all'utente invece di spacciare
 * il numero per una misura puramente tecnica, e permette di correggerlo
 * a mano.
 *
 * Gli istanti dei battiti non vengono accumulati ma calcolati da un
 * ancoraggio, per lo stesso motivo del trasporto: un metronomo che
 * deriva calibrerebbe sul proprio errore.
 */

export interface CalibrationOptions {
  clock: ClockPort;
  /** Battiti al minuto del metronomo. */
  bpm?: number;
  /** Battiti da misurare. */
  beats?: number;
  /** Battiti di preparazione, non misurati. */
  countInBeats?: number;
}

export type CalibrationPhase = 'idle' | 'count-in' | 'measuring' | 'done';

export interface CalibrationFrame {
  phase: CalibrationPhase;
  /** Battito corrente: negativo durante la preparazione. */
  beatIndex: number;
  /** 0..1 dentro il battito corrente: alimenta l'animazione del pulsare. */
  beatProgress: number;
  /** Colpi gia' registrati. */
  collected: number;
  totalBeats: number;
}

export class LatencyCalibrator {
  private readonly clock: ClockPort;
  private readonly beatMs: number;
  private readonly beats: number;
  private readonly countInBeats: number;

  private startedAt: number | null = null;
  private readonly collected: CalibrationSample[] = [];
  /** Battiti gia' usati: un colpo per battito, niente doppi conteggi. */
  private readonly usedBeats = new Set<number>();

  constructor(options: CalibrationOptions) {
    const { clock, bpm = 80, beats = 8, countInBeats = 4 } = options;
    this.clock = clock;
    this.beatMs = 60_000 / bpm;
    this.beats = beats;
    this.countInBeats = countInBeats;
  }

  get beatIntervalMs(): number {
    return this.beatMs;
  }

  start(): void {
    this.startedAt = this.clock.now();
    this.collected.length = 0;
    this.usedBeats.clear();
  }

  /** Istante atteso di un battito misurato (indice da 0). */
  expectedTimeOf(beatIndex: number): number {
    if (this.startedAt === null) return Number.NaN;
    return this.startedAt + (this.countInBeats + beatIndex) * this.beatMs;
  }

  tick(): CalibrationFrame {
    if (this.startedAt === null) {
      return { phase: 'idle', beatIndex: -this.countInBeats, beatProgress: 0, collected: 0, totalBeats: this.beats };
    }

    const trascorso = this.clock.now() - this.startedAt;
    const battitoAssoluto = Math.floor(trascorso / this.beatMs);
    const beatIndex = battitoAssoluto - this.countInBeats;
    const beatProgress = (trascorso % this.beatMs) / this.beatMs;

    // Si lascia mezzo battito di coda dopo l'ultimo: un colpo in lieve
    // ritardo sull'ultimo battito deve poter ancora essere registrato.
    const phase: CalibrationPhase =
      beatIndex < 0 ? 'count-in'
      : beatIndex < this.beats ? 'measuring'
      : trascorso < (this.countInBeats + this.beats) * this.beatMs + this.beatMs / 2 ? 'measuring'
      : 'done';

    return {
      phase,
      beatIndex: Math.min(beatIndex, this.beats - 1),
      beatProgress,
      collected: this.collected.length,
      totalBeats: this.beats,
    };
  }

  /**
   * Registra un colpo, associandolo al battito piu' vicino.
   *
   * L'associazione al piu' vicino, e non "al prossimo in ordine", evita
   * che un colpo saltato sfasi tutti quelli successivi: senza, un solo
   * errore dell'utente renderebbe inutile l'intera calibrazione.
   */
  record(timestamp: number): boolean {
    if (this.startedAt === null) return false;

    const relativo = timestamp - this.startedAt;
    const battitoAssoluto = Math.round(relativo / this.beatMs);
    const beatIndex = battitoAssoluto - this.countInBeats;

    if (beatIndex < 0 || beatIndex >= this.beats) return false;   // preparazione o fuori corsa
    if (this.usedBeats.has(beatIndex)) return false;              // un colpo per battito

    this.usedBeats.add(beatIndex);
    this.collected.push({ expectedMs: this.expectedTimeOf(beatIndex), actualMs: timestamp });
    return true;
  }

  get samples(): CalibrationSample[] {
    return [...this.collected];
  }

  result(): CalibrationResult {
    return calibrateLatency(this.collected);
  }
}
