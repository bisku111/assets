import { recognizeTriad, triadLabelIt } from './chord';
import { parseNoteName } from './note';

/** "DO4 MI4 SOL4" -> numeri MIDI. Rende leggibili le attese musicali. */
const note = (testo: string): number[] =>
  testo.split(/\s+/).map((n) => {
    const midi = parseNoteName(n);
    if (midi === null) throw new Error(`nome di nota non valido nel test: ${n}`);
    return midi;
  });

const riconosci = (testo: string) => recognizeTriad(note(testo));
const nome = (testo: string) => {
  const t = riconosci(testo);
  return t ? triadLabelIt(t) : null;
};

describe('triadi in posizione fondamentale', () => {
  it('riconosce la maggiore', () => {
    expect(nome('DO4 MI4 SOL4')).toBe('DO mag');
  });

  it('riconosce la minore', () => {
    expect(nome('LA3 DO4 MI4')).toBe('LA min');
  });

  it('riconosce la diminuita', () => {
    // SI RE FA: terza minore più terza minore.
    expect(nome('SI3 RE4 FA4')).toBe('SI dim');
  });

  it('riconosce l aumentata', () => {
    expect(nome('DO4 MI4 SOL#4')).toBe('DO aum');
  });
});

describe('rivolti: la fondamentale esce dalla struttura, non dal basso', () => {
  it('primo rivolto di DO maggiore resta DO', () => {
    expect(nome('MI4 SOL4 DO5')).toBe('DO mag');
  });

  it('secondo rivolto di DO maggiore resta DO', () => {
    expect(nome('SOL4 DO5 MI5')).toBe('DO mag');
  });

  it('primo rivolto di LA minore resta LA', () => {
    expect(nome('DO4 MI4 LA4')).toBe('LA min');
  });

  it('secondo rivolto di LA minore resta LA', () => {
    expect(nome('MI4 LA4 DO5')).toBe('LA min');
  });

  it('DO MIb LA e LA diminuita, non DO qualcosa', () => {
    // LA-DO-MIb e la triade diminuita su LA: qui si presenta col DO
    // al basso, ma la struttura 0-3-6 si misura da LA.
    expect(nome('DO4 RE#4 LA4')).toBe('LA dim');
  });
});

describe('alterazioni', () => {
  it('legge una maggiore sui diesis', () => {
    expect(nome('FA#4 LA#4 DO#5')).toBe('FA# mag');
  });

  it('legge una maggiore scritta coi bemolli', () => {
    // MIb SOL SIb: il riconoscitore ragiona per classi di altezza,
    // quindi la scrittura enarmonica non lo disturba. Il nome esce
    // coi diesis perche' e' la convenzione gia' in uso a schermo.
    expect(nome('MIb4 SOL4 SIb4')).toBe('RE# mag');
  });

  it('una nota scritta in due modi resta lo stesso accordo', () => {
    expect(riconosci('LA#3 RE4 FA4')).toEqual(riconosci('SIb3 RE4 FA4'));
  });
});

describe('raddoppi di ottava', () => {
  it('ignora il raddoppio della fondamentale', () => {
    expect(nome('FA#3 LA#3 DO#4 FA#4')).toBe('FA# mag');
  });

  it('ignora i raddoppi multipli', () => {
    expect(nome('DO3 SOL3 DO4 MI4 SOL4 DO5')).toBe('DO mag');
  });

  it('due classi di altezza raddoppiate restano due', () => {
    expect(riconosci('DO3 DO4 SOL4 SOL5')).toBeNull();
  });
});

describe('casi da non etichettare', () => {
  it('una nota sola', () => {
    expect(riconosci('DO4')).toBeNull();
  });

  it('nessuna nota', () => {
    expect(recognizeTriad([])).toBeNull();
  });

  it('due sole classi di altezza', () => {
    expect(riconosci('DO4 MI4')).toBeNull();
  });

  it('quattro classi di altezza: una settima non e una triade', () => {
    expect(riconosci('DO4 MI4 SOL4 SI4')).toBeNull();
  });

  it('un grappolo di semitoni', () => {
    expect(riconosci('DO4 DO#4 RE4')).toBeNull();
  });

  it('tre note che non formano nessuna struttura prevista', () => {
    // DO-RE-MI: seconda piu' seconda, nessuna terza su cui appoggiare.
    expect(riconosci('DO4 RE4 MI4')).toBeNull();
  });

  it('una quarta piu una seconda non diventa un accordo', () => {
    expect(riconosci('DO4 FA4 SI4')).toBeNull();
  });
});

describe('casi ambigui: si sceglie il basso, sempre allo stesso modo', () => {
  it('l aumentata prende il nome dalla nota piu grave', () => {
    // 0-4-8 divide l'ottava in parti uguali: le tre letture sono
    // indistinguibili, quindi decide il basso.
    expect(nome('DO4 MI4 SOL#4')).toBe('DO aum');
    expect(nome('MI4 SOL#4 DO5')).toBe('MI aum');
    expect(nome('SOL#3 DO4 MI4')).toBe('SOL# aum');
  });

  it('sus2 e sus4 sono lo stesso insieme letto da note diverse', () => {
    expect(nome('DO4 RE4 SOL4')).toBe('DO sus2');
    expect(nome('SOL3 DO4 RE4')).toBe('SOL sus4');
  });

  it('la stessa disposizione da sempre lo stesso nome', () => {
    expect(nome('DO4 RE4 SOL4')).toBe(nome('DO4 RE4 SOL4'));
  });
});

describe('le quattro strutture terziarie non si confondono fra loro', () => {
  it('ogni qualita si distingue dalle altre sulla stessa fondamentale', () => {
    expect(nome('DO4 MI4 SOL4')).toBe('DO mag');
    expect(nome('DO4 RE#4 SOL4')).toBe('DO min');
    expect(nome('DO4 RE#4 FA#4')).toBe('DO dim');
    expect(nome('DO4 MI4 SOL#4')).toBe('DO aum');
  });

  it('una triade terziaria non viene mai letta come sospesa', () => {
    for (const accordo of ['DO4 MI4 SOL4', 'DO4 RE#4 SOL4', 'DO4 RE#4 FA#4']) {
      expect(riconosci(accordo)?.quality).not.toMatch(/^sus/);
    }
  });

  it('riconosce la maggiore su tutte e dodici le fondamentali', () => {
    for (let root = 0; root < 12; root++) {
      expect(recognizeTriad([60 + root, 64 + root, 67 + root]))
        .toEqual({ root, quality: 'mag' });
    }
  });
});
