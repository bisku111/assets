import { MidiFileError, parseMidiFile, tickToMs } from './midiFile';

import { FINE, smf as file, vlq } from './__fixtures__/smf';

describe('intestazione', () => {
  it('rifiuta un file che non è MIDI', () => {
    expect(() => parseMidiFile(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])))
      .toThrow(MidiFileError);
  });

  it('non va in crash su un file troncato', () => {
    const intero = file([[...FINE]]);
    expect(() => parseMidiFile(intero.subarray(0, 10))).toThrow(MidiFileError);
  });

  it('legge formato, divisione e numero di tracce', () => {
    const midi = parseMidiFile(file([[...FINE], [...FINE]], { division: 960, format: 1 }));
    expect(midi.format).toBe(1);
    expect(midi.ticksPerQuarter).toBe(960);
    expect(midi.tracks).toHaveLength(2);
  });

  it('dichiara di non saper leggere la divisione SMPTE invece di sbagliare i tempi', () => {
    // Bit alto acceso = tick legati ai fotogrammi video, non al movimento.
    expect(() => parseMidiFile(file([[...FINE]], { division: 0xe278 })))
      .toThrow(/SMPTE/);
  });
});

describe('note', () => {
  it('accoppia accensione e spegnimento', () => {
    const midi = parseMidiFile(file([[
      0x00, 0x90, 60, 100,
      ...vlq(480), 0x80, 60, 0,
      ...FINE,
    ]]));
    expect(midi.tracks[0]?.notes).toEqual([
      { tick: 0, durationTicks: 480, midi: 60, velocity: 100, channel: 0 },
    ]);
  });

  it('tratta l accensione con intensità zero come uno spegnimento', () => {
    // È il modo in cui quasi tutti i sequencer scrivono le note spente.
    const midi = parseMidiFile(file([[
      0x00, 0x90, 64, 80,
      ...vlq(240), 0x90, 64, 0,
      ...FINE,
    ]]));
    expect(midi.tracks[0]?.notes).toEqual([
      { tick: 0, durationTicks: 240, midi: 64, velocity: 80, channel: 0 },
    ]);
  });

  it('legge gli eventi scritti in running status', () => {
    // Secondo e terzo evento senza ripetere il byte di stato: è la
    // scrittura normale, non un caso limite.
    const midi = parseMidiFile(file([[
      0x00, 0x90, 60, 100,
      0x00, 62, 100,
      ...vlq(480), 60, 0,
      0x00, 62, 0,
      ...FINE,
    ]]));
    expect(midi.tracks[0]?.notes.map((n) => [n.midi, n.tick, n.durationTicks]))
      .toEqual([[60, 0, 480], [62, 0, 480]]);
  });

  it('non confonde lo stesso tasto su canali diversi', () => {
    const midi = parseMidiFile(file([[
      0x00, 0x90, 60, 100,
      0x00, 0x91, 60, 70,
      ...vlq(240), 0x80, 60, 0,
      ...vlq(240), 0x81, 60, 0,
      ...FINE,
    ]]));
    const note = midi.tracks[0]?.notes ?? [];
    expect(note).toHaveLength(2);
    expect(note.map((n) => [n.channel, n.durationTicks]).sort()).toEqual([[0, 240], [1, 480]]);
  });

  it('chiude la nota precedente se lo stesso tasto riparte', () => {
    const midi = parseMidiFile(file([[
      0x00, 0x90, 60, 100,
      ...vlq(240), 0x90, 60, 100,
      ...vlq(240), 0x80, 60, 0,
      ...FINE,
    ]]));
    expect(midi.tracks[0]?.notes.map((n) => [n.tick, n.durationTicks])).toEqual([[0, 240], [240, 240]]);
  });

  it('chiude a fine traccia una nota rimasta aperta invece di perderla', () => {
    const midi = parseMidiFile(file([[
      0x00, 0x90, 60, 100,
      ...vlq(600), 0xff, 0x2f, 0x00,
    ]]));
    expect(midi.tracks[0]?.notes).toEqual([
      { tick: 0, durationTicks: 600, midi: 60, velocity: 100, channel: 0 },
    ]);
  });

  it('salta i SysEx e non li scambia per note', () => {
    const midi = parseMidiFile(file([[
      0x00, 0xf0, ...vlq(3), 0x7e, 0x7f, 0xf7,
      0x00, 0x90, 60, 100,
      ...vlq(120), 0x80, 60, 0,
      ...FINE,
    ]]));
    expect(midi.tracks[0]?.notes).toHaveLength(1);
  });

  it('ignora gli altri messaggi di canale senza perdere il passo', () => {
    // Controllo (3 byte), pressione di canale (2), pitch bend (3):
    // sbagliare la lunghezza di uno solo disallinea tutto il resto.
    const midi = parseMidiFile(file([[
      0x00, 0xb0, 64, 127,
      0x00, 0xd0, 90,
      0x00, 0xe0, 0, 64,
      0x00, 0x90, 67, 100,
      ...vlq(480), 0x80, 67, 0,
      ...FINE,
    ]]));
    expect(midi.tracks[0]?.notes).toEqual([
      { tick: 0, durationTicks: 480, midi: 67, velocity: 100, channel: 0 },
    ]);
  });
});

describe('metadati', () => {
  it('legge nome della traccia, strumento e canali', () => {
    const nome = [...'Piano'].map((c) => c.charCodeAt(0));
    const midi = parseMidiFile(file([[
      0x00, 0xff, 0x03, nome.length, ...nome,
      0x00, 0xc2, 0,
      0x00, 0x92, 60, 100,
      ...vlq(100), 0x82, 60, 0,
      ...FINE,
    ]]));
    expect(midi.tracks[0]?.name).toBe('Piano');
    expect(midi.tracks[0]?.programs).toEqual([0]);
    expect(midi.tracks[0]?.channels).toEqual([2]);
  });

  it('legge tempo e indicazione di tempo', () => {
    const midi = parseMidiFile(file([[
      0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, // 500000 us = 120 BPM
      0x00, 0xff, 0x58, 0x04, 3, 2, 24, 8,      // 3/4
      ...FINE,
    ]]));
    expect(midi.tempoMap).toEqual([{ tick: 0, usPerQuarter: 500_000 }]);
    expect(midi.timeSignatures).toEqual([{ tick: 0, numerator: 3, denominator: 4 }]);
  });
});

describe('conversione dei tick in millisecondi', () => {
  it('usa 120 BPM quando il file non dichiara un tempo', () => {
    const midi = parseMidiFile(file([[...FINE]], { division: 480 }));
    expect(tickToMs(midi)(480)).toBeCloseTo(500, 6);
  });

  it('segue i cambi di tempo invece di usare solo il primo', () => {
    // 120 BPM per una semiminima, poi 60 BPM: la seconda semiminima
    // dura il doppio. Con un tempo solo si finirebbe mezzo secondo
    // fuori sincrono già alla seconda battuta.
    const midi = parseMidiFile(file([[
      0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,            // 500000 us
      ...vlq(480), 0xff, 0x51, 0x03, 0x0f, 0x42, 0x40,     // 1000000 us
      ...FINE,
    ]], { division: 480 }));

    const ms = tickToMs(midi);
    expect(ms(0)).toBeCloseTo(0, 6);
    expect(ms(480)).toBeCloseTo(500, 6);
    expect(ms(960)).toBeCloseTo(1500, 6);
  });

  it('considera 120 BPM il tratto prima del primo cambio dichiarato', () => {
    const midi = parseMidiFile(file([[
      ...vlq(480), 0xff, 0x51, 0x03, 0x0f, 0x42, 0x40,
      ...FINE,
    ]], { division: 480 }));
    expect(tickToMs(midi)(480)).toBeCloseTo(500, 6);
  });
});
