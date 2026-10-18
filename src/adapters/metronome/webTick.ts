import type { MetronomePort } from '../../core/ports/metronome';

/**
 * Click del metronomo su web, generato con Web Audio.
 *
 * Nessun file audio nel repository: il suono è un'onda sinusoidale con
 * un inviluppo molto corto. È il riferimento migliore per la
 * calibrazione, perché l'orecchio giudica il tempo meglio dell'occhio.
 *
 * L'inviluppo usa rampe esponenziali e non un attacco netto: un gradino
 * a zero produce un "clic" di distorsione che maschera l'attacco vero e
 * rende il riferimento meno definito.
 */
export class WebAudioMetronome implements MetronomePort {
  readonly kind = 'audio' as const;
  private context: AudioContext | null = null;

  constructor() {
    const Ctor =
      (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) this.context = new Ctor();
  }

  tick(strong: boolean): void {
    const ctx = this.context;
    if (!ctx) return;
    // Il contesto parte sospeso finché non c'è un gesto dell'utente:
    // riprenderlo qui è innocuo e risolve il primo click muto.
    void ctx.resume();

    const adesso = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.value = strong ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, adesso);
    gain.gain.exponentialRampToValueAtTime(strong ? 0.35 : 0.22, adesso + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, adesso + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(adesso);
    osc.stop(adesso + 0.07);
  }

  dispose(): void {
    void this.context?.close();
    this.context = null;
  }
}
