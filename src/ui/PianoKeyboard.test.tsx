import { render, screen, fireEvent } from '@testing-library/react-native';
import { PianoKeyboard, layout } from './PianoKeyboard';

describe('layout della tastiera', () => {
  it('parte sempre da un tasto bianco, anche se si chiede di partire da un nero', () => {
    // Un nero senza il bianco su cui appoggiarsi resterebbe sospeso.
    expect(layout(61, 72).start).toBe(60);
  });

  it('un ottava contiene sette bianchi e cinque neri', () => {
    const { whites, blacks } = layout(60, 71);
    expect(whites).toHaveLength(7);
    expect(blacks).toHaveLength(5);
  });

  it('mette ogni nero subito dopo il bianco giusto', () => {
    const { blacks } = layout(60, 71);
    // DO#=61 dopo il primo bianco (DO), RE#=63 dopo il secondo (RE),
    // FA#=66 dopo il quarto (FA), e cosi' via: e' il layout vero.
    expect(blacks.map((b) => [b.midi, b.afterWhiteIndex])).toEqual([
      [61, 0], [63, 1], [66, 3], [68, 4], [70, 5],
    ]);
  });

  it('estende la fine fino a comprendere il bianco successivo', () => {
    expect(layout(60, 61).end).toBe(62);
  });
});

describe('tastiera a schermo', () => {
  it('mostra un tasto per ogni nota dell estensione', () => {
    render(<PianoKeyboard fromMidi={60} toMidi={71} />);
    expect(screen.getByLabelText('DO4')).toBeTruthy();
    expect(screen.getByLabelText('DO#4')).toBeTruthy();
    expect(screen.getByLabelText('SI4')).toBeTruthy();
  });

  it('avvisa alla pressione e al rilascio, non al tocco completo', () => {
    // Una nota comincia quando il dito tocca: con onPress il timing
    // misurato sarebbe quello del rilascio, cioe' sbagliato.
    const onPressKey = jest.fn();
    const onReleaseKey = jest.fn();
    render(<PianoKeyboard fromMidi={60} toMidi={71} onPressKey={onPressKey} onReleaseKey={onReleaseKey} />);

    fireEvent(screen.getByLabelText('MI4'), 'pressIn');
    expect(onPressKey).toHaveBeenCalledWith(64);
    fireEvent(screen.getByLabelText('MI4'), 'pressOut');
    expect(onReleaseKey).toHaveBeenCalledWith(64);
  });

  it('segnala i tasti premuti agli strumenti di accessibilita', () => {
    render(<PianoKeyboard fromMidi={60} toMidi={71} pressed={[62]} />);
    expect(screen.getByLabelText('RE4').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByLabelText('MI4').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('mostra i nomi italiani quando richiesto dai principianti', () => {
    render(<PianoKeyboard fromMidi={60} toMidi={71} showNoteNames />);
    expect(screen.getByText('DO')).toBeTruthy();
    expect(screen.getByText('SOL')).toBeTruthy();
  });

  it('non mostra i nomi quando non servono piu', () => {
    render(<PianoKeyboard fromMidi={60} toMidi={71} />);
    expect(screen.queryByText('DO')).toBeNull();
  });
});
