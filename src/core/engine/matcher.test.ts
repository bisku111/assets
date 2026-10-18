import type { SongNote } from '../song/types';
import { NoteMatcher } from './matcher';

const note = (midi: number, startMs: number, durationMs = 400): SongNote => ({
  midi, startMs, durationMs, hand: 'right',
});

// DO4 a 0 ms, RE4 a 1000 ms, MI4 a 2000 ms
const MELODIA = [note(60, 0), note(62, 1000), note(64, 2000)];

describe('confronto delle note', () => {
  it('riconosce una nota giusta suonata a tempo', () => {
    const matcher = new NoteMatcher(MELODIA, { toleranceMs: 200 });
    expect(matcher.noteOn(60, 0)).toMatchObject({ kind: 'correct', noteIndex: 0, deviationMs: 0 });
    expect(matcher.snapshot().correct).toBe(1);
  });

  it('accetta una nota entro la tolleranza e ne misura il ritardo', () => {
    const matcher = new NoteMatcher(MELODIA, { toleranceMs: 200 });
    const esito = matcher.noteOn(60, 150);
    expect(esito.kind).toBe('correct');
    expect((esito as { deviationMs: number }).deviationMs).toBe(150);
  });

  it('dice quale nota era prevista quando se ne suona un altra', () => {
    const matcher = new NoteMatcher(MELODIA, { toleranceMs: 200 });
    const esito = matcher.noteOn(62, 0); // suona RE dove era previsto DO
    expect(esito).toMatchObject({ kind: 'wrong', playedMidi: 62 });
    expect((esito as { expected: SongNote }).expected.midi).toBe(60);
  });

  it('lascia correggere l errore: la nota attesa non viene consumata da uno sbaglio', () => {
    const matcher = new NoteMatcher(MELODIA, { toleranceMs: 200 });
    matcher.noteOn(62, 0);
    expect(matcher.noteOn(60, 50).kind).toBe('correct');
  });

  it('chiama "nota di troppo" quella suonata dove non era atteso niente', () => {
    const matcher = new NoteMatcher(MELODIA, { toleranceMs: 200 });
    expect(matcher.noteOn(75, 500)).toMatchObject({ kind: 'extra', playedMidi: 75 });
    expect(matcher.snapshot().extra).toBe(1);
  });

  it('conta come mancata una nota il cui momento e passato', () => {
    const matcher = new NoteMatcher(MELODIA, { toleranceMs: 200 });
    expect(matcher.update(500)).toHaveLength(1);
    expect(matcher.snapshot().missed).toBe(1);
    // Una nota gia' persa non si conta due volte.
    expect(matcher.update(700)).toHaveLength(0);
    expect(matcher.snapshot().missed).toBe(1);
  });

  it('non consuma due volte la stessa nota attesa', () => {
    const matcher = new NoteMatcher(MELODIA, { toleranceMs: 200 });
    expect(matcher.noteOn(60, 0).kind).toBe('correct');
    // Ripremere lo stesso tasto non regala un'altra nota corretta.
    expect(matcher.noteOn(60, 60).kind).toBe('extra');
    expect(matcher.snapshot().correct).toBe(1);
  });

  it('riconosce un accordo: tre note attese nello stesso istante', () => {
    const matcher = new NoteMatcher([note(60, 0), note(64, 0), note(67, 0)], { toleranceMs: 200 });
    // Le dita non cadono mai perfettamente insieme.
    expect(matcher.noteOn(60, -12).kind).toBe('correct');
    expect(matcher.noteOn(64, 3).kind).toBe('correct');
    expect(matcher.noteOn(67, 20).kind).toBe('correct');
    expect(matcher.snapshot()).toMatchObject({ correct: 3, wrong: 0, extra: 0 });
  });

  it('segnala l errore nell accordo indicando la nota mancante', () => {
    const matcher = new NoteMatcher([note(60, 0), note(64, 0), note(67, 0)], { toleranceMs: 200 });
    matcher.noteOn(60, 0);
    matcher.noteOn(65, 0); // FA invece di MI
    matcher.noteOn(67, 0);
    matcher.update(1000);
    expect(matcher.snapshot()).toMatchObject({ correct: 2, wrong: 1, missed: 1 });
  });

  it('compensa la latenza dell ingresso invece di penalizzare chi suona giusto', () => {
    // Utente perfetto ma con 80 ms di latenza Bluetooth: senza
    // compensazione risulterebbe sempre in ritardo di 80 ms.
    const senza = new NoteMatcher(MELODIA, { toleranceMs: 200 });
    expect((senza.noteOn(60, 80) as { deviationMs: number }).deviationMs).toBe(80);

    const con = new NoteMatcher(MELODIA, { toleranceMs: 200, inputLatencyMs: 80 });
    expect((con.noteOn(60, 80) as { deviationMs: number }).deviationMs).toBe(0);
  });

  it('il pedale non falsa il giudizio: si valuta l attacco, non il rilascio', () => {
    // Note tenute lunghissime (pedale premuto) che si sovrappongono.
    const matcher = new NoteMatcher(
      [note(60, 0, 5000), note(62, 1000, 5000), note(64, 2000, 5000)],
      { toleranceMs: 200 },
    );
    matcher.noteOn(60, 0);
    matcher.noteOn(62, 1000);
    matcher.noteOn(64, 2000);
    matcher.update(3000);
    expect(matcher.snapshot()).toMatchObject({ correct: 3, wrong: 0, missed: 0, extra: 0 });
  });

  it('elenca le note ancora attese nella finestra visibile', () => {
    const matcher = new NoteMatcher(MELODIA, { toleranceMs: 200 });
    expect(matcher.pendingAt(0, 1200).map((s) => s.note.midi)).toEqual([60, 62]);
  });

  it('riparte da zero dopo reset, per ripetere la sezione', () => {
    const matcher = new NoteMatcher(MELODIA, { toleranceMs: 200 });
    matcher.noteOn(60, 0);
    matcher.update(5000);
    matcher.reset();
    expect(matcher.snapshot()).toMatchObject({ correct: 0, missed: 0 });
    expect(matcher.noteOn(60, 0).kind).toBe('correct');
  });

  it('resta veloce anche su un brano lungo: non riscorre le note gia passate', () => {
    const lungo = Array.from({ length: 5000 }, (_, i) => note(60 + (i % 12), i * 100));
    const matcher = new NoteMatcher(lungo, { toleranceMs: 100 });
    const inizio = Date.now();
    for (let i = 0; i < 5000; i++) {
      matcher.noteOn(60 + (i % 12), i * 100);
      matcher.update(i * 100);
    }
    expect(matcher.snapshot().correct).toBe(5000);
    expect(Date.now() - inizio).toBeLessThan(1000);
  });
});
