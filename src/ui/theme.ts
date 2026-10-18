/**
 * Sistema di design.
 *
 * Impostazione: scuro, tipografia grande, pochissimi elementi. Sullo
 * schermo di un telefono appoggiato al leggio, mentre si suona, contano
 * due cose: leggere le note da lontano e non essere distratti. Ogni
 * decorazione in più è rumore, e con il pianoforte illuminato dal
 * basso un fondo chiaro abbaglia.
 *
 * I colori delle mani non sono decorativi: destra e sinistra hanno due
 * tinte stabili in tutta l'app (tastiera, note in arrivo, statistiche),
 * così l'associazione si impara una volta sola. Sono scelte
 * distinguibili anche da chi confonde rosso e verde.
 */

export const colors = {
  // Fondali
  background: '#0B0B10',
  surface: '#141420',
  surfaceRaised: '#1C1C2B',
  surfaceSunken: '#08080D',
  border: '#26263A',

  // Testo
  text: '#F5F5FA',
  textMuted: '#9A9AB4',
  textFaint: '#5E5E78',

  // Identita'
  primary: '#8E5BFF',
  primaryDim: '#5B3FA8',
  accent: '#2EC4B6',

  // Mani
  rightHand: '#4CC2FF',
  leftHand: '#FFB03A',

  // Esiti
  success: '#3DDC97',
  warning: '#FFC857',
  error: '#FF5C7A',

  // Tastiera
  keyWhite: '#F2F2F7',
  keyWhitePressed: '#C9BFFF',
  keyBlack: '#1A1A24',
  keyBlackPressed: '#6E4FD8',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;

export const typography = {
  display: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.8 },
  title: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.4 },
  heading: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.2 },
  caption: { fontSize: 12, fontWeight: '400' as const },
  /** Cifre grandi: punteggio, BPM, minuti. */
  metric: { fontSize: 40, fontWeight: '800' as const, letterSpacing: -1.5 },
} as const;

export function handColor(hand: 'left' | 'right'): string {
  return hand === 'right' ? colors.rightHand : colors.leftHand;
}

/**
 * Le stesse due mani, ma scritte sulla carta chiara dello spartito.
 *
 * L'azzurro e l'ambra sono nati per il fondo scuro: sul foglio color
 * avorio sparirebbero. Qui servono due inchiostri, non due luci.
 */
export function handInk(hand: 'left' | 'right'): string {
  return hand === 'right' ? '#0B5E92' : '#8A4F04';
}

export function scoreColor(score: number): string {
  if (score >= 85) return colors.success;
  if (score >= 60) return colors.warning;
  return colors.error;
}
