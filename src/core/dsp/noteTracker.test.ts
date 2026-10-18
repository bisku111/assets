import { midiToFrequency } from '../music/note';
import type { PlayedNoteEvent } from '../ports/noteInput';
import { AudioNoteTracker } from './noteTracker';

const SAMPLE_RATE = 44_100;
const BLOCK = 2048;
const BLOCK_MS = (BLOCK / SAMPLE_RATE) * 1000; // ~46.4 ms

/** Blocco di segnale "da pianoforte" con fase continua fra i blocchi. */
function block(frequencyHz: number, blockIndex: number, amplitude = 0.4): Float32Array {
  const buffer = new Float32Array(BLOCK);
  const offset = blockIndex * BLOCK;
  const partials = [
    { multiple: 1, amplitude: 0.4 }, { multiple: 2, amplitude: 0.45 }, { multiple: 3, amplitude: 0.2 },
  ];
  for (let i = 0; i < BLOCK; i++) {
    let value = 0;
    for (const p of partials) {
      value += p.amplitude * Math.sin((2 * Math.PI * frequencyHz * p.multiple * (offset + i)) / SAMPLE_RATE);
    }
    buffer[i] = (value / 1.05) * amplitude;
  }
  return buffer;
}

const silence = () => new Float32Array(BLOCK);

/** Suona una sequenza di note e raccoglie gli eventi prodotti. */
function play(
  tracker: AudioNoteTracker,
  steps: Array<{ midi: number | null; blocks: number; amplitude?: number }>,
): PlayedNoteEvent[] {
  const events: PlayedNoteEvent[] = [];
  let index = 0;
  for (const step of steps) {
    for (let i = 0; i < step.blocks; i++, index++) {
      const samples =
        step.midi === null ? silence() : block(midiToFrequency(step.midi), index, step.amplitude ?? 0.4);
      events.push(...tracker.process(samples, index * BLOCK_MS));
    }
  }
  events.push(...tracker.flush(index * BLOCK_MS));
  return events;
}

const onsets = (events: PlayedNoteEvent[]) => events.filter((e) => e.type === 'note-on').map((e) => e.midi);

const makeTracker = () => new AudioNoteTracker({ sampleRate: SAMPLE_RATE, midiRange: { min: 36, max: 96 } });

describe('dal microfono alle note', () => {
  it('riconosce una nota tenuta e la spegne quando finisce', () => {
    const eventi = play(makeTracker(), [{ midi: 60, blocks: 6 }, { midi: null, blocks: 6 }]);
    expect(onsets(eventi)).toEqual([60]);
    expect(eventi.filter((e) => e.type === 'note-off').map((e) => e.midi)).toEqual([60]);
  });

  it('riconosce una melodia di note diverse', () => {
    const eventi = play(makeTracker(), [
      { midi: 60, blocks: 5 }, { midi: 62, blocks: 5 }, { midi: 64, blocks: 5 }, { midi: 65, blocks: 5 },
    ]);
    expect(onsets(eventi)).toEqual([60, 62, 64, 65]);
  });

  it('non produce note nel silenzio', () => {
    expect(play(makeTracker(), [{ midi: null, blocks: 20 }])).toEqual([]);
  });

  it('non si fa ingannare da un singolo blocco sbagliato', () => {
    // Un blocco isolato di un'altra altezza, come capita sull'attacco
    // percussivo: non deve diventare una nota.
    const tracker = makeTracker();
    const eventi: PlayedNoteEvent[] = [];
    for (let i = 0; i < 10; i++) {
      const midi = i === 5 ? 71 : 60;
      eventi.push(...tracker.process(block(midiToFrequency(midi), i), i * BLOCK_MS));
    }
    expect(onsets(eventi)).toEqual([60]);
  });

  it('non spegne la nota per un singolo blocco incerto', () => {
    const tracker = makeTracker();
    const eventi: PlayedNoteEvent[] = [];
    for (let i = 0; i < 10; i++) {
      const samples = i === 5 ? silence() : block(midiToFrequency(60), i);
      eventi.push(...tracker.process(samples, i * BLOCK_MS));
    }
    expect(eventi.filter((e) => e.type === 'note-off')).toHaveLength(0);
  });

  it('data la nota dal primo blocco in cui compare, non da quello della conferma', () => {
    // Se datasse la nota alla conferma, ogni nota risulterebbe in
    // ritardo di un paio di blocchi (~90 ms) e il giudizio ritmico
    // sarebbe sistematicamente sbagliato.
    const eventi = play(makeTracker(), [{ midi: 60, blocks: 6 }]);
    expect(eventi.find((e) => e.type === 'note-on')!.timestamp).toBeLessThanOrEqual(BLOCK_MS);
  });

  it('riconosce il riattacco della stessa nota dal balzo di energia', () => {
    const eventi = play(makeTracker(), [
      { midi: 60, blocks: 5, amplitude: 0.15 },
      { midi: 60, blocks: 5, amplitude: 0.6 },
    ]);
    expect(onsets(eventi)).toEqual([60, 60]);
  });

  it('scarta le note fuori dall estensione del brano', () => {
    const tracker = new AudioNoteTracker({ sampleRate: SAMPLE_RATE, midiRange: { min: 60, max: 72 } });
    // DO3 (48) è sotto l'estensione dichiarata: va ignorato.
    expect(onsets(play(tracker, [{ midi: 48, blocks: 6 }]))).toEqual([]);
  });

  it('porta con se la confidenza: il microfono e una stima, non un dato certo', () => {
    const attacco = play(makeTracker(), [{ midi: 60, blocks: 6 }]).find((e) => e.type === 'note-on')!;
    expect(attacco.source).toBe('microphone');
    expect(attacco.confidence).toBeGreaterThan(0);
    expect(attacco.confidence).toBeLessThanOrEqual(1);
  });

  it('chiude la nota aperta quando la sessione finisce', () => {
    const tracker = makeTracker();
    for (let i = 0; i < 6; i++) tracker.process(block(midiToFrequency(60), i), i * BLOCK_MS);
    expect(tracker.currentNote).toBe(60);
    expect(tracker.flush(1000)).toHaveLength(1);
    expect(tracker.currentNote).toBeNull();
  });

  it('non lascia mai un note-on senza il suo note-off', () => {
    const eventi = play(makeTracker(), [
      { midi: 60, blocks: 4 }, { midi: 64, blocks: 4 }, { midi: null, blocks: 5 }, { midi: 67, blocks: 4 },
    ]);
    const aperti = new Map<number, number>();
    for (const e of eventi) {
      aperti.set(e.midi, (aperti.get(e.midi) ?? 0) + (e.type === 'note-on' ? 1 : -1));
    }
    expect([...aperti.values()].every((v) => v === 0)).toBe(true);
  });
});
