import { ManualClock } from '../ports/clock';
import { Transport } from './transport';

const make = (options: Partial<ConstructorParameters<typeof Transport>[0]> = {}) => {
  const clock = new ManualClock(1000);
  return { clock, transport: new Transport({ durationMs: 10_000, clock, ...options }) };
};

describe('trasporto', () => {
  it('parte fermo a zero', () => {
    const { transport } = make();
    expect(transport.positionMs).toBe(0);
    expect(transport.state).toBe('idle');
  });

  it('avanza in tempo reale durante la riproduzione', () => {
    const { clock, transport } = make();
    transport.play();
    clock.advance(2500);
    expect(transport.positionMs).toBe(2500);
  });

  it('avanza a meta velocita quando si rallenta al 50%', () => {
    const { clock, transport } = make({ rate: 0.5 });
    transport.play();
    clock.advance(2000);
    expect(transport.positionMs).toBe(1000);
  });

  it('non accumula deriva: mille letture danno lo stesso risultato di una', () => {
    const { clock, transport } = make({ durationMs: 3_600_000 });
    transport.play();
    // Dieci minuti letti a 60 fps: è il caso in cui un contatore
    // incrementale sbaglierebbe di decine di millisecondi.
    for (let i = 0; i < 36_000; i++) {
      clock.advance(16.6667);
      void transport.positionMs; // la lettura è il punto: innesca il ricalcolo
    }
    expect(transport.positionMs).toBeCloseTo(600_001.2, 0);
  });

  it('congela la posizione in pausa e riprende da li', () => {
    const { clock, transport } = make();
    transport.play();
    clock.advance(3000);
    transport.pause();
    clock.advance(50_000); // l'utente è andato a prendere un caffe'
    expect(transport.positionMs).toBe(3000);
    transport.play();
    clock.advance(1000);
    expect(transport.positionMs).toBe(4000);
  });

  it('cambia velocita senza far saltare la posizione', () => {
    const { clock, transport } = make();
    transport.play();
    clock.advance(4000);
    transport.setRate(0.5);
    expect(transport.positionMs).toBe(4000); // nessun salto nell'istante del cambio
    clock.advance(1000);
    expect(transport.positionMs).toBe(4500);
  });

  it('finisce il brano e si ferma alla durata', () => {
    const { clock, transport } = make();
    transport.play();
    clock.advance(99_999);
    expect(transport.positionMs).toBe(10_000);
    expect(transport.state).toBe('ended');
  });

  it('riparte da capo alla fine del loop, contando i giri', () => {
    const { clock, transport } = make({ loop: { startMs: 2000, endMs: 4000 } });
    transport.seek(2000);
    transport.play();
    clock.advance(1500);
    expect(transport.positionMs).toBe(3500);
    clock.advance(1000); // supera la fine del loop di 500 ms
    expect(transport.positionMs).toBe(2500);
    expect(transport.loopCount).toBe(1);
  });

  it('gestisce un salto che supera piu volte il loop', () => {
    const { clock, transport } = make({ loop: { startMs: 0, endMs: 1000 } });
    transport.play();
    clock.advance(3250);
    expect(transport.positionMs).toBe(250);
    // 0→1000, 1000→2000, 2000→3000 sono tre giri completi; poi 250 ms del quarto.
    expect(transport.loopCount).toBe(3);
  });

  it('usa una posizione negativa per il conto alla rovescia', () => {
    const { clock, transport } = make({ countInMs: 2000 });
    expect(transport.positionMs).toBe(-2000);
    transport.play();
    clock.advance(500);
    expect(transport.positionMs).toBe(-1500);
    clock.advance(1500);
    expect(transport.positionMs).toBe(0);
  });

  it('non permette di uscire dall intervallo con seek', () => {
    const { transport } = make();
    transport.seek(99_999);
    expect(transport.positionMs).toBe(10_000);
    transport.seek(-99_999);
    expect(transport.positionMs).toBe(0);
  });

  it('limita la velocita all intervallo utile', () => {
    const { transport } = make();
    transport.setRate(5);
    expect(transport.rate).toBe(1);
    transport.setRate(0.01);
    expect(transport.rate).toBe(0.25);
  });

  it('colloca un evento passato nel punto giusto del brano', () => {
    const { clock, transport } = make();
    transport.play();
    clock.advance(5000);
    // Tasto premuto 200 ms fa: corrisponde a 4800 ms di brano.
    expect(transport.positionAt(clock.now() - 200)).toBe(4800);
  });
});
