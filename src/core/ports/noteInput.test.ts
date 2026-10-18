import { inputStatusMessageIt } from './noteInput';

/**
 * I messaggi di stato sono l'unica cosa che l'utente legge quando il
 * collegamento non funziona: valgono quanto il codice che li produce.
 */
describe('messaggi sullo stato dell ingresso', () => {
  it('non mostra mai cause tecniche all utente', () => {
    const tecnici = [
      inputStatusMessageIt({ state: 'unavailable', reason: 'native-module-missing', detail: 'x' }, 'midi'),
      inputStatusMessageIt({ state: 'unavailable', reason: 'platform-unsupported', detail: 'x' }, 'microphone'),
      inputStatusMessageIt({ state: 'error', detail: 'TypeError: undefined is not a function' }, 'midi'),
    ];
    for (const messaggio of tecnici) {
      expect(messaggio).not.toMatch(/native-module|platform-unsupported|TypeError|undefined/);
    }
  });

  it('propone sempre un alternativa quando qualcosa non funziona', () => {
    const problemi = [
      inputStatusMessageIt({ state: 'denied', reason: 'no' }, 'midi'),
      inputStatusMessageIt({ state: 'denied', reason: 'no' }, 'microphone'),
      inputStatusMessageIt({ state: 'unavailable', reason: 'native-module-missing', detail: '' }, 'midi'),
      inputStatusMessageIt({ state: 'unavailable', reason: 'platform-unsupported', detail: '' }, 'midi'),
      inputStatusMessageIt({ state: 'error', detail: '' }, 'microphone'),
    ];
    for (const messaggio of problemi) {
      expect(messaggio.toLowerCase()).toContain('tastiera a schermo');
    }
  });

  it('dice cosa fare quando manca lo strumento', () => {
    expect(inputStatusMessageIt({ state: 'unavailable', reason: 'no-device', detail: '' }, 'midi'))
      .toMatch(/USB|Bluetooth/);
  });

  it('scrive MIDI come acronimo anche a meta frase', () => {
    // toLowerCase() sull'intera etichetta produrrebbe "la tastiera midi".
    for (const stato of [
      { state: 'denied', reason: 'no' } as const,
      { state: 'starting' } as const,
      { state: 'error', detail: '' } as const,
    ]) {
      expect(inputStatusMessageIt(stato, 'midi')).not.toContain('midi');
    }
  });

  it('nomina lo strumento riconosciuto quando e collegato', () => {
    expect(inputStatusMessageIt({ state: 'ready', deviceName: 'Yamaha P-125' }, 'midi'))
      .toContain('Yamaha P-125');
  });
});
