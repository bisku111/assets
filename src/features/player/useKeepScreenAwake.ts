import { useEffect } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

/**
 * Tiene acceso lo schermo durante una lezione.
 *
 * Non si usa `useKeepAwake` di expo-keep-awake perche' su web il blocco
 * dello schermo e' asincrono: uscendo dal tutorial prima che si sia
 * attivato, la disattivazione fallisce con un errore non gestito
 * ("the wake lock has not activated yet") che finisce in console e, in
 * produzione, in qualunque sistema di raccolta errori.
 *
 * Qui l'errore si ignora di proposito: uno schermo che si spegne e' un
 * fastidio, un errore mostrato all'utente e' peggio, e non c'e' nulla
 * che lui possa farci.
 */
export function useKeepScreenAwake(tag = 'maestro-lezione'): void {
  useEffect(() => {
    let attivo = true;

    void activateKeepAwakeAsync(tag).catch(() => undefined);

    return () => {
      attivo = false;
      void Promise.resolve(deactivateKeepAwake(tag)).catch(() => undefined);
      void attivo;
    };
  }, [tag]);
}
