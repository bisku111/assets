import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * La regola di dipendenza, verificata invece che raccomandata.
 *
 * Il core e' TypeScript puro: motore, DSP, punteggio e maestro non
 * devono conoscere React, React Native, Expo ne' gli adapter. E' quello
 * che permette di eseguirli in Node in un secondo e di sostituire una
 * sorgente di ingresso senza toccare la logica.
 *
 * Una regola scritta solo nella documentazione viene violata al primo
 * "faccio in fretta". Questo test la rende impossibile da violare per
 * distrazione.
 */

const CORE_DIR = __dirname;
const VIETATI = [/^react$/, /^react-native/, /^expo/, /^@react-native/, /^@supabase/, /\.\.\/adapters/];

function fileTypeScript(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return fileTypeScript(full);
    return entry.endsWith('.ts') && !entry.endsWith('.test.ts') ? [full] : [];
  });
}

function importsDi(contenuto: string): string[] {
  const risultato: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)[^'"\n]*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(contenuto)) !== null) risultato.push(match[1] as string);
  return risultato;
}

describe('regola di dipendenza del core', () => {
  const file = fileTypeScript(CORE_DIR);

  it('trova i file del core da controllare', () => {
    expect(file.length).toBeGreaterThan(10);
  });

  it('nessun file del core importa React, React Native, Expo, Supabase o gli adapter', () => {
    const violazioni: string[] = [];
    for (const percorso of file) {
      for (const modulo of importsDi(readFileSync(percorso, 'utf8'))) {
        if (VIETATI.some((pattern) => pattern.test(modulo))) {
          violazioni.push(`${percorso.replace(CORE_DIR, 'src/core')} importa "${modulo}"`);
        }
      }
    }
    expect(violazioni).toEqual([]);
  });

  it('il core non usa API del browser che su React Native non esistono', () => {
    // `document` e `window` non esistono su iOS/Android: usarli nel core
    // significherebbe un crash a runtime solo su mobile, cioe' il tipo di
    // errore che sfugge a chi sviluppa guardando il browser.
    const violazioni: string[] = [];
    for (const percorso of file) {
      if (/\b(document|window|localStorage)\s*\./.test(readFileSync(percorso, 'utf8'))) {
        violazioni.push(percorso.replace(CORE_DIR, 'src/core'));
      }
    }
    expect(violazioni).toEqual([]);
  });
});
