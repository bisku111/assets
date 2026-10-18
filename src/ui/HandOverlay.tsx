import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { Finger, FingerPose, HandPose } from '../core/notation/handPose';
import { noteNameIt } from '../core/music/note';
import { handColor } from './theme';

/**
 * Le mani sopra la tastiera.
 *
 * Servono a rispondere a una domanda sola: con quale dito si preme
 * questo tasto. Per questo il polpastrello del dito richiesto sta
 * esattamente sul centro del tasto (lo garantisce handPose) e porta il
 * suo numero scritto sopra: senza il numero sarebbe una decorazione.
 *
 * La sagoma si disegna in due passate — prima tutti i contorni scuri,
 * poi tutti i riempimenti chiari — così palmo e dita si fondono in una
 * figura sola. Disegnando un dito alla volta, completo di contorno, si
 * otterrebbero cinque pillole separate invece di una mano.
 *
 * Non intercettano i tocchi: i tasti sotto restano premibili. Una mano
 * disegnata che rubasse il tocco al tasto che indica sarebbe il
 * peggiore dei difetti possibili qui.
 */

/** Quote verticali, in frazione dell'altezza della tastiera. */
const TIP_WHITE = 0.50;   // i tasti bianchi si premono sotto i neri
const TIP_BLACK = 0.18;   // sul nero il dito si allunga indietro
const PALM_TOP = 0.84;
const PALM_BOTTOM = 1.3;  // il polso esce dall'inquadratura, come nelle mani vere

/**
 * Quanto ogni dito resta indietro rispetto al medio, in frazione
 * dell'altezza. Vale solo per le dita libere: quelle che devono
 * premere un tasto arrivano sul tasto, punto.
 */
const ACCORCIAMENTO: Record<Finger, number> = { 1: 0.13, 2: 0.025, 3: 0, 4: 0.035, 5: 0.12 };

/**
 * La mano ha un tono suo, non quello dei tasti: dipingerla del colore
 * del tasto bianco la ridurrebbe a un contorno vuoto, che a schermo
 * largo non si legge più come una mano.
 */
const SKIN = '#E7E2F0';
const EDGE = '#343442';
const SHADOW = 'rgba(16,16,26,0.28)';

export interface HandOverlayProps {
  left: HandPose | null;
  right: HandPose | null;
  width: number;
  height: number;
  /** Larghezza di un tasto bianco in px: dà la scala delle dita. */
  whiteKeyWidth: number;
}

export const HandOverlay = memo(function HandOverlay({
  left, right, width, height, whiteKeyWidth,
}: HandOverlayProps) {
  if (!left && !right) return null;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityLabel="Posizione delle mani"
      accessibilityRole="image"
    >
      <Svg width={width} height={height}>
        {left ? <Mano pose={left} width={width} height={height} w={whiteKeyWidth} /> : null}
        {right ? <Mano pose={right} width={width} height={height} w={whiteKeyWidth} /> : null}
      </Svg>
    </View>
  );
});

interface Segmento {
  dito: FingerPose;
  x1: number; y1: number;
  x2: number; y2: number;
  spessore: number;
}

function Mano({
  pose, width, height, w,
}: { pose: HandPose; width: number; height: number; w: number }) {
  // Lo spessore segue sia la larghezza del tasto sia l'altezza della
  // tastiera: su uno schermo largo e basso, dita larghe quanto un tasto
  // darebbero una mano schiacciata invece che una mano.
  const spessore = Math.max(8, Math.min(w * 0.62, height * 0.15));
  const palmTop = height * PALM_TOP;
  const palmBottom = height * PALM_BOTTOM;
  const colore = handColor(pose.hand);

  const xs = pose.fingers.map((f) => f.x * width);
  const sinistra = Math.min(...xs) - spessore * 0.6;
  const destra = Math.max(...xs) + spessore * 0.6;
  const centro = (sinistra + destra) / 2;
  // Il pollice non parte dalle nocche ma dal lato interno del palmo:
  // è la differenza fra una mano e un rastrello a cinque punte.
  const latoInterno = pose.hand === 'right' ? sinistra + spessore * 0.4 : destra - spessore * 0.4;

  const segmenti: Segmento[] = pose.fingers.map((dito) => {
    const tipX = dito.x * width;
    // Un dito che deve premere arriva sul tasto; gli altri si fermano
    // alla loro lunghezza naturale.
    const arretramento = dito.active ? 0 : ACCORCIAMENTO[dito.finger] * height;
    const tipY = height * (dito.black ? TIP_BLACK : TIP_WHITE) + arretramento;

    if (dito.finger === 1) {
      return { dito, x1: latoInterno, y1: palmTop + spessore * 1.2, x2: tipX, y2: tipY, spessore: spessore * 1.1 };
    }
    // Le dita si aprono a ventaglio dal palmo: le basi stanno più
    // vicine fra loro di quanto non lo siano i polpastrelli.
    return { dito, x1: tipX + (centro - tipX) * 0.35, y1: palmTop + spessore * 0.2, x2: tipX, y2: tipY, spessore };
  });

  const attivi = segmenti.filter((s) => s.dito.active);

  // Il palmo si stringe verso il polso: un rettangolo darebbe un
  // guanto, non una mano.
  const rientro = (destra - sinistra) * 0.13;
  const r = spessore * 0.8;
  const palmo =
    `M ${sinistra} ${palmTop + r}` +
    ` Q ${sinistra} ${palmTop} ${sinistra + r} ${palmTop}` +
    ` L ${destra - r} ${palmTop}` +
    ` Q ${destra} ${palmTop} ${destra} ${palmTop + r}` +
    ` L ${destra - rientro} ${palmBottom}` +
    ` L ${sinistra + rientro} ${palmBottom} Z`;

  return (
    <G>
      {/* La sagoma è traslucida: sotto ci sono i tasti e i loro nomi,
          e coprirli del tutto toglierebbe più di quanto si aggiunge. */}
      <G opacity={0.88}>
        {/* Passata 0: ombra, che stacca la mano dai tasti */}
        <G transform="translate(0,4)">
          <Path d={palmo} fill={SHADOW} />
          {segmenti.map((s) => (
            <Line
              key={`o${s.dito.finger}`}
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke={SHADOW} strokeWidth={s.spessore + 4} strokeLinecap="round"
            />
          ))}
        </G>

        {/* Passata 1: contorni */}
        <Path d={palmo} fill={EDGE} stroke={EDGE} strokeWidth={3} strokeLinejoin="round" />
        {segmenti.map((s) => (
          <Line
            key={`c${s.dito.finger}`}
            x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke={EDGE} strokeWidth={s.spessore + 3} strokeLinecap="round"
          />
        ))}

        {/* Passata 2: riempimenti, che si fondono fra loro */}
        <Path d={palmo} fill={SKIN} />
        {segmenti.map((s) => (
          <Line
            key={`r${s.dito.finger}`}
            x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke={SKIN} strokeWidth={s.spessore} strokeLinecap="round"
          />
        ))}

        {/* Passata 3: il dito che deve suonare si accende */}
        {attivi.map((s) => (
          <Line
            key={`a${s.dito.finger}`}
            x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke={colore} strokeWidth={s.spessore} strokeLinecap="round"
          />
        ))}
      </G>

      {/* I numeri stanno fuori dalla trasparenza: sono l'informazione,
          il resto della mano è solo il contesto. */}
      {attivi.map((s) => (
        <Etichetta key={`e${s.dito.finger}`} segmento={s} colore={colore} spessore={spessore} />
      ))}
    </G>
  );
}

function Etichetta({
  segmento, colore, spessore,
}: { segmento: Segmento; colore: string; spessore: number }) {
  const { x2: x, y2: y, dito } = segmento;
  const r = Math.max(8, spessore * 0.66);
  const nome = dito.midi === null ? null : noteNameIt(dito.midi, false);
  const larghezzaNome = Math.max(18, r * 2.1);

  return (
    <G>
      <Circle cx={x} cy={y} r={r} fill={colore} stroke="#FFFFFF" strokeWidth={1.8} />
      <SvgText
        x={x} y={y + r * 0.37}
        fontSize={r * 1.15} fontWeight="700" fill="#FFFFFF" textAnchor="middle"
      >
        {dito.finger}
      </SvgText>

      {nome ? (
        <G>
          <Rect
            x={x - larghezzaNome / 2} y={y + r + 2}
            width={larghezzaNome} height={r * 1.25}
            rx={r * 0.35} fill="#FFFFFF" stroke={colore} strokeWidth={1.2}
          />
          <SvgText
            x={x} y={y + r + 2 + r * 0.93}
            fontSize={r * 0.82} fontWeight="700" fill={colore} textAnchor="middle"
          >
            {nome}
          </SvgText>
        </G>
      ) : null}
    </G>
  );
}
