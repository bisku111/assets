import { midiToFrequency } from '../../core/music/note';
import { inputStatusMessageIt, type PlayedNoteEvent } from '../../core/ports/noteInput';
import { NativeMicrophoneInput } from './nativeAudio';
import { WebAudioMicrophoneInput, type WebAudioDependencies } from './webAudio';

const SAMPLE_RATE = 44_100;
const BLOCK = 2048;

/** Web Audio finta: permette di "suonare" nel microfono dentro un test. */
function fakeWebAudio(options: { failWith?: string } = {}) {
  let onProcess: ((e: { inputBuffer: { getChannelData(c: number): Float32Array } }) => void) | null = null;
  let closed = false;
  let tracksStopped = 0;
  let time = 0;

  const deps: WebAudioDependencies = {
    getUserMedia: async () => {
      if (options.failWith) throw Object.assign(new Error('no'), { name: options.failWith });
      return { getTracks: () => [{ stop: () => { tracksStopped += 1; } }] };
    },
    createContext: () => ({
      sampleRate: SAMPLE_RATE,
      currentTime: 0,
      destination: {},
      createMediaStreamSource: () => ({ connect: () => {}, disconnect: () => {} }),
      createScriptProcessor: () => ({
        set onaudioprocess(handler: typeof onProcess) { onProcess = handler; },
        get onaudioprocess() { return onProcess; },
        connect: () => {},
        disconnect: () => {},
      }),
      close: async () => { closed = true; },
      resume: async () => {},
    }),
    now: () => time,
  };

  return {
    deps,
    get closed() { return closed; },
    get tracksStopped() { return tracksStopped; },
    /** Invia un blocco di segnale come farebbe il microfono. */
    feed(midi: number | null, blockIndex: number, amplitude = 0.4) {
      time = ((blockIndex + 1) * BLOCK * 1000) / SAMPLE_RATE;
      const samples = new Float32Array(BLOCK);
      if (midi !== null) {
        const f = midiToFrequency(midi);
        const offset = blockIndex * BLOCK;
        for (let i = 0; i < BLOCK; i++) {
          const t = offset + i;
          samples[i] = amplitude * (
            0.4 * Math.sin((2 * Math.PI * f * t) / SAMPLE_RATE) +
            0.45 * Math.sin((2 * Math.PI * f * 2 * t) / SAMPLE_RATE) +
            0.2 * Math.sin((2 * Math.PI * f * 3 * t) / SAMPLE_RATE)
          );
        }
      }
      onProcess?.({ inputBuffer: { getChannelData: () => samples } });
    },
  };
}

describe('microfono su web', () => {
  it('trasforma davvero il suono in note', async () => {
    const fake = fakeWebAudio();
    const input = new WebAudioMicrophoneInput(fake.deps);
    const eventi: PlayedNoteEvent[] = [];
    input.subscribe((e) => eventi.push(e));

    expect(await input.start()).toMatchObject({ state: 'ready' });
    for (let i = 0; i < 6; i++) fake.feed(60, i);
    for (let i = 6; i < 12; i++) fake.feed(62, i);

    expect(eventi.filter((e) => e.type === 'note-on').map((e) => e.midi)).toEqual([60, 62]);
  });

  it('dichiara di essere una stima, non un dato esatto', async () => {
    const fake = fakeWebAudio();
    const input = new WebAudioMicrophoneInput(fake.deps);
    expect(input.polyphonic).toBe(false); // YIN è monofonico
    const eventi: PlayedNoteEvent[] = [];
    input.subscribe((e) => eventi.push(e));
    await input.start();
    for (let i = 0; i < 6; i++) fake.feed(60, i);

    const attacco = eventi.find((e) => e.type === 'note-on')!;
    expect(attacco.source).toBe('microphone');
    expect(attacco.confidence).toBeLessThanOrEqual(1);
  });

  it('data il blocco al momento della cattura, non a quello dell elaborazione', async () => {
    const fake = fakeWebAudio();
    const input = new WebAudioMicrophoneInput(fake.deps);
    const eventi: PlayedNoteEvent[] = [];
    input.subscribe((e) => eventi.push(e));
    await input.start();
    for (let i = 0; i < 6; i++) fake.feed(60, i);

    // Il primo blocco copre 0..46 ms: l'attacco non può essere datato dopo.
    expect(eventi.find((e) => e.type === 'note-on')!.timestamp)
      .toBeLessThanOrEqual((BLOCK / SAMPLE_RATE) * 1000);
  });

  it('non inventa note nel silenzio', async () => {
    const fake = fakeWebAudio();
    const input = new WebAudioMicrophoneInput(fake.deps);
    const eventi: PlayedNoteEvent[] = [];
    input.subscribe((e) => eventi.push(e));
    await input.start();
    for (let i = 0; i < 20; i++) fake.feed(null, i);
    expect(eventi).toEqual([]);
  });

  it('gestisce il permesso negato con un messaggio comprensibile', async () => {
    const status = await new WebAudioMicrophoneInput(fakeWebAudio({ failWith: 'NotAllowedError' }).deps).start();
    expect(status.state).toBe('denied');
    const messaggio = inputStatusMessageIt(status, 'microphone');
    expect(messaggio).toContain('tastiera a schermo');
    expect(messaggio).not.toContain('NotAllowedError');
  });

  it('distingue "nessun microfono" da "permesso negato"', async () => {
    expect(await new WebAudioMicrophoneInput(fakeWebAudio({ failWith: 'NotFoundError' }).deps).start())
      .toMatchObject({ state: 'unavailable', reason: 'no-device' });
  });

  it('spegne davvero il microfono quando si esce', async () => {
    const fake = fakeWebAudio();
    const input = new WebAudioMicrophoneInput(fake.deps);
    await input.start();
    input.stop();
    expect(fake.tracksStopped).toBe(1);
    expect(fake.closed).toBe(true);
    expect(input.getStatus()).toEqual({ state: 'idle' });
  });

  it('dichiara di non essere disponibile dove Web Audio non esiste', async () => {
    expect(await new WebAudioMicrophoneInput(null).start()).toMatchObject({
      state: 'unavailable', reason: 'platform-unsupported',
    });
  });
});

describe('microfono nativo (non ancora disponibile)', () => {
  it('dichiara l assenza del modulo invece di fingere di ascoltare', async () => {
    const status = await new NativeMicrophoneInput().start();
    expect(status).toMatchObject({ state: 'unavailable', reason: 'native-module-missing' });
    expect(inputStatusMessageIt(status, 'microphone')).toContain('tastiera a schermo');
  });
});
