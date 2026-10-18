import { render, screen, fireEvent } from '@testing-library/react-native';
import { PianoKeyboard } from './PianoKeyboard';

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

  it('non mostra i nomi quando non servono più', () => {
    render(<PianoKeyboard fromMidi={60} toMidi={71} />);
    expect(screen.queryByText('DO')).toBeNull();
  });
});
