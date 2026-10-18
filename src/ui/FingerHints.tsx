import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import type { KeyboardGeometry } from '../core/music/keyboard';
import type { Finger } from '../core/notation/fingering';
import type { Hand } from '../core/song/types';
import { handColor } from './theme';

/**
 * Il numero del dito, sul tasto da premere.
 *
 * Nient'altro: una mano disegnata sopra la tastiera copre i tasti e
 * distrae da quello che conta, cioè quale dito va dove. Il numero sta
 * sul tasto, nel colore della mano, e sparisce appena la nota è
 * passata.
 *
 * Non intercetta i tocchi: i tasti sotto restano premibili. Un
 * indicatore che rubasse il tocco al tasto che indica sarebbe il
 * peggiore dei difetti possibili qui.
 */

/** Quote verticali, in frazione dell'altezza della tastiera. */
const Y_WHITE = 0.72;  // sotto i tasti neri, dove il dito preme davvero
const Y_BLACK = 0.38;

export interface FingerHint {
  hand: Hand;
  midi: number;
  finger: Finger;
}

export interface FingerHintsProps {
  hints: readonly FingerHint[];
  geometry: KeyboardGeometry;
  width: number;
  height: number;
}

export const FingerHints = memo(function FingerHints({
  hints, geometry, width, height,
}: FingerHintsProps) {
  if (hints.length === 0) return null;

  // Il pallino segue la larghezza del tasto, entro limiti: più piccolo
  // non si legge, più grande copre il tasto accanto.
  const r = Math.max(9, Math.min(17, geometry.whiteWidth * width * 0.34));

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityLabel="Diteggiatura"
      accessibilityRole="image"
    >
      <Svg width={width} height={height}>
        {hints.map((hint) => {
          const box = geometry.box(hint.midi);
          if (!box) return null;
          const colore = handColor(hint.hand);
          const cx = box.center * width;
          const cy = height * (box.black ? Y_BLACK : Y_WHITE);

          return (
            <G key={`${hint.hand}-${hint.midi}`}>
              <Circle
                cx={cx} cy={cy} r={r}
                fill={colore}
                // L'anello bianco lo tiene leggibile sia sul tasto
                // bianco sia su quello nero, senza due stili diversi.
                stroke="#FFFFFF" strokeWidth={2}
              />
              <SvgText
                x={cx} y={cy + r * 0.37}
                fontSize={r * 1.2} fontWeight="700"
                fill="#FFFFFF" textAnchor="middle"
              >
                {hint.finger}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
});
