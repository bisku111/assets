import type { NoteInputPort } from '../core/ports/noteInput';
import { NativeMicrophoneInput } from './audio/nativeAudio';
import { NativeMidiInput } from './midi/nativeMidi';
import { VirtualKeyboardInput } from './midi/virtualKeyboard';

/**
 * Sorgenti di ingresso su iOS e Android.
 *
 * La versione web e' in `inputs.web.ts`: Metro sceglie il file giusto in
 * base alla piattaforma, cosi' il bundle mobile non porta con se' codice
 * Web Audio e viceversa.
 */
export function createMidiInput(): NoteInputPort {
  return new NativeMidiInput();
}

export function createMicrophoneInput(): NoteInputPort {
  return new NativeMicrophoneInput();
}

export function createVirtualKeyboardInput(): VirtualKeyboardInput {
  return new VirtualKeyboardInput();
}
