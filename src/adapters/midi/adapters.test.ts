import { ManualClock } from '../../core/ports/clock';
import { inputStatusMessageIt, type PlayedNoteEvent } from '../../core/ports/noteInput';
import { NativeMidiInput } from './nativeMidi';
import { VirtualKeyboardInput } from './virtualKeyboard';
import { WebMidiInput } from './webMidi';

describe('tastiera a schermo come sorgente di ingresso', () => {
  it('produce eventi di nota con il timestamp del tocco', async () => {
    const clock = new ManualClock(500);
    const input = new VirtualKeyboardInput(clock);
    const eventi: PlayedNoteEvent[] = [];
    input.subscribe((e) => eventi.push(e));
    await input.start();

    input.press(60);
    clock.advance(300);
    input.release(60);

    expect(eventi).toEqual([
      { type: 'note-on', midi: 60, velocity: 0.8, timestamp: 500, confidence: 1, source: 'virtual-keyboard' },
      { type: 'note-off', midi: 60, velocity: 0, timestamp: 800, confidence: 1, source: 'virtual-keyboard' },
    ]);
  });

  it('non ribatte la nota se il dito resta appoggiato', async () => {
    const input = new VirtualKeyboardInput(new ManualClock());
    const eventi: PlayedNoteEvent[] = [];
    input.subscribe((e) => eventi.push(e));
    await input.start();
    input.press(60); input.press(60); input.press(60);
    expect(eventi.filter((e) => e.type === 'note-on')).toHaveLength(1);
  });

  it('suona gli accordi: piu tasti insieme', async () => {
    const input = new VirtualKeyboardInput(new ManualClock());
    await input.start();
    input.press(60); input.press(64); input.press(67);
    expect(input.pressedNotes()).toEqual([60, 64, 67]);
  });

  it('rilascia i tasti rimasti premuti quando si esce', async () => {
    const input = new VirtualKeyboardInput(new ManualClock());
    const eventi: PlayedNoteEvent[] = [];
    await input.start();
    input.press(60); input.press(64);
    input.subscribe((e) => eventi.push(e));

    input.stop();
    expect(eventi.map((e) => e.midi).sort((a, b) => a - b)).toEqual([60, 64]);
    expect(input.pressedNotes()).toEqual([]);
  });

  it('smette di notificare dopo la disiscrizione', async () => {
    const input = new VirtualKeyboardInput(new ManualClock());
    const eventi: PlayedNoteEvent[] = [];
    const unsubscribe = input.subscribe((e) => eventi.push(e));
    await input.start();
    unsubscribe();
    input.press(60);
    expect(eventi).toEqual([]);
  });
});

// --- Web MIDI con un accesso finto, per verificare il collegamento vero ---
function fakeMidiAccess(devices: Array<{ id: string; name: string }>) {
  const inputs = new Map(
    devices.map((d) => [d.id, { ...d, state: 'connected', onmidimessage: null as never }]),
  );
  return {
    access: { inputs, onstatechange: null } as never,
    send(deviceId: string, data: number[], timeStamp: number) {
      const device = inputs.get(deviceId) as unknown as {
        onmidimessage: ((e: { data: Uint8Array; timeStamp: number }) => void) | null;
      };
      device.onmidimessage?.({ data: Uint8Array.from(data), timeStamp });
    },
  };
}

describe('ingresso MIDI su web', () => {
  it('si collega alla tastiera e traduce i messaggi in note', async () => {
    const fake = fakeMidiAccess([{ id: 'k1', name: 'Piano digitale' }]);
    const input = new WebMidiInput(async () => fake.access);
    const eventi: PlayedNoteEvent[] = [];
    input.subscribe((e) => eventi.push(e));

    expect(await input.start()).toEqual({ state: 'ready', deviceName: 'Piano digitale' });

    fake.send('k1', [0x90, 60, 100], 1234);
    expect(eventi).toEqual([
      { type: 'note-on', midi: 60, velocity: 100 / 127, timestamp: 1234, confidence: 1, source: 'midi' },
    ]);
  });

  it('usa il running status anche quando arriva dalla tastiera vera', async () => {
    const fake = fakeMidiAccess([{ id: 'k1', name: 'Piano' }]);
    const input = new WebMidiInput(async () => fake.access);
    const eventi: PlayedNoteEvent[] = [];
    input.subscribe((e) => eventi.push(e));
    await input.start();

    fake.send('k1', [0x90, 60, 100, 64, 100, 67, 100], 10);
    expect(eventi.map((e) => e.midi)).toEqual([60, 64, 67]);
  });

  it('dice chiaramente che non c e nessuna tastiera collegata', async () => {
    const fake = fakeMidiAccess([]);
    const status = await new WebMidiInput(async () => fake.access).start();
    expect(status).toEqual({
      state: 'unavailable', reason: 'no-device', detail: 'nessuna tastiera MIDI collegata',
    });
    expect(inputStatusMessageIt(status, 'midi')).toContain('Collegala');
  });

  it('distingue il permesso negato da un errore tecnico', async () => {
    const negato = new WebMidiInput(async () => {
      throw Object.assign(new Error('no'), { name: 'SecurityError' });
    });
    expect((await negato.start()).state).toBe('denied');

    const rotto = new WebMidiInput(async () => { throw new Error('qualcosa e esploso'); });
    expect((await rotto.start()).state).toBe('error');
  });

  it('dichiara di non essere disponibile se l API non esiste', async () => {
    expect(await new WebMidiInput(null).start()).toMatchObject({
      state: 'unavailable', reason: 'platform-unsupported',
    });
  });

  it('spegne le note rimaste accese allo scollegamento', async () => {
    const fake = fakeMidiAccess([{ id: 'k1', name: 'Piano' }]);
    const input = new WebMidiInput(async () => fake.access);
    await input.start();
    fake.send('k1', [0x90, 60, 100], 0);

    const eventi: PlayedNoteEvent[] = [];
    input.subscribe((e) => eventi.push(e));
    input.stop();
    expect(eventi).toEqual([
      { type: 'note-off', midi: 60, velocity: 0, timestamp: 0, confidence: 1, source: 'midi' },
    ]);
  });
});

describe('MIDI nativo (non ancora disponibile)', () => {
  it('dichiara l assenza del modulo invece di fingere', async () => {
    expect(await new NativeMidiInput().start()).toMatchObject({
      state: 'unavailable', reason: 'native-module-missing',
    });
  });

  it('spiega la situazione all utente senza gergo tecnico', async () => {
    const messaggio = inputStatusMessageIt(await new NativeMidiInput().start(), 'midi');
    expect(messaggio).toContain('tastiera a schermo');
    expect(messaggio).not.toContain('native-module');
  });
});
