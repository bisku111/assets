import { MidiParser } from './parser';
import { MidiNoteTranslator } from './translator';

describe('interprete MIDI', () => {
  it('legge un Note On con velocity', () => {
    expect(new MidiParser().parse([0x90, 60, 100], 5)).toEqual([
      { type: 'note-on', channel: 0, midi: 60, velocity: 100 / 127, timestamp: 5 },
    ]);
  });

  it('legge un Note Off esplicito', () => {
    expect(new MidiParser().parse([0x80, 60, 0], 7)).toEqual([
      { type: 'note-off', channel: 0, midi: 60, timestamp: 7 },
    ]);
  });

  it('tratta Note On con velocity 0 come rilascio, come fanno quasi tutte le tastiere', () => {
    expect(new MidiParser().parse([0x90, 60, 0], 3)).toEqual([
      { type: 'note-off', channel: 0, midi: 60, timestamp: 3 },
    ]);
  });

  it('gestisce il running status: lo stato omesso nei messaggi successivi', () => {
    // Una scala inviata con un solo byte di stato iniziale.
    const eventi = new MidiParser().parse([0x90, 60, 100, 62, 100, 64, 100], 0);
    expect(eventi.map((e) => (e as { midi: number }).midi)).toEqual([60, 62, 64]);
    expect(eventi.every((e) => e.type === 'note-on')).toBe(true);
  });

  it('non lascia che i messaggi real-time rompano il running status', () => {
    // 0xF8 (clock) infilato in mezzo ai dati: è il caso reale che manda
    // in confusione i parser ingenui.
    const eventi = new MidiParser().parse([0x90, 60, 100, 0xf8, 62, 100], 0);
    expect(eventi.map((e) => (e as { midi: number }).midi)).toEqual([60, 62]);
  });

  it('ricompone un messaggio spezzato fra due pacchetti', () => {
    const p = new MidiParser();
    expect(p.parse([0x90, 60], 0)).toEqual([]);
    expect(p.parse([100], 10)).toEqual([
      { type: 'note-on', channel: 0, midi: 60, velocity: 100 / 127, timestamp: 10 },
    ]);
  });

  it('ignora i blocchi SysEx senza confondersi', () => {
    const eventi = new MidiParser().parse([0xf0, 0x7e, 0x00, 0x06, 0xf7, 0x90, 64, 90], 0);
    expect(eventi).toEqual([{ type: 'note-on', channel: 0, midi: 64, velocity: 90 / 127, timestamp: 0 }]);
  });

  it('riconosce il pedale di risonanza sul CC 64', () => {
    const p = new MidiParser();
    expect(p.parse([0xb0, 64, 127], 0)).toEqual([{ type: 'sustain', channel: 0, down: true, timestamp: 0 }]);
    expect(p.parse([0xb0, 64, 0], 1)).toEqual([{ type: 'sustain', channel: 0, down: false, timestamp: 1 }]);
    // Sotto 64 il pedale è considerato alzato (convenzione MIDI).
    expect(p.parse([0xb0, 64, 30], 2)).toEqual([{ type: 'sustain', channel: 0, down: false, timestamp: 2 }]);
  });

  it('legge il canale di provenienza', () => {
    const [evento] = new MidiParser().parse([0x93, 60, 100], 0);
    expect((evento as { channel: number }).channel).toBe(3);
  });

  it('gestisce i messaggi a un solo byte di dati senza sfasarsi', () => {
    // Program change (2 byte in tutto) seguito da una nota.
    const eventi = new MidiParser().parse([0xc0, 5, 0x90, 60, 100], 0);
    expect(eventi).toHaveLength(1);
    expect(eventi[0]).toMatchObject({ type: 'note-on', midi: 60 });
  });

  it('scarta i byte di dati orfani invece di inventarsi eventi', () => {
    expect(new MidiParser().parse([60, 100, 62], 0)).toEqual([]);
  });

  it('interpreta il pitch bend con lo zero al centro', () => {
    expect(new MidiParser().parse([0xe0, 0x00, 0x40], 0)).toEqual([
      { type: 'pitch-bend', channel: 0, value: 0, timestamp: 0 },
    ]);
  });
});

describe('pedale e note in suono', () => {
  it('con il pedale premuto il rilascio del tasto non spegne la nota', () => {
    const t = new MidiNoteTranslator();
    t.translate({ type: 'sustain', channel: 0, down: true, timestamp: 0 });
    t.translate({ type: 'note-on', channel: 0, midi: 60, velocity: 0.8, timestamp: 1 });
    expect(t.translate({ type: 'note-off', channel: 0, midi: 60, timestamp: 2 })).toEqual([]);
    expect(t.soundingNotes()).toEqual([60]);
  });

  it('quando il pedale si alza si spengono tutte le note che teneva', () => {
    const t = new MidiNoteTranslator();
    t.translate({ type: 'sustain', channel: 0, down: true, timestamp: 0 });
    for (const midi of [60, 64, 67]) {
      t.translate({ type: 'note-on', channel: 0, midi, velocity: 0.8, timestamp: 1 });
      t.translate({ type: 'note-off', channel: 0, midi, timestamp: 2 });
    }
    const rilasci = t.translate({ type: 'sustain', channel: 0, down: false, timestamp: 3 });
    expect(rilasci.map((e) => e.midi).sort((a, b) => a - b)).toEqual([60, 64, 67]);
    expect(t.soundingNotes()).toEqual([]);
  });

  it('senza pedale il rilascio spegne subito', () => {
    const t = new MidiNoteTranslator();
    t.translate({ type: 'note-on', channel: 0, midi: 60, velocity: 0.8, timestamp: 0 });
    expect(t.translate({ type: 'note-off', channel: 0, midi: 60, timestamp: 1 })).toHaveLength(1);
    expect(t.soundingNotes()).toEqual([]);
  });

  it('un tasto ripremuto mentre il pedale e giu resta acceso una volta sola', () => {
    const t = new MidiNoteTranslator();
    t.translate({ type: 'sustain', channel: 0, down: true, timestamp: 0 });
    t.translate({ type: 'note-on', channel: 0, midi: 60, velocity: 0.8, timestamp: 1 });
    t.translate({ type: 'note-off', channel: 0, midi: 60, timestamp: 2 });
    t.translate({ type: 'note-on', channel: 0, midi: 60, velocity: 0.8, timestamp: 3 });
    expect(t.soundingNotes()).toEqual([60]);
  });

  it('"all notes off" spegne tutto, anche quello che teneva il pedale', () => {
    const t = new MidiNoteTranslator();
    t.translate({ type: 'sustain', channel: 0, down: true, timestamp: 0 });
    t.translate({ type: 'note-on', channel: 0, midi: 60, velocity: 0.8, timestamp: 1 });
    t.translate({ type: 'note-off', channel: 0, midi: 60, timestamp: 2 });
    t.translate({ type: 'note-on', channel: 0, midi: 72, velocity: 0.8, timestamp: 3 });

    const spenti = t.translate({ type: 'all-notes-off', channel: 0, timestamp: 4 });
    expect(spenti.map((e) => e.midi).sort((a, b) => a - b)).toEqual([60, 72]);
    expect(t.soundingNotes()).toEqual([]);
  });

  it('dichiara il MIDI come dato esatto, non come stima', () => {
    const t = new MidiNoteTranslator();
    const [evento] = t.translate({ type: 'note-on', channel: 0, midi: 60, velocity: 0.5, timestamp: 0 });
    expect(evento).toMatchObject({ confidence: 1, source: 'midi' });
  });
});
