import { NotationError, buildSong, parseVoice, type SongDef } from './builder';

describe('notazione compatta', () => {
  it('calcola i tempi dai movimenti', () => {
    const { notes, lengthBeats } = parseVoice('DO4 RE4:2 MI4', { hand: 'right', bpm: 120 });
    expect(notes.map((n) => [n.midi, n.startMs])).toEqual([[60, 0], [62, 500], [64, 1500]]);
    expect(lengthBeats).toBe(4);
  });

  it('gestisce le pause senza produrre note', () => {
    const { notes, lengthBeats } = parseVoice('DO4 -:2 RE4', { hand: 'right', bpm: 60 });
    expect(notes).toHaveLength(2);
    expect(notes[1]?.startMs).toBe(3000);
    expect(lengthBeats).toBe(4);
  });

  it('fa partire insieme le note di un accordo', () => {
    const { notes } = parseVoice('DO4+MI4+SOL4:2', { hand: 'left', bpm: 120 });
    expect(notes).toHaveLength(3);
    expect(new Set(notes.map((n) => n.startMs))).toEqual(new Set([0]));
    expect(notes.map((n) => n.midi)).toEqual([60, 64, 67]);
  });

  it('accetta la diteggiatura e la legatura in entrambe le forme', () => {
    expect(parseVoice('DO4:1@3', { hand: 'right', bpm: 60 }).notes[0]?.finger).toBe(3);
    const prima = parseVoice('DO4~:2', { hand: 'right', bpm: 60 }).notes[0];
    const dopo = parseVoice('DO4:2~', { hand: 'right', bpm: 60 }).notes[0];
    expect(prima?.durationMs).toBe(dopo?.durationMs);
    expect(prima!.durationMs).toBeGreaterThan(2000);
  });

  it('lascia un minimo stacco fra note consecutive, cosi il matcher le distingue', () => {
    const { notes } = parseVoice('DO4 DO4', { hand: 'right', bpm: 60 });
    const [primo, secondo] = notes;
    expect(primo!.startMs + primo!.durationMs).toBeLessThan(secondo!.startMs);
  });

  it('segnala gli errori di notazione invece di ignorarli', () => {
    expect(() => parseVoice('XX4', { hand: 'right', bpm: 60 })).toThrow(NotationError);
    expect(() => parseVoice('DO4:0', { hand: 'right', bpm: 60 })).toThrow(/durata non valida/);
  });
});

describe('costruzione del brano', () => {
  const def: SongDef = {
    id: 'test', slug: 'test', title: 'Test', artistId: 'a', artistName: 'A',
    coverColors: ['#000', '#fff'], bpm: 120, keySignature: 'C', isFree: true,
    license: { status: 'original', owner: 'Maestro', type: 'proprietary', territory: 'WW', startDate: null, endDate: null },
    arrangements: [{
      difficulty: 'beginner',
      sections: [
        { id: 's1', kind: 'intro', name: 'Intro', right: 'DO4 RE4 MI4 FA4' },
        // Frase di 3 movimenti: deve essere arrotondata a una battuta piena.
        { id: 's2', kind: 'chorus', name: 'Ritornello', right: 'SOL4 LA4 SI4', loopRecommended: true },
      ],
    }],
  };

  it('mette le sezioni una dopo l altra senza buchi', () => {
    const [s1, s2] = buildSong(def).arrangements[0]!.sections;
    expect(s1!.startMs).toBe(0);
    expect(s2!.startMs).toBe(s1!.endMs);
  });

  it('arrotonda la fine di una sezione alla battuta: una sezione che finisce a meta battuta non si puo ripetere', () => {
    const battutaMs = 2000; // 4/4 a 120 bpm
    for (const section of buildSong(def).arrangements[0]!.sections) {
      expect(section.endMs % battutaMs).toBe(0);
    }
  });

  it('ordina le note per tempo di attacco', () => {
    const song = buildSong({
      ...def,
      arrangements: [{
        difficulty: 'easy',
        sections: [{ id: 's', kind: 'verse', name: 'V', right: 'DO5:4', left: 'DO3:2 MI3:2', loopRecommended: true }],
      }],
    });
    const starts = song.arrangements[0]!.notes.map((n) => n.startMs);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('rileva le mani effettivamente usate', () => {
    expect(buildSong(def).arrangements[0]!.hands).toEqual(['right']);
  });

  it('da a ogni arrangiamento la propria durata', () => {
    const song = buildSong({
      ...def,
      arrangements: [
        def.arrangements[0]!,
        { difficulty: 'easy', sections: [{ id: 'x', kind: 'verse', name: 'V', right: 'DO4:16', loopRecommended: true }] },
      ],
    });
    const [breve, lungo] = song.arrangements;
    expect(breve!.durationMs).not.toBe(lungo!.durationMs);
    expect(song.durationMs).toBe(Math.max(breve!.durationMs, lungo!.durationMs));
  });
});
