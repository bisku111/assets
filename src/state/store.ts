import { useCallback, useSyncExternalStore } from 'react';

/**
 * Store minimale.
 *
 * Non si usa una libreria di stato perche' qui ne basta meno di cento
 * righe, e perche' il tutorial aggiorna a 60 fps: serve poter leggere
 * una fetta sola dello stato senza ri-renderizzare l'albero. Questo e'
 * esattamente cio' che `useSyncExternalStore` con un selettore fa, senza
 * aggiungere una dipendenza.
 */

export interface Store<S> {
  getState(): S;
  setState(updater: Partial<S> | ((current: S) => Partial<S>)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    setState(updater) {
      const patch = typeof updater === 'function' ? updater(state) : updater;
      const next = { ...state, ...patch };
      // Nessun cambiamento effettivo = nessuna notifica: evita i render
      // inutili quando si riscrive lo stesso valore.
      if (shallowEqual(state, next)) return;
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Legge una fetta dello store e ri-renderizza solo quando quella cambia. */
export function useStore<S extends object, T>(store: Store<S>, selector: (state: S) => T): T {
  const getSnapshot = useCallback(() => selector(store.getState()), [store, selector]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

function shallowEqual<T extends object>(a: T, b: T): boolean {
  const keysA = Object.keys(a) as Array<keyof T>;
  const keysB = Object.keys(b) as Array<keyof T>;
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => Object.is(a[key], b[key]));
}
