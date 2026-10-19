import { MusicXmlError, MUSICXML_TPQ, parseMusicXml } from './musicXml';
import { XmlError, XmlSecurityError } from './xml';
import { battuta, MINIMO, nota, partitura } from './__fixtures__/musicxml';
import { analyseDocument, buildImportedSong } from './toSong';
import { validateSong } from '../song/validate';

/** Un quarto in tick interni. */
const Q = MUSICXML_TPQ;

describe('documento minimo', () => {
  it('legge una parte, una battuta, una nota', () => {
    const doc = parseMusicXml(MINIMO);
    expect(doc.format).toBe('musicxml');
    expect(doc.parts).toHaveLength(1);
    expect(doc.parts[0]?.notes).toEqual([
      expect.objectContaining({ midi: 60, startTick: 0, durationTicks: Q * 4, measure: 1 }),
    ]);
  });

  it('conserva titolo e compositore quando ci sono', () => {
    const xml = partitura(
      [{ id: 'P1', name: 'Piano', battute: [battuta({ number: 1, divisions: 1, contenuto: nota({ duration: 1 }) })] }],
      { title: 'Studio in DO', composer: 'A. Autrice' },
    );
    const doc = parseMusicXml(xml);
    expect(doc.title).toBe('Studio in DO');
    expect(doc.composer).toBe('A. Autrice');
  });

  it('non inventa titolo e compositore quando mancano', () => {
    const doc = parseMusicXml(MINIMO);
    expect(doc.title).toBeNull();
    expect(doc.composer).toBeNull();
  });

  it('rifiuta la forma timewise invece di leggerla male', () => {
    expect(() => parseMusicXml('<score-timewise><measure/></score-timewise>'))
      .toThrow(/timewise/);
  });

  it('rifiuta un XML che non è MusicXML', () => {
    expect(() => parseMusicXml('<html><body/></html>')).toThrow(MusicXmlError);
  });
});

describe('altezze e durate', () => {
  it('converte passo, ottava e alterazione in nota MIDI', () => {
    const xml = partitura([{
      id: 'P1', name: 'Piano',
      battute: [battuta({
        number: 1, divisions: 2,
        contenuto:
          nota({ step: 'C', octave: 4, duration: 2 }) +      // DO4 = 60
          nota({ step: 'F', octave: 4, alter: 1, duration: 2 }) + // FA#4 = 66
          nota({ step: 'B', octave: 3, alter: -1, duration: 2 }) + // SIb3 = 58
          nota({ step: 'C', octave: 5, duration: 2 }),        // DO5 = 72
      })],
    }]);
    expect(parseMusicXml(xml).parts[0]?.notes.map((n) => n.midi)).toEqual([60, 66, 58, 72]);
  });

  it('converte le divisioni dichiarate dal file', () => {
    // divisions=3: una nota da 3 divisioni è una semiminima.
    const xml = partitura([{
      id: 'P1', name: 'Piano',
      battute: [battuta({ number: 1, divisions: 3, contenuto: nota({ duration: 3 }) + nota({ duration: 6 }) })],
    }]);
    const note = parseMusicXml(xml).parts[0]?.notes ?? [];
    expect(note.map((n) => n.durationTicks)).toEqual([Q, Q * 2]);
    expect(note.map((n) => n.startTick)).toEqual([0, Q]);
  });

  it('segue un cambio di divisioni a metà brano', () => {
    const xml = partitura([{
      id: 'P1', name: 'Piano',
      battute: [
        battuta({ number: 1, divisions: 1, contenuto: nota({ duration: 4 }) }),
        battuta({ number: 2, divisions: 8, contenuto: nota({ duration: 32 }) }),
      ],
    }]);
    const note = parseMusicXml(xml).parts[0]?.notes ?? [];
    // Entrambe durano quattro movimenti, pur essendo scritte diversamente.
    expect(note.map((n) => n.durationTicks)).toEqual([Q * 4, Q * 4]);
    expect(note[1]?.startTick).toBe(Q * 4);
  });

  it('le pause fanno avanzare il tempo senza diventare note', () => {
    const xml = partitura([{
      id: 'P1', name: 'Piano',
      battute: [battuta({
        number: 1, divisions: 1,
        contenuto: nota({ rest: true, duration: 2 }) + nota({ step: 'E', octave: 4, duration: 2 }),
      })],
    }]);
    const note = parseMusicXml(xml).parts[0]?.notes ?? [];
    expect(note).toHaveLength(1);
    expect(note[0]).toMatchObject({ midi: 64, startTick: Q * 2 });
  });

  it('mette le note di un accordo tutte sullo stesso attacco', () => {
    const xml = partitura([{
      id: 'P1', name: 'Piano',
      battute: [battuta({
        number: 1, divisions: 1,
        contenuto:
          nota({ step: 'C', octave: 4, duration: 4 }) +
          nota({ step: 'E', octave: 4, duration: 4, chord: true }) +
          nota({ step: 'G', octave: 4, duration: 4, chord: true }),
      })],
    }]);
    const note = parseMusicXml(xml).parts[0]?.notes ?? [];
    expect(note.map((n) => n.midi)).toEqual([60, 64, 67]);
    expect(note.every((n) => n.startTick === 0)).toBe(true);
  });

  it('unisce le note legate di valore in una nota sola', () => {
    // Una minima legata a una semiminima è un attacco solo da tre movimenti.
    const xml = partitura([{
      id: 'P1', name: 'Piano',
      battute: [battuta({
        number: 1, divisions: 1,
        contenuto:
          nota({ step: 'C', octave: 4, duration: 2, tie: 'start' }) +
          nota({ step: 'C', octave: 4, duration: 1, tie: 'stop' }) +
          nota({ step: 'D', octave: 4, duration: 1 }),
      })],
    }]);
    const note = parseMusicXml(xml).parts[0]?.notes ?? [];
    expect(note.map((n) => [n.midi, n.durationTicks])).toEqual([[60, Q * 3], [62, Q]]);
  });

  it('salta gli abbellimenti e lo dichiara', () => {
    const xml = partitura([{
      id: 'P1', name: 'Piano',
      battute: [battuta({
        number: 1, divisions: 1,
        contenuto: nota({ step: 'B', octave: 3, duration: 0, grace: true }) + nota({ duration: 4 }),
      })],
    }]);
    const doc = parseMusicXml(xml);
    expect(doc.parts[0]?.notes).toHaveLength(1);
    expect(doc.notices.some((n) => /abbellimenti/.test(n))).toBe(true);
  });
});

describe('due pentagrammi e mani', () => {
  const dueMani = partitura([{
    id: 'P1', name: 'Piano', program: 1,
    battute: [battuta({
      number: 1, divisions: 1, staves: 2, beats: 4,
      contenuto:
        nota({ step: 'G', octave: 4, duration: 2, staff: 1, voice: 1, finger: 5 }) +
        nota({ step: 'E', octave: 4, duration: 2, staff: 1, voice: 1, finger: 3 }) +
        '<backup><duration>4</duration></backup>' +
        nota({ step: 'C', octave: 3, duration: 4, staff: 2, voice: 2, finger: 1 }),
    })],
  }]);

  it('assegna la mano dal pentagramma', () => {
    const note = parseMusicXml(dueMani).parts[0]?.notes ?? [];
    expect(note.find((n) => n.midi === 67)?.hand).toBe('right');
    expect(note.find((n) => n.midi === 48)?.hand).toBe('left');
  });

  it('il backup riporta la seconda mano all inizio della battuta', () => {
    const note = parseMusicXml(dueMani).parts[0]?.notes ?? [];
    expect(note.find((n) => n.midi === 48)?.startTick).toBe(0);
    // divisions=1: una divisione è una semiminima, quindi la nota che
    // segue una minima cade a due movimenti, non a uno.
    expect(note.find((n) => n.midi === 64)?.startTick).toBe(Q * 2);
  });

  it('conserva le diteggiature originali', () => {
    const note = parseMusicXml(dueMani).parts[0]?.notes ?? [];
    expect(note.find((n) => n.midi === 67)?.finger).toBe(5);
    expect(note.find((n) => n.midi === 48)?.finger).toBe(1);
  });

  it('non attribuisce diteggiature a un file che non ne ha', () => {
    const doc = parseMusicXml(MINIMO);
    expect(doc.parts[0]?.notes.every((n) => n.finger === undefined)).toBe(true);
    expect(doc.notices.some((n) => /non contiene diteggiature/.test(n))).toBe(true);
  });

  it('non dichiara la mano quando il pentagramma è uno solo', () => {
    expect(parseMusicXml(MINIMO).parts[0]?.notes.every((n) => n.hand === undefined)).toBe(true);
  });

  it('il forward fa avanzare senza scrivere note', () => {
    const xml = partitura([{
      id: 'P1', name: 'Piano',
      battute: [battuta({
        number: 1, divisions: 1,
        contenuto: '<forward><duration>2</duration></forward>' + nota({ duration: 2 }),
      })],
    }]);
    expect(parseMusicXml(xml).parts[0]?.notes[0]?.startTick).toBe(Q * 2);
  });
});

describe('tonalità, metro e tempo', () => {
  it('legge la tonalità maggiore e minore', () => {
    const conTonalita = (fifths: number, mode: string) => partitura([{
      id: 'P1', name: 'Piano',
      battute: [battuta({ number: 1, divisions: 1, fifths, mode, contenuto: nota({ duration: 1 }) })],
    }]);
    expect(parseMusicXml(conTonalita(1, 'major')).keySignature).toBe('G');
    expect(parseMusicXml(conTonalita(-1, 'major')).keySignature).toBe('F');
    expect(parseMusicXml(conTonalita(0, 'minor')).keySignature).toBe('Am');
    expect(parseMusicXml(conTonalita(-2, 'minor')).keySignature).toBe('Gm');
  });

  it('legge l indicazione metrica', () => {
    const xml = partitura([{
      id: 'P1', name: 'Piano',
      battute: [battuta({ number: 1, divisions: 1, beats: 3, beatType: 4, contenuto: nota({ duration: 3 }) })],
    }]);
    expect(parseMusicXml(xml).timeSignatures[0]).toMatchObject({ numerator: 3, denominator: 4 });
  });

  it('legge il tempo e i suoi cambi', () => {
    const xml = partitura([{
      id: 'P1', name: 'Piano',
      battute: [
        battuta({ number: 1, divisions: 1, tempo: 120, contenuto: nota({ duration: 4 }) }),
        battuta({ number: 2, tempo: 60, contenuto: nota({ duration: 4 }) }),
      ],
    }]);
    const doc = parseMusicXml(xml);
    expect(doc.tempoMap).toEqual([
      { tick: 0, usPerQuarter: 500_000 },
      { tick: Q * 4, usPerQuarter: 1_000_000 },
    ]);
  });

  it('non duplica lo stesso tempo scritto su due parti', () => {
    const battute = [battuta({ number: 1, divisions: 1, tempo: 90, contenuto: nota({ duration: 4 }) })];
    const xml = partitura([
      { id: 'P1', name: 'Piano', battute },
      { id: 'P2', name: 'Piano 2', battute },
    ]);
    expect(parseMusicXml(xml).tempoMap).toHaveLength(1);
  });
});

describe('più parti', () => {
  const orchestrina = partitura([
    {
      id: 'P1', name: 'Piano', program: 1,
      battute: [battuta({ number: 1, divisions: 1, contenuto: nota({ step: 'C', octave: 4, duration: 4 }) })],
    },
    {
      id: 'P2', name: 'Violin', program: 41,
      battute: [battuta({ number: 1, divisions: 1, contenuto: nota({ step: 'A', octave: 4, duration: 4 }) })],
    },
    {
      id: 'P3', name: 'Drums', channel: 10,
      battute: [battuta({ number: 1, divisions: 1, contenuto: nota({ step: 'D', octave: 2, duration: 4 }) })],
    },
  ]);

  it('tiene le parti separate, con nome e strumento', () => {
    const doc = parseMusicXml(orchestrina);
    expect(doc.parts.map((p) => p.name)).toEqual(['Piano', 'Violin', 'Drums']);
    expect(doc.parts[0]?.program).toBe(0); // il MusicXML scrive 1, il MIDI 0
  });

  it('riconosce il pianoforte e la batteria', () => {
    const doc = parseMusicXml(orchestrina);
    expect(doc.parts[0]?.looksLikePiano).toBe(true);
    expect(doc.parts[1]?.looksLikePiano).toBe(false);
    expect(doc.parts[2]?.isDrums).toBe(true);
  });

  it('propone di importare solo il pianoforte', () => {
    const analisi = analyseDocument(parseMusicXml(orchestrina));
    expect(analisi.suggestedRoles).toEqual(['split', 'excluded', 'excluded']);
  });
});

describe('verso il brano', () => {
  it('produce un brano che supera la validazione del catalogo', () => {
    const xml = partitura([{
      id: 'P1', name: 'Piano', program: 1,
      battute: [
        battuta({
          number: 1, divisions: 1, staves: 2, beats: 4, fifths: 1,
          contenuto:
            nota({ step: 'G', octave: 4, duration: 2, staff: 1, finger: 5 }) +
            nota({ step: 'B', octave: 4, duration: 2, staff: 1, finger: 3 }) +
            '<backup><duration>4</duration></backup>' +
            nota({ step: 'G', octave: 2, duration: 4, staff: 2, voice: 2, finger: 5 }),
        }),
        battuta({
          number: 2,
          contenuto:
            nota({ step: 'D', octave: 5, duration: 4, staff: 1, finger: 5 }) +
            '<backup><duration>4</duration></backup>' +
            nota({ step: 'D', octave: 3, duration: 4, staff: 2, voice: 2, finger: 1 }),
        }),
      ],
    }], { title: 'Esercizio', composer: 'M. Prova' });

    const doc = parseMusicXml(xml);
    const analisi = analyseDocument(doc);
    const { song, report } = buildImportedSong(doc, {
      title: analisi.title ?? 'Senza titolo',
      roles: analisi.suggestedRoles,
      splitMidi: analisi.suggestedSplitMidi,
      quantizeDivision: 0,
    });

    expect(validateSong(song).errors).toEqual([]);
    expect(song.title).toBe('Esercizio');
    expect(song.artistName).toBe('M. Prova');
    expect(song.keySignature).toBe('G');
    expect(song.arrangements[0]?.hands.sort()).toEqual(['left', 'right']);
    // Le mani vengono dal file, non da una soglia di altezza.
    expect(report.splitMidiUsed).toBeNull();
    expect(report.fingeringsKept).toBe(5);
  });
});

describe('documenti ostili o rotti', () => {
  it('rifiuta un XML troncato', () => {
    expect(() => parseMusicXml(MINIMO.slice(0, MINIMO.length - 40))).toThrow(XmlError);
  });

  it('rifiuta un XML corrotto', () => {
    expect(() => parseMusicXml('<score-partwise><part></measure></score-partwise>')).toThrow(XmlError);
  });

  it('rifiuta un documento con entità esterne', () => {
    const attacco =
      '<!DOCTYPE score-partwise [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>' +
      '<score-partwise><part-list/><part id="P1">&xxe;</part></score-partwise>';
    expect(() => parseMusicXml(attacco)).toThrow(XmlSecurityError);
  });

  it('rifiuta un documento senza parti', () => {
    expect(() => parseMusicXml('<score-partwise><part-list/></score-partwise>'))
      .toThrow(/nessuna parte/);
  });

  it('rifiuta un documento con parti ma senza note', () => {
    const xml = partitura([{ id: 'P1', name: 'Piano', battute: [battuta({ number: 1, divisions: 1, contenuto: '' })] }]);
    expect(() => parseMusicXml(xml)).toThrow(/nessuna nota/);
  });

  it('rifiuta un documento enorme invece di provarci', () => {
    // Oltre il limite del lettore XML: il rifiuto arriva prima di
    // allocare un albero da milioni di nodi.
    const enorme = `<score-partwise>${'<x/>'.repeat(10)}${' '.repeat(25_000_000)}</score-partwise>`;
    expect(() => parseMusicXml(enorme)).toThrow(/troppo grande/);
  });
});

describe('ritornelli aperti davvero', () => {
  /** Due battute fra |: :|, con una nota riconoscibile per battuta. */
  const conRitornello = partitura([{
    id: 'P1', name: 'Piano',
    battute: [
      battuta({
        number: 1, divisions: 1, apreRitornello: true,
        contenuto: nota({ step: 'C', octave: 4, duration: 4 }),
      }),
      battuta({
        number: 2, chiudeRitornello: true,
        contenuto: nota({ step: 'D', octave: 4, duration: 4 }),
      }),
      battuta({ number: 3, contenuto: nota({ step: 'E', octave: 4, duration: 4 }) }),
    ],
  }]);

  it('suona due volte le battute dentro il ritornello', () => {
    const note = parseMusicXml(conRitornello).parts[0]?.notes ?? [];
    // DO RE DO RE MI, non DO RE MI.
    expect(note.map((n) => n.midi)).toEqual([60, 62, 60, 62, 64]);
  });

  it('colloca la ripetizione nel tempo giusto, non sopra la prima', () => {
    const note = parseMusicXml(conRitornello).parts[0]?.notes ?? [];
    expect(note.map((n) => n.startTick)).toEqual([0, Q * 4, Q * 8, Q * 12, Q * 16]);
  });

  it('conserva il numero di battuta originale anche nella ripetizione', () => {
    // La seconda esecuzione della battuta 1 resta la battuta 1.
    const note = parseMusicXml(conRitornello).parts[0]?.notes ?? [];
    expect(note.map((n) => n.measure)).toEqual([1, 2, 1, 2, 3]);
  });

  it('dichiara quante battute sono diventate', () => {
    expect(parseMusicXml(conRitornello).notices.some((n) => /3 battute scritte diventano 5/.test(n)))
      .toBe(true);
  });

  it('non dichiara più i ritornelli come persi', () => {
    const avvisi = parseMusicXml(conRitornello).notices.join(' ');
    expect(avvisi).not.toMatch(/ritornelli non vengono aperti/i);
  });

  it('apre prima e seconda volta', () => {
    // |: 1 [1ª 2 :| [2ª 3 ] 4
    const xml = partitura([{
      id: 'P1', name: 'Piano',
      battute: [
        battuta({ number: 1, divisions: 1, apreRitornello: true, contenuto: nota({ step: 'C', octave: 4, duration: 4 }) }),
        battuta({ number: 2, volta: [1], fineVolta: true, chiudeRitornello: true, contenuto: nota({ step: 'D', octave: 4, duration: 4 }) }),
        battuta({ number: 3, volta: [2], fineVolta: true, contenuto: nota({ step: 'E', octave: 4, duration: 4 }) }),
        battuta({ number: 4, contenuto: nota({ step: 'F', octave: 4, duration: 4 }) }),
      ],
    }]);
    const note = parseMusicXml(xml).parts[0]?.notes ?? [];
    // DO RE (1ª volta) · DO MI (2ª volta) · FA
    expect(note.map((n) => n.midi)).toEqual([60, 62, 60, 64, 65]);
  });

  it('rispetta un ritornello da tre esecuzioni', () => {
    const xml = partitura([{
      id: 'P1', name: 'Piano',
      battute: [
        battuta({
          number: 1, divisions: 1, apreRitornello: true, chiudeRitornello: true, volte: 3,
          contenuto: nota({ step: 'C', octave: 4, duration: 4 }),
        }),
      ],
    }]);
    expect(parseMusicXml(xml).parts[0]?.notes).toHaveLength(3);
  });

  it('tiene insieme le due mani quando si ripete', () => {
    // Le due mani devono ripetersi nello stesso punto, non sfasarsi.
    const xml = partitura([{
      id: 'P1', name: 'Piano',
      battute: [
        battuta({
          number: 1, divisions: 1, staves: 2, apreRitornello: true, chiudeRitornello: true,
          contenuto:
            nota({ step: 'G', octave: 4, duration: 4, staff: 1 }) +
            '<backup><duration>4</duration></backup>' +
            nota({ step: 'C', octave: 3, duration: 4, staff: 2, voice: 2 }),
        }),
      ],
    }]);
    const note = parseMusicXml(xml).parts[0]?.notes ?? [];
    expect(note).toHaveLength(4);
    const destra = note.filter((n) => n.hand === 'right').map((n) => n.startTick);
    const sinistra = note.filter((n) => n.hand === 'left').map((n) => n.startTick);
    expect(destra).toEqual(sinistra);
  });

  it('legge i segni anche se sono scritti su una parte sola', () => {
    const battuteConSegni = [
      battuta({ number: 1, divisions: 1, apreRitornello: true, chiudeRitornello: true, contenuto: nota({ step: 'C', octave: 4, duration: 4 }) }),
    ];
    const battuteNude = [
      battuta({ number: 1, divisions: 1, contenuto: nota({ step: 'G', octave: 2, duration: 4 }) }),
    ];
    const xml = partitura([
      { id: 'P1', name: 'Piano', battute: battuteConSegni },
      { id: 'P2', name: 'Piano basso', battute: battuteNude },
    ]);
    const doc = parseMusicXml(xml);
    // Entrambe le parti si ripetono, anche quella senza i segni.
    expect(doc.parts[0]?.notes).toHaveLength(2);
    expect(doc.parts[1]?.notes).toHaveLength(2);
  });

  it('dichiara da capo e dal segno invece di fingere di aprirli', () => {
    const xml = partitura([{
      id: 'P1', name: 'Piano',
      battute: [
        battuta({ number: 1, divisions: 1, contenuto: nota({ duration: 4 }) }),
        battuta({ number: 2, contenuto: '<direction><sound dacapo="yes"/></direction>' + nota({ duration: 4 }) }),
      ],
    }]);
    expect(parseMusicXml(xml).notices.some((n) => /Da capo, dal segno/.test(n))).toBe(true);
  });
});

describe('battute vuote', () => {
  it('non sfasa le due mani quando una parte salta una battuta', () => {
    // Alcuni file omettono le pause invece di scriverle. Senza
    // correttivo la parte vuota non avanzerebbe, e da lì in poi le due
    // mani suonerebbero una sopra l'altra.
    const xml = partitura([
      {
        id: 'P1', name: 'Piano destra',
        battute: [
          battuta({ number: 1, divisions: 1, beats: 4, contenuto: nota({ step: 'C', octave: 5, duration: 4 }) }),
          battuta({ number: 2, contenuto: nota({ step: 'D', octave: 5, duration: 4 }) }),
        ],
      },
      {
        id: 'P2', name: 'Piano sinistra',
        battute: [
          battuta({ number: 1, divisions: 1, beats: 4, contenuto: '' }),      // battuta vuota
          battuta({ number: 2, contenuto: nota({ step: 'C', octave: 3, duration: 4 }) }),
        ],
      },
    ]);
    const doc = parseMusicXml(xml);
    const destra = doc.parts[0]?.notes ?? [];
    const sinistra = doc.parts[1]?.notes ?? [];
    // Il DO grave sta nella seconda battuta, come il RE acuto.
    expect(sinistra[0]?.startTick).toBe(Q * 4);
    expect(destra[1]?.startTick).toBe(Q * 4);
  });

  it('usa l indicazione metrica dichiarata, non quattro quarti fissi', () => {
    const xml = partitura([
      {
        id: 'P1', name: 'Destra',
        battute: [
          battuta({ number: 1, divisions: 1, beats: 3, beatType: 4, contenuto: nota({ step: 'C', octave: 5, duration: 3 }) }),
          battuta({ number: 2, contenuto: nota({ step: 'D', octave: 5, duration: 3 }) }),
        ],
      },
      {
        id: 'P2', name: 'Sinistra',
        battute: [
          battuta({ number: 1, divisions: 1, beats: 3, beatType: 4, contenuto: '' }),
          battuta({ number: 2, contenuto: nota({ step: 'C', octave: 3, duration: 3 }) }),
        ],
      },
    ]);
    // Tre movimenti, non quattro.
    expect(parseMusicXml(xml).parts[1]?.notes[0]?.startTick).toBe(Q * 3);
  });
});
