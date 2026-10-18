import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ExpectedNoteState } from '../core/engine/matcher';
import { isBlackKey, whiteKeyIndex } from '../core/music/note';
import { colors, handColor, radius } from './theme';
import { layout } from './PianoKeyboard';

/**
 * Le note che scendono verso la tastiera.
 *
 * Posizionamento: l'asse X è allineato ESATTAMENTE alla tastiera
 * sottostante (stessa funzione `layout`), altrimenti una nota cadrebbe
 * accanto al tasto da premere e l'aiuto visivo diventerebbe un intralcio.
 *
 * L'asse Y è il tempo: `lookAheadMs` di brano occupano tutta l'altezza.
 * Una nota attesa fra 2 secondi, con finestra di 3, sta a due terzi
 * dall'alto. Si ridisegna solo cio' che è nella finestra, quindi il
 * costo non dipende dalla lunghezza del brano.
 */

export interface NoteHighwayProps {
  notes: readonly ExpectedNoteState[];
  positionMs: number;
  lookAheadMs: number;
  fromMidi: number;
  toMidi: number;
  height: number;
}

export const NoteHighway = memo(function NoteHighway({
  notes, positionMs, lookAheadMs, fromMidi, toMidi, height,
}: NoteHighwayProps) {
  const { whites, start } = useMemo(() => layout(fromMidi, toMidi), [fromMidi, toMidi]);
  const whiteWidthPct = 100 / Math.max(1, whites.length);

  return (
    <View style={[styles.highway, { height }]} pointerEvents="none">
      {/* Linea di esecuzione: il punto in cui la nota va suonata. */}
      <View style={styles.hitLine} />

      {notes.map((state) => {
        const { note } = state;
        const delta = note.startMs - positionMs;
        // Fuori finestra: non si disegna. È cio' che tiene il costo
        // proporzionale alle note visibili e non a quelle del brano.
        if (delta > lookAheadMs || note.startMs + note.durationMs < positionMs - 300) return null;

        const topPct = 1 - delta / lookAheadMs;        // 1 = sulla linea
        const durationPct = note.durationMs / lookAheadMs;

        const nero = isBlackKey(note.midi);
        const whiteIndex = whiteKeyIndex(nero ? note.midi - 1 : note.midi) - whiteKeyIndex(start);
        const leftPct = nero
          ? (whiteIndex + 1) * whiteWidthPct - whiteWidthPct * 0.32
          : whiteIndex * whiteWidthPct;
        const widthPct = nero ? whiteWidthPct * 0.64 : whiteWidthPct;

        const colore =
          state.status === 'hit' ? colors.success
          : state.status === 'missed' ? colors.error
          : handColor(note.hand);

        return (
          <View
            key={state.index}
            style={[
              styles.note,
              {
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                // L'altezza rappresenta la durata: una nota lunga si vede
                // lunga, ed è così che si impara a tenerla.
                height: Math.max(10, durationPct * height),
                top: topPct * height - Math.max(10, durationPct * height),
                backgroundColor: colore,
                opacity: state.status === 'pending' ? 1 : 0.45,
              },
            ]}
          >
            {note.finger ? <FingerDot finger={note.finger} /> : null}
          </View>
        );
      })}
    </View>
  );
});

function FingerDot({ finger }: { finger: number }) {
  return (
    <View style={styles.fingerDot}>
      <View style={[styles.fingerPip, { opacity: 0.25 + finger * 0.15 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  highway: {
    width: '100%',
    position: 'relative',
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  },
  hitLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.primary,
    opacity: 0.8,
  },
  note: {
    position: 'absolute',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 3,
  },
  fingerDot: { alignItems: 'center', justifyContent: 'center' },
  fingerPip: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#0B0B10' },
});
