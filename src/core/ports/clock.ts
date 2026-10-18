/**
 * Sorgente di tempo monotona, in millisecondi.
 *
 * E' una porta e non una chiamata diretta a Date.now() per due motivi:
 *  - nei test il tempo deve essere controllabile, altrimenti si finisce a
 *    testare il motore con dei setTimeout e i test diventano lenti e ballerini;
 *  - in produzione serve un orologio MONOTONO (performance.now), non l'ora
 *    di sistema, che puo' saltare all'indietro con la sincronizzazione NTP.
 */
export interface ClockPort {
  now(): number;
}

/** Orologio reale. Usa performance.now() quando disponibile. */
export const systemClock: ClockPort = {
  now: () =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now(),
};

/** Orologio pilotato a mano: usato dai test del motore. */
export class ManualClock implements ClockPort {
  private current: number;
  constructor(start = 0) { this.current = start; }
  now(): number { return this.current; }
  advance(ms: number): number { this.current += ms; return this.current; }
  set(ms: number): void { this.current = ms; }
}
