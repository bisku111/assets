import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { isBlackKey, noteNameIt, whiteKeyIndex } from '../core/music/note';
import type { Hand } from '../core/song/types';
import { colors, handColor, radius } from './theme';
import { Text } from './components/Text';

/**
 * Tastiera di pianoforte.
 *
 * Il layout non è decorativo: i tasti neri devono stare nelle posizioni
 * vere rispetto ai bianchi, altrimenti quello che l'allievo impara qui
 * non si trasferisce allo strumento. Sono quindi posizionati in
 * percentuale sulla griglia dei tasti bianchi, non distribuiti a caso.
 *
 * I tasti neri sono disegnati DOPO i bianchi e con zIndex superiore: su
 * Android l'ordine di dichiarazione vince sull'elevazione, quindi senza
 * questo accorgimento i neri finirebbero sotto e non sarebbero premibili.
 */

export interface PianoKeyboardProps {
  /** Estensione mostrata, estremi compresi. */
  fromMidi: number;
  toMidi: number;
  /** Tasti premuti dall'utente. */
  pressed?: readonly number[];
  /** Tasti che il brano sta chiedendo adesso, con la mano di appartenenza. */
  expected?: ReadonlyMap<number, Hand>;
  /** Tasti appena sbagliati: lampeggiano in rosso. */
  wrong?: readonly number[];
  onPressKey?: (midi: number) => void;
  onReleaseKey?: (midi: number) => void;
  /** Mostra DO RE MI sui tasti bianchi: utile ai principianti. */
  showNoteNames?: boolean;
  height?: number;
}

export function PianoKeyboard({
  fromMidi, toMidi, pressed = [], expected, wrong = [],
  onPressKey, onReleaseKey, showNoteNames = false, height = 160,
}: PianoKeyboardProps) {
  const { whites, blacks } = useMemo(() => layout(fromMidi, toMidi), [fromMidi, toMidi]);

  const pressedSet = useMemo(() => new Set(pressed), [pressed]);
  const wrongSet = useMemo(() => new Set(wrong), [wrong]);
  const whiteWidthPct = 100 / Math.max(1, whites.length);

  return (
    <View style={[styles.keyboard, { height }]}>
      {/* Tasti bianchi */}
      {whites.map((midi, index) => (
        <Key
          key={midi}
          midi={midi}
          black={false}
          style={{
            left: `${index * whiteWidthPct}%`,
            width: `${whiteWidthPct}%`,
            height: '100%',
          }}
          pressed={pressedSet.has(midi)}
          expectedHand={expected?.get(midi)}
          wrong={wrongSet.has(midi)}
          label={showNoteNames ? noteNameIt(midi, false) : undefined}
          onPressKey={onPressKey}
          onReleaseKey={onReleaseKey}
        />
      ))}

      {/* Tasti neri: sopra i bianchi, a cavallo fra due di essi. */}
      {blacks.map(({ midi, afterWhiteIndex }) => (
        <Key
          key={midi}
          midi={midi}
          black
          style={{
            left: `${(afterWhiteIndex + 1) * whiteWidthPct - whiteWidthPct * 0.32}%`,
            width: `${whiteWidthPct * 0.64}%`,
            height: '62%',
          }}
          pressed={pressedSet.has(midi)}
          expectedHand={expected?.get(midi)}
          wrong={wrongSet.has(midi)}
          onPressKey={onPressKey}
          onReleaseKey={onReleaseKey}
        />
      ))}
    </View>
  );
}

interface KeyProps {
  midi: number;
  black: boolean;
  style: { left: `${number}%`; width: `${number}%`; height: `${number}%` | '100%' };
  pressed: boolean;
  expectedHand?: Hand | undefined;
  wrong: boolean;
  label?: string | undefined;
  onPressKey?: ((midi: number) => void) | undefined;
  onReleaseKey?: ((midi: number) => void) | undefined;
}

function Key({
  midi, black, style, pressed, expectedHand, wrong, label, onPressKey, onReleaseKey,
}: KeyProps) {
  const base = black ? colors.keyBlack : colors.keyWhite;
  const premuto = black ? colors.keyBlackPressed : colors.keyWhitePressed;

  const background = wrong ? colors.error : pressed ? premuto : base;

  return (
    <Pressable
      // onPressIn/onPressOut e non onPress: una nota comincia quando il
      // dito tocca, non quando lo si solleva. Con onPress il timing
      // misurato sarebbe quello del rilascio, cioe' sbagliato.
      onPressIn={() => onPressKey?.(midi)}
      onPressOut={() => onReleaseKey?.(midi)}
      accessibilityRole="button"
      accessibilityLabel={noteNameIt(midi)}
      accessibilityState={{ selected: pressed }}
      style={[
        styles.key,
        black ? styles.blackKey : styles.whiteKey,
        { ...style, backgroundColor: background, zIndex: black ? 2 : 1 },
      ]}
    >
      {/* Barra della mano attesa: è l'indicazione "suona questo, adesso". */}
      {expectedHand ? (
        <View style={[styles.expectedBar, { backgroundColor: handColor(expectedHand) }]} />
      ) : null}

      {label ? (
        <Text
          variant="caption"
          style={[styles.keyLabel, { color: pressed ? colors.surface : colors.textFaint }]}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Calcola quali tasti disegnare e dove mettere i neri. */
export function layout(fromMidi: number, toMidi: number) {
  // Si parte sempre da un tasto bianco: iniziare da un nero lascerebbe
  // un tasto sospeso nel vuoto, senza il bianco su cui appoggiarsi.
  let start = fromMidi;
  while (start > 0 && isBlackKey(start)) start -= 1;
  let end = toMidi;
  while (end < 127 && isBlackKey(end)) end += 1;

  const whites: number[] = [];
  const blacks: Array<{ midi: number; afterWhiteIndex: number }> = [];

  for (let midi = start; midi <= end; midi++) {
    if (isBlackKey(midi)) {
      // L'indice del bianco immediatamente precedente.
      blacks.push({ midi, afterWhiteIndex: whiteKeyIndex(midi - 1) - whiteKeyIndex(start) });
    } else {
      whites.push(midi);
    }
  }

  return { whites, blacks, start, end };
}

const styles = StyleSheet.create({
  keyboard: {
    width: '100%',
    position: 'relative',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  key: {
    position: 'absolute',
    top: 0,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 6,
  },
  whiteKey: {
    borderRightWidth: 1,
    borderColor: '#B9B9C6',
    borderBottomLeftRadius: radius.sm,
    borderBottomRightRadius: radius.sm,
  },
  blackKey: {
    borderBottomLeftRadius: radius.sm,
    borderBottomRightRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#000',
  },
  expectedBar: {
    position: 'absolute',
    bottom: 0,
    left: '12%',
    right: '12%',
    height: 6,
    borderRadius: 3,
  },
  keyLabel: { fontSize: 10 },
});
