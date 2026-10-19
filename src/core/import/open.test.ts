import { detectFormat, openImportFile, UnsupportedFileError } from './open';
import { buildMxl } from './__fixtures__/mxl';
import { MINIMO } from './__fixtures__/musicxml';
import { nomeTraccia, smf, traccia } from './__fixtures__/smf';

const MIDI = smf([traccia([{ midi: 60, da: 0, durata: 480 }], nomeTraccia('Piano'))]);
const XML = new Uint8Array([...MINIMO].map((c) => c.charCodeAt(0)));
const MXL = buildMxl(MINIMO);

describe('riconoscimento del formato', () => {
  it('riconosce i formati dai byte, non dall estensione', () => {
    // Un file rinominato a mano è un caso normale, non un attacco.
    expect(detectFormat(MIDI, 'brano.txt')).toBe('midi');
    expect(detectFormat(MXL, 'brano.zip')).toBe('mxl');
    expect(detectFormat(XML, 'brano.dat')).toBe('musicxml');
  });

  it('usa l estensione solo quando i byte non dicono niente', () => {
    const ignoto = new Uint8Array([0, 1, 2, 3]);
    expect(detectFormat(ignoto, 'brano.mid')).toBe('midi');
    expect(detectFormat(ignoto, 'brano.musicxml')).toBe('musicxml');
    expect(detectFormat(ignoto, 'brano.bin')).toBeNull();
  });

  it('riconosce un XML preceduto da spazi o dal marcatore di byte', () => {
    const conBom = new Uint8Array([0xef, 0xbb, 0xbf, 0x20, 0x3c, 0x61, 0x2f, 0x3e]);
    expect(detectFormat(conBom)).toBe('musicxml');
  });
});

describe('apertura', () => {
  it('apre un MIDI', () => {
    const aperto = openImportFile(MIDI, 'brano.mid');
    expect(aperto.format).toBe('midi');
    expect(aperto.document.format).toBe('midi');
    expect(aperto.document.parts[0]?.notes).toHaveLength(1);
  });

  it('apre un MusicXML', () => {
    const aperto = openImportFile(XML, 'brano.musicxml');
    expect(aperto.format).toBe('musicxml');
    expect(aperto.document.parts[0]?.notes[0]?.midi).toBe(60);
  });

  it('apre un .mxl e unisce gli avvisi dell archivio', () => {
    const aperto = openImportFile(MXL, 'brano.mxl');
    expect(aperto.format).toBe('mxl');
    expect(aperto.document.format).toBe('musicxml');
    expect(aperto.document.parts[0]?.notes[0]?.midi).toBe(60);
  });

  it('MIDI e MusicXML finiscono nello stesso modello', () => {
    // È il punto dell'architettura: da qui in poi il codice è uno solo.
    const daMidi = openImportFile(MIDI, 'a.mid').document;
    const daXml = openImportFile(XML, 'a.musicxml').document;
    expect(Object.keys(daMidi).sort()).toEqual(Object.keys(daXml).sort());
    expect(daMidi.parts[0]?.notes[0]?.midi).toBe(daXml.parts[0]?.notes[0]?.midi);
  });
});

describe('formati non supportati', () => {
  it('dice con precisione perché un MP3 non va bene', () => {
    const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0]);
    expect(() => openImportFile(mp3, 'canzone.mp3')).toThrow(/file audio \(MP3\)/);
  });

  it('riconosce anche WAV, OGG e FLAC', () => {
    expect(() => openImportFile(new Uint8Array([0x52, 0x49, 0x46, 0x46]), 'a.wav')).toThrow(/WAV/);
    expect(() => openImportFile(new Uint8Array([0x4f, 0x67, 0x67, 0x53]), 'a.ogg')).toThrow(/OGG/);
    expect(() => openImportFile(new Uint8Array([0x66, 0x4c, 0x61, 0x43]), 'a.flac')).toThrow(/FLAC/);
  });

  it('riconosce un video dall estensione anche senza firma nota', () => {
    expect(() => openImportFile(new Uint8Array([9, 9, 9, 9]), 'video.mp4')).toThrow(/file audio/);
  });

  it('dice cosa sa leggere davanti a un formato ignoto', () => {
    expect(() => openImportFile(new Uint8Array([9, 9, 9, 9]), 'misterioso.bin'))
      .toThrow(UnsupportedFileError);
    expect(() => openImportFile(new Uint8Array([9, 9, 9, 9]), 'misterioso.bin'))
      .toThrow(/MIDI.*MusicXML/s);
  });
});
