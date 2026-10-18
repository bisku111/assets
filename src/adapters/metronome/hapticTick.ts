import * as Haptics from 'expo-haptics';
import type { MetronomePort } from '../../core/ports/metronome';

/**
 * Battito tattile su iOS e Android.
 *
 * Non c'e' un click udibile perche' il repository non contiene file
 * audio e nessuna API di Expo sintetizza un suono. La vibrazione e' un
 * riferimento reale e sufficiente per la calibrazione; quando il modulo
 * nativo audio verra' aggiunto, qui si potra' sostituire con un click
 * vero senza toccare nient'altro.
 */
export class HapticMetronome implements MetronomePort {
  readonly kind = 'haptic' as const;

  tick(strong: boolean): void {
    // Le promesse si ignorano di proposito: un battito perso vale meno
    // di un errore mostrato a schermo durante la calibrazione.
    void Haptics.impactAsync(
      strong ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light,
    ).catch(() => undefined);
  }

  dispose(): void {}
}
