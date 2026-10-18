/**
 * Riferimento del battito per la calibrazione.
 *
 * È una porta perché ogni piattaforma può offrire un riferimento
 * diverso, e la differenza va dichiarata invece che nascosta: un click
 * udibile è un riferimento migliore di un lampo sullo schermo, e un
 * impulso tattile sta nel mezzo. La schermata dice all'utente quale sta
 * usando, perché cambia quanto è facile stare a tempo.
 */
export type MetronomeKind = 'audio' | 'haptic' | 'visual';

export interface MetronomePort {
  /** Che tipo di riferimento offre questa piattaforma. */
  readonly kind: MetronomeKind;
  /** Un battito. `strong` marca il primo della battuta. */
  tick(strong: boolean): void;
  dispose(): void;
}

export function metronomeHintIt(kind: MetronomeKind): string {
  switch (kind) {
    case 'audio':
      return 'Alza un po il volume: senti un click a ogni battito.';
    case 'haptic':
      return 'Senti una vibrazione a ogni battito, e vedi il cerchio pulsare.';
    case 'visual':
      return "Segui il cerchio che pulsa: su questo dispositivo non c'è un click.";
  }
}
