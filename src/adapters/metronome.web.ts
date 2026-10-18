import type { MetronomePort } from '../core/ports/metronome';
import { WebAudioMetronome } from './metronome/webTick';

/** Metronomo su web: click udibile generato con Web Audio. */
export function createMetronome(): MetronomePort {
  return new WebAudioMetronome();
}
