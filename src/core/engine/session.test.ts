import { ManualClock } from '../ports/clock';
import type { PlayedNoteEvent } from '../ports/noteInput';
import { buildSong, type SongDef } from '../song/builder';
import { PracticeSession, type PracticeSessionOptions } from './session';

const DEF: SongDef = {
  id: 'test', slug: 'test', title: 'Test', artistId: 'a', artistName: 'A',
  coverColors: ['#000', '#fff'],
  bpm: 60, // un movimento = 1000 ms: i conti nei test restano leggibili
  keySignature: 'C', isFree: true,
  license: { status: 'original', owner: 'M', type: 'p', territory: 'WW', startDate: null, endDate: null },
  arrangements: [{
    difficulty: 'easy',
    sections: [
      { id: 'intro', kind: 'intro', name: 'Intro', right: 'DO4 RE4 MI4 FA4', left: 'DO3:4', loopRecommended: true },
      { id: 'chorus', kind: 'chorus', name: 'Ritornello', right: 'SOL4 LA4 SI4 DO5', left: 'SOL2:4' },
    ],
  }],
};

const ARRANGEMENT = buildSong(DEF).arrangements[0]!;

const evento = (midi: number, timestamp: number): PlayedNoteEvent => ({
  type: 'note-on', midi, velocity: 0.8, timestamp, confidence: 1, source: 'midi',
});

const sessione = (over: Partial<PracticeSessionOptions> = {}) => {
  const clock = new ManualClock(0);
  const session = new PracticeSession({
    arrangement: ARRANGEMENT, clock, mode: 'practice', ratePct: 100,
    sectionId: 'intro', hands: ['right'], ...over,
  });
  return { clock, session };
};

describe('sessione di studio', () => {
  it('carica solo le note della sezione e delle mani scelte', () => {
    const { session } = sessione({ sectionId: 'chorus' });
    expect(session.notes.map((n) => n.midi)).toEqual([67, 69, 71, 72]);
  });

  it('parte dall inizio della sezione scelta, non dall inizio del brano', () => {
    const { session } = sessione({ sectionId: 'chorus' });
    expect(session.transport.positionMs).toBe(4000);
  });

  it('valuta le note usando l istante in cui il tasto e stato premuto', () => {
    const { clock, session } = sessione();
    session.start();
    clock.advance(1000);
    expect(session.handleInput(evento(62, 1000))).toMatchObject({ kind: 'correct', deviationMs: 0 });
  });

  it('non addebita all utente il ritardo con cui l evento arriva al motore', () => {
    const { clock, session } = sessione();
    session.start();
    // Tasto premuto a 1000; il thread JS era occupato e l'evento viene
    // consegnato a 1180. Con il timestamp giusto lo scarto resta zero.
    clock.advance(1180);
    const esito = session.handleInput(evento(62, 1000));
    expect((esito as { deviationMs: number }).deviationMs).toBe(0);
  });

  it('rallentare al 50% raddoppia il tempo a disposizione per ogni nota', () => {
    const { clock, session } = sessione({ ratePct: 50 });
    session.start();
    clock.advance(2000); // due secondi reali
    expect(session.transport.positionMs).toBe(1000); // un secondo di brano
    expect(session.handleInput(evento(62, 2000))!.kind).toBe('correct');
  });

  it('in modalita IMPARA aspetta la nota giusta invece di lasciare indietro', () => {
    const { clock, session } = sessione({ mode: 'learn' });
    session.start();

    // Prima nota (DO4 a 0 ms): il brano si ferma ad aspettarla.
    let frame = session.tick();
    expect(frame.waitingFor?.midi).toBe(60);
    expect(frame.state).toBe('paused');

    // L'utente ci mette dieci secondi: non deve costargli nulla.
    clock.advance(10_000);
    frame = session.tick();
    expect(frame.positionMs).toBe(0);

    expect(session.handleInput(evento(60, clock.now()))).toMatchObject({ kind: 'correct', deviationMs: 0 });
    expect(session.tick().state).toBe('playing');

    // Le note successive, suonate con tutta calma, restano tutte giuste.
    for (const midi of [62, 64, 65]) {
      clock.advance(5000);
      expect(session.tick().waitingFor?.midi).toBe(midi);
      expect(session.handleInput(evento(midi, clock.now()))).toMatchObject({ kind: 'correct' });
    }

    const risultato = session.finish();
    expect(risultato.breakdown.notesMissed).toBe(0);
    expect(risultato.breakdown.score).toBe(100);
  });

  it('in modalita ESERCITATI le note non suonate diventano errori', () => {
    const { clock, session } = sessione();
    session.start();
    // Tolleranza in ESERCITATI: 220 ms. A 700 ms la prima nota (attesa a
    // 0) è persa, la seconda (a 1000) è ancora giocabile.
    clock.advance(700);
    const frame = session.tick();
    expect(frame.notesJustMissed).toHaveLength(1);
    expect(frame.live.missed).toBe(1);
  });

  it('conta le note giuste di fila e azzera la serie allo sbaglio', () => {
    const { clock, session } = sessione();
    session.start();
    session.handleInput(evento(60, 0));
    clock.advance(1000);
    session.handleInput(evento(62, 1000));
    expect(session.tick().live.streak).toBe(2);

    clock.advance(1000);
    session.handleInput(evento(65, 2000)); // FA invece di MI
    expect(session.tick().live.streak).toBe(0);
  });

  it('separa la precisione delle due mani, cosi il maestro puo isolarne una', () => {
    const { clock, session } = sessione({ hands: ['right', 'left'] });
    session.start();
    // Destra tutta giusta, sinistra mai suonata.
    session.handleInput(evento(60, 0));
    clock.advance(1000); session.handleInput(evento(62, 1000));
    clock.advance(1000); session.handleInput(evento(64, 2000));
    clock.advance(1000); session.handleInput(evento(65, 3000));

    const risultato = session.finish();
    expect(risultato.handStats.right).toEqual({ expected: 4, correct: 4 });
    expect(risultato.handStats.left).toEqual({ expected: 1, correct: 0 });
  });

  it('interrompere a meta non regala un punteggio pieno', () => {
    const { session } = sessione();
    session.start();
    session.handleInput(evento(60, 0)); // una nota giusta, poi si abbandona

    const risultato = session.finish();
    expect(risultato.breakdown.notesMissed).toBe(3);
    expect(risultato.breakdown.accuracyPct).toBe(25);
    expect(risultato.breakdown.score).toBe(25);
  });

  it('ripete la sezione in loop quando richiesto', () => {
    const { clock, session } = sessione({ loopSection: true });
    session.start();
    clock.advance(4500);
    expect(session.transport.positionMs).toBe(500);
    expect(session.transport.loopCount).toBe(1);
  });

  it('restart azzera il punteggio e riparte dall inizio della sezione', () => {
    const { session } = sessione({ sectionId: 'chorus' });
    session.start();
    session.handleInput(evento(67, 4000));
    session.restart();
    expect(session.tick().live).toMatchObject({ correct: 0, missed: 0 });
    expect(session.transport.positionMs).toBe(4000);
  });

  it('mostra solo le note nella finestra visibile', () => {
    const { session } = sessione({ sectionId: null });
    session.start();
    expect(session.visibleNotes(2000).map((s) => s.note.midi)).toEqual([60, 62, 64]);
  });

  it('riconosce in quale sezione ci si trova quando si suona tutto il brano', () => {
    const { clock, session } = sessione({ sectionId: null });
    session.start();
    expect(session.tick().currentSection?.id).toBe('intro');
    clock.advance(5000);
    expect(session.tick().currentSection?.id).toBe('chorus');
  });
});
