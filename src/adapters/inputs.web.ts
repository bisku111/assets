import type { NoteInputPort } from '../core/ports/noteInput';
import { WebAudioMicrophoneInput } from './audio/webAudio';
import { VirtualKeyboardInput } from './midi/virtualKeyboard';
import { WebMidiInput } from './midi/webMidi';

/** Sorgenti di ingresso su web: qui MIDI e microfono sono reali. */
export function createMidiInput(): NoteInputPort {
  return new WebMidiInput();
}

export function createMicrophoneInput(): NoteInputPort {
  return new WebAudioMicrophoneInput();
}

export function createVirtualKeyboardInput(): VirtualKeyboardInput {
  return new VirtualKeyboardInput();
}
