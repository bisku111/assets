import type { MetronomePort } from '../core/ports/metronome';
import { HapticMetronome } from './metronome/hapticTick';

/** Metronomo su iOS e Android: impulso tattile (vedi metronome.web.ts). */
export function createMetronome(): MetronomePort {
  return new HapticMetronome();
}
