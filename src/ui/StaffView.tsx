import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { Clef, StaffItem, StaffScore } from '../core/notation/staff';
import { barLines, keySignaturePositions } from '../core/notation/staff';
import { handColor } from './theme';

/**
 * Il pentagramma che scorre.
 *
 * Scorre la musica, non la linea di esecuzione: il punto in cui si
 * suona resta fermo, così l'occhio non deve inseguirlo. È il
 * funzionamento di un rullo di pianola, ed è l'unico che regge quando
 * il brano si ferma ad aspettare una nota.
 *
 * Il foglio è chiaro dentro un'app scura di proposito: la musica
 * scritta si legge su carta, e l'inversione di contrasto rende le
 * teste di nota molto più nitide a questa dimensione.
 */

const GAP = 7;              // distanza fra due righe del rigo
const HALF = GAP / 2;       // un mezzo spazio: l'unità verticale di `u`
const STAFF_H = GAP * 4;
const PAD = 13;
const STAFF_GAP = 21;

/**
 * Si disegnano solo i righi che servono.
 *
 * Un brano per sola mano destra non ha niente da scrivere in chiave di
 * basso: tenere quel rigo vuoto costerebbe cinquanta pixel di altezza
 * a ogni schermata, che su un portatile sono quelli che mancano alla
 * tastiera.
 */
export function staffHeight(clefCount: number): number {
  const n = Math.max(1, clefCount);
  return PAD * 2 + n * STAFF_H + (n - 1) * STAFF_GAP;
}

function topsOf(clefs: readonly Clef[]): Record<Clef, number> {
  const tops = { treble: PAD, bass: PAD } as Record<Clef, number>;
  clefs.forEach((clef, i) => { tops[clef] = PAD + i * (STAFF_H + STAFF_GAP); });
  return tops;
}

const GUTTER = 34;          // colonna fissa delle chiavi
const INK = '#16161C';
const PAPER = '#F4F1E8';
const DONE = '#A9A69C';
const MISS = '#C2453B';

/** Ordinata di una posizione `u` (mezzi spazi sotto la riga superiore). */
function yAt(u: number, top: number): number {
  return top + u * HALF;
}

export type HeadStatus = 'pending' | 'hit' | 'missed' | 'waiting';

export interface StaffViewProps {
  score: StaffScore;
  positionMs: number;
  msPerBar: number;
  width: number;
  /** Stato delle note già giudicate, per indice nell'arrangiamento. */
  statuses: ReadonlyMap<number, 'hit' | 'missed'>;
  /** Nota che il brano sta aspettando: è quella da evidenziare. */
  waitingIndex: number | null;
  /** Quanti millisecondi di musica stanno nella larghezza disponibile. */
  windowMs: number;
  /** I righi da disegnare, dall'alto in basso. */
  clefs: readonly Clef[];
}

export const StaffView = memo(function StaffView({
  score, positionMs, msPerBar, width, statuses, waitingIndex, windowMs, clefs,
}: StaffViewProps) {
  const altezza = staffHeight(clefs.length);
  const tops = topsOf(clefs);
  const primo = tops[clefs[0] as Clef];
  const ultimo = tops[clefs[clefs.length - 1] as Clef] + STAFF_H;
  const pista = Math.max(40, width - GUTTER);
  const pxPerMs = pista / windowMs;
  // La linea di esecuzione sta a un terzo: davanti serve più spazio di
  // dietro, perché le note si leggono prima di suonarle.
  const playheadX = GUTTER + pista * 0.3;
  const daMs = positionMs - (playheadX - GUTTER) / pxPerMs;
  const aMs = positionMs + (width - playheadX) / pxPerMs;

  const xOf = (ms: number) => playheadX + (ms - positionMs) * pxPerMs;

  const battute = useMemo(() => barLines(daMs, aMs, msPerBar), [daMs, aMs, msPerBar]);
  const visibili = useMemo(
    () => score.items.filter((item) => item.startMs >= daMs && item.startMs <= aMs),
    [score, daMs, aMs],
  );

  return (
    <View
      style={[styles.foglio, { height: altezza }]}
      accessibilityLabel="Pentagramma"
      accessibilityRole="image"
    >
      <Svg width={width} height={altezza}>
        <Rect x={0} y={0} width={width} height={altezza} fill={PAPER} />

        {/* Righi: cinque righe per chiave, più la stanghetta che le unisce. */}
        {clefs.map((clef) =>
          [0, 2, 4, 6, 8].map((u) => (
            <Line
              key={`${clef}-${u}`}
              x1={0} x2={width} y1={yAt(u, tops[clef])} y2={yAt(u, tops[clef])}
              stroke={INK} strokeWidth={0.7} opacity={0.5}
            />
          )),
        )}
        <Line
          x1={0.5} x2={0.5} y1={primo} y2={ultimo}
          stroke={INK} strokeWidth={1.4} opacity={0.6}
        />

        {/* Stanghette di battuta: danno il senso del metro. */}
        {battute.map((ms) => (
          <Line
            key={ms}
            x1={xOf(ms)} x2={xOf(ms)} y1={primo} y2={ultimo}
            stroke={INK} strokeWidth={0.8} opacity={0.22}
          />
        ))}

        {visibili.map((item) => (
          <Gruppo
            key={`${item.startMs}-${item.hand}`}
            item={item}
            x={xOf(item.startMs)}
            top={tops[item.clef]}
            statuses={statuses}
            waitingIndex={waitingIndex}
          />
        ))}

        {/* La colonna delle chiavi copre la musica che le passa sotto:
            senza, le note scorrerebbero sopra i simboli di chiave. */}
        <Rect x={0} y={0} width={GUTTER} height={altezza} fill={PAPER} />
        <Line x1={GUTTER} x2={GUTTER} y1={0} y2={altezza} stroke={INK} strokeWidth={0.6} opacity={0.18} />
        {clefs.map((clef) => <Chiave key={clef} clef={clef} top={tops[clef]} />)}
        <Armatura score={score} clefs={clefs} tops={tops} />

        {/* Linea di esecuzione. */}
        <Line
          x1={playheadX} x2={playheadX} y1={4} y2={altezza - 4}
          stroke="#2F6BFF" strokeWidth={1.8} opacity={0.9}
        />
      </Svg>
    </View>
  );
});

// ---------------------------------------------------------------------
// Un attacco: una nota sola o un accordo
// ---------------------------------------------------------------------

interface GruppoProps {
  item: StaffItem;
  x: number;
  top: number;
  statuses: ReadonlyMap<number, 'hit' | 'missed'>;
  waitingIndex: number | null;
}

function Gruppo({ item, x, top, statuses, waitingIndex }: GruppoProps) {
  const { heads, head, dotted, stem } = item;
  const pieno = head !== 'whole' && head !== 'half';
  const rx = 4.4;
  const ry = 3.2;

  const us = heads.map((h) => h.u);
  const uAlto = Math.min(...us);
  const uBasso = Math.max(...us);
  const stemLen = 6.5 * HALF;
  const stemX = stem === 'up' ? x + rx - 0.5 : x - rx + 0.5;
  const stemY1 = stem === 'up' ? yAt(uBasso, top) : yAt(uAlto, top);
  const stemY2 = stem === 'up' ? yAt(uAlto, top) - stemLen : yAt(uBasso, top) + stemLen;

  return (
    <G>
      {heads.map((testa) => {
        const y = yAt(testa.u, top);
        const stato: HeadStatus =
          testa.noteIndex === waitingIndex ? 'waiting' : statuses.get(testa.noteIndex) ?? 'pending';
        const colore =
          stato === 'waiting' ? handColor(item.hand)
          : stato === 'missed' ? MISS
          : stato === 'hit' ? DONE
          : INK;
        const cx = x + (testa.shifted ? rx * 2 - 1 : 0);

        return (
          <G key={testa.noteIndex}>
            {/* Tagli addizionali: un po' più larghi della testa. */}
            {testa.ledger.map((u) => (
              <Line
                key={u}
                x1={cx - rx - 2.6} x2={cx + rx + 2.6}
                y1={yAt(u, top)} y2={yAt(u, top)}
                stroke={INK} strokeWidth={0.8} opacity={0.65}
              />
            ))}

            {/* Alone della nota attesa: dice "questa, adesso". */}
            {stato === 'waiting' ? (
              <Circle cx={cx} cy={y} r={8} fill={colore} opacity={0.22} />
            ) : null}

            {testa.accidental ? (
              <SvgText
                x={cx - rx - 4} y={y + 3.4}
                fontSize={10.5} fill={colore} textAnchor="end"
                opacity={stato === 'hit' ? 0.6 : 1}
              >
                {testa.accidental === '#' ? '♯' : testa.accidental === 'b' ? '♭' : '♮'}
              </SvgText>
            ) : null}

            <Ellipse
              cx={cx} cy={y} rx={rx} ry={ry}
              // Le teste sono inclinate: è così che le disegna una penna,
              // ed è così che si distinguono a colpo d'occhio dai pallini.
              transform={`rotate(-22 ${cx} ${y})`}
              fill={pieno ? colore : PAPER}
              stroke={colore}
              strokeWidth={pieno ? 0.8 : 1.5}
            />

            {dotted ? <Circle cx={cx + rx + 3.4} cy={y - HALF} r={1.3} fill={colore} /> : null}
          </G>
        );
      })}

      {head !== 'whole' ? (
        <Line x1={stemX} x2={stemX} y1={stemY1} y2={stemY2} stroke={INK} strokeWidth={1.1} />
      ) : null}

      {head === 'eighth' || head === 'sixteenth' ? (
        <Coda x={stemX} y={stemY2} verso={stem} doppia={head === 'sixteenth'} />
      ) : null}
    </G>
  );
}

/** La codetta della croma: una virgola appesa alla punta del gambo. */
function Coda({ x, y, verso, doppia }: { x: number; y: number; verso: 'up' | 'down'; doppia: boolean }) {
  const giu = verso === 'up' ? 1 : -1;
  const d = (offset: number) =>
    `M ${x} ${y + offset * giu} C ${x + 5} ${y + (3 + offset) * giu} ${x + 5.5} ${y + (7 + offset) * giu} ${x + 2.5} ${y + (10 + offset) * giu}`;
  return (
    <G>
      <Path d={d(0)} stroke={INK} strokeWidth={1.3} fill="none" />
      {doppia ? <Path d={d(4)} stroke={INK} strokeWidth={1.3} fill="none" /> : null}
    </G>
  );
}

// ---------------------------------------------------------------------
// Chiavi e armatura
// ---------------------------------------------------------------------

/**
 * Le chiavi sono disegnate, non prese da un font musicale: un glifo
 * come U+1D11E non esiste in tutti i font di sistema, e una chiave
 * mancante lascerebbe un quadratino al posto dell'informazione che dice
 * quale rigo è quale.
 */
function Chiave({ clef, top }: { clef: Clef; top: number }) {
  if (clef === 'treble') {
    // Il riccio si avvolge sulla riga del SOL (u = 6).
    const sol = yAt(6, top);
    return (
      <G>
        <Path
          d={`M 20.5 ${top - 7}
              C 13.5 ${top + 2} 12.4 ${top + 11} 17.4 ${top + 17}
              C 21.6 ${top + 22} 24.2 ${top + 26} 23.4 ${top + 31}
              C 22.8 ${top + 35} 18.6 ${top + 36} 17.4 ${top + 32}
              M 20.5 ${top - 7}
              C 24.2 ${top - 2} 24.4 ${top + 6} 20.0 ${top + 11}
              C 15.6 ${top + 16} 11.5 ${top + 18} 11.5 ${top + 23}
              C 11.5 ${top + 27} 15.2 ${top + 29} 18.4 ${top + 27}
              C 21.4 ${top + 25} 21.6 ${top + 20} 18.0 ${top + 19}`}
          stroke={INK} strokeWidth={1.7} fill="none" strokeLinecap="round"
        />
        <Circle cx={18.0} cy={sol} r={1.6} fill={INK} />
      </G>
    );
  }
  // Chiave di basso: il ricciolo parte dalla riga del FA (u = 2) e i
  // due punti la stringono sopra e sotto.
  const fa = yAt(2, top);
  return (
    <G>
      <Path
        d={`M 12.5 ${fa - 4.5}
            C 18.5 ${fa - 7} 23.5 ${fa - 3} 23.5 ${fa + 3}
            C 23.5 ${fa + 10} 17.5 ${fa + 15} 11.5 ${fa + 18}`}
        stroke={INK} strokeWidth={2.1} fill="none" strokeLinecap="round"
      />
      <Circle cx={12.5} cy={fa - 4.5} r={2.2} fill={INK} />
      <Circle cx={26.5} cy={fa - HALF} r={1.3} fill={INK} />
      <Circle cx={26.5} cy={fa + HALF} r={1.3} fill={INK} />
    </G>
  );
}

function Armatura({
  score, clefs, tops,
}: { score: StaffScore; clefs: readonly Clef[]; tops: Record<Clef, number> }) {
  const { kind, count } = score.key;
  if (count === 0) return null;

  return (
    <G>
      {clefs.map((clef) =>
        keySignaturePositions(score.key, clef).map((u, i) => (
          <SvgText
            key={`${clef}-${u}`}
            x={GUTTER - 10 + i * 6} y={yAt(u, tops[clef]) + 3.4}
            fontSize={10.5} fill={INK} textAnchor="middle"
          >
            {kind === 'sharp' ? '♯' : '♭'}
          </SvgText>
        )),
      )}
    </G>
  );
}

const styles = StyleSheet.create({
  foglio: { width: '100%', overflow: 'hidden', backgroundColor: PAPER },
});
